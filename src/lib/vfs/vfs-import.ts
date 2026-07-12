import { CollisionPolicy, ImportMode, VfsNode } from "./types";
import {
  contentSize, createNode, descendantIds, guessMime, isTextName, sanitizeName, uid, uniqueName,
} from "./vfs-core";
import { EXPORT_FORMAT_ID } from "./vfs-export";

export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024; // per-file cap for real-file imports

export interface ImportResult {
  nodes: VfsNode[];
  skipped: string[];
}

// ---------------------------------------------------------------------------
// JSON import — accepts several shapes:
//  1. Native export           { format: "jackie-vfs", version, nodes: [...] }
//  2. Bare node array         [ { name, type, parentId?, content? }, ... ]
//  3. Nested tree (legacy)    { name, type: "folder", children: [...] }  or  { root: {...} } / array of them
// ---------------------------------------------------------------------------

type RawRecord = Record<string, unknown>;

function coerceNode(raw: RawRecord, fallbackParent: string | null): VfsNode | null {
  const name = typeof raw.name === "string" ? raw.name : typeof raw.title === "string" ? raw.title : null;
  if (!name) return null;
  const rawType = raw.type ?? raw.kind;
  const looksFolder = rawType === "folder" || rawType === "directory" || rawType === "dir" || Array.isArray(raw.children);
  const encoding = raw.encoding === "base64" ? "base64" : "utf8";
  const content = typeof raw.content === "string" ? raw.content : typeof raw.text === "string" ? raw.text : "";
  return createNode({
    id: typeof raw.id === "string" ? raw.id : undefined,
    parentId: typeof raw.parentId === "string" ? raw.parentId : fallbackParent,
    type: looksFolder ? "folder" : "file",
    name,
    content,
    encoding,
    mime: typeof raw.mime === "string" ? raw.mime : undefined,
    color: typeof raw.color === "string" ? raw.color : null,
    icon: typeof raw.icon === "string" ? raw.icon : null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
    starred: raw.starred === true,
    locked: raw.locked === true,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : undefined,
  });
}

function flattenNestedTree(raw: RawRecord, parentId: string | null, out: VfsNode[]): void {
  const node = coerceNode(raw, parentId);
  if (!node) return;
  node.parentId = parentId;
  out.push(node);
  if (Array.isArray(raw.children)) {
    for (const child of raw.children) {
      if (child && typeof child === "object") flattenNestedTree(child as RawRecord, node.id, out);
    }
  }
}

/** Regenerate every id (imports must never collide with existing ids) while preserving structure. */
export function remapIds(nodes: VfsNode[]): VfsNode[] {
  const idMap = new Map<string, string>();
  for (const n of nodes) idMap.set(n.id, uid());
  return nodes.map(n => ({
    ...n,
    id: idMap.get(n.id)!,
    parentId: n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId)! : null,
  }));
}

export function parseJsonImport(text: string): VfsNode[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON. Paste or select a vault export, a node array, or a nested tree.");
  }

  const out: VfsNode[] = [];

  if (Array.isArray(data)) {
    const arr = data.filter((x): x is RawRecord => !!x && typeof x === "object");
    const hasNesting = arr.some(x => Array.isArray(x.children));
    if (hasNesting) {
      for (const item of arr) flattenNestedTree(item, null, out);
    } else {
      for (const item of arr) {
        const n = coerceNode(item, null);
        if (n) out.push(n);
      }
    }
  } else if (data && typeof data === "object") {
    const obj = data as RawRecord;
    if (obj.format === EXPORT_FORMAT_ID && Array.isArray(obj.nodes)) {
      for (const item of obj.nodes as RawRecord[]) {
        const n = coerceNode(item, null);
        if (n) out.push(n);
      }
    } else if (Array.isArray(obj.nodes)) {
      for (const item of obj.nodes as RawRecord[]) {
        const n = coerceNode(item, null);
        if (n) out.push(n);
      }
    } else if (obj.root && typeof obj.root === "object") {
      flattenNestedTree(obj.root as RawRecord, null, out);
    } else if (typeof obj.name === "string") {
      flattenNestedTree(obj, null, out);
    } else if (Array.isArray(obj.items)) {
      for (const item of obj.items as RawRecord[]) flattenNestedTree(item, null, out);
    }
  }

  if (out.length === 0) throw new Error("No files or folders found in that JSON.");

  // Fix dangling parent pointers, then give everything fresh ids.
  const ids = new Set(out.map(n => n.id));
  for (const n of out) if (n.parentId && !ids.has(n.parentId)) n.parentId = null;
  return remapIds(out);
}

// ---------------------------------------------------------------------------
// Real-file imports (file picker, folder picker, drag & drop)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fileToNode(file: File, parentId: string | null): Promise<VfsNode | null> {
  if (file.size > MAX_IMPORT_FILE_BYTES) return null;
  const textLike = isTextName(file.name) || (file.type || "").startsWith("text/");
  if (textLike) {
    const content = await file.text();
    return createNode({
      parentId, type: "file", name: file.name, content, encoding: "utf8",
      mime: file.type || guessMime(file.name),
    });
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  return createNode({
    parentId, type: "file", name: file.name, content: bytesToBase64(buf), encoding: "base64",
    mime: file.type || guessMime(file.name),
  });
}

/** Build folder nodes for a path like "a/b" on demand; returns the leaf folder id. */
function ensureFolderPath(
  segments: string[],
  rootParent: string | null,
  folderCache: Map<string, string>,
  out: VfsNode[],
): string | null {
  let parent = rootParent;
  let keyPrefix = rootParent ?? "@root";
  for (const seg of segments) {
    const clean = sanitizeName(seg);
    keyPrefix += "/" + clean.toLowerCase();
    const existing = folderCache.get(keyPrefix);
    if (existing) {
      parent = existing;
    } else {
      const folder = createNode({ parentId: parent, type: "folder", name: clean });
      out.push(folder);
      folderCache.set(keyPrefix, folder.id);
      parent = folder.id;
    }
  }
  return parent;
}

/**
 * Import File objects. Honors webkitRelativePath (folder picker) so directory
 * structure is recreated. Files over the size cap are reported in `skipped`.
 */
export async function nodesFromFileList(files: File[], targetFolderId: string | null): Promise<ImportResult> {
  const out: VfsNode[] = [];
  const skipped: string[] = [];
  const folderCache = new Map<string, string>();
  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const segments = rel ? rel.split("/").filter(Boolean) : [file.name];
    const dirSegments = segments.slice(0, -1);
    const parent = ensureFolderPath(dirSegments, targetFolderId, folderCache, out);
    const node = await fileToNode(file, parent);
    if (node) out.push(node);
    else skipped.push(rel || file.name);
  }
  return { nodes: out, skipped };
}

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader: () => {
    readEntries: (ok: (entries: EntryLike[]) => void, err: (e: unknown) => void) => void;
  };
}

async function walkEntry(
  entry: EntryLike,
  parentId: string | null,
  out: VfsNode[],
  skipped: string[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    const node = await fileToNode(file, parentId);
    if (node) out.push(node);
    else skipped.push(entry.name);
    return;
  }
  if (entry.isDirectory) {
    const folder = createNode({ parentId, type: "folder", name: entry.name });
    out.push(folder);
    const reader = entry.createReader();
    // readEntries returns batches of ≤100; loop until empty
    for (;;) {
      const batch = await new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, folder.id, out, skipped);
    }
  }
}

/** Recursive import from a drag & drop DataTransfer — supports whole folders. */
export async function nodesFromDataTransfer(dt: DataTransfer, targetFolderId: string | null): Promise<ImportResult> {
  const out: VfsNode[] = [];
  const skipped: string[] = [];
  const items = Array.from(dt.items || []);
  const entries = items
    .map(item => (item.webkitGetAsEntry ? (item.webkitGetAsEntry() as unknown as EntryLike | null) : null))
    .filter((e): e is EntryLike => !!e);

  if (entries.length > 0) {
    for (const entry of entries) await walkEntry(entry, targetFolderId, out, skipped);
    return { nodes: out, skipped };
  }
  // Fallback: plain file list (no folder support)
  return nodesFromFileList(Array.from(dt.files || []), targetFolderId);
}

// ---------------------------------------------------------------------------
// ZIP import — parses central directory; inflates via DecompressionStream.
// ---------------------------------------------------------------------------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can't decompress ZIP entries (DecompressionStream unavailable).");
  }
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const writePromise = writer.write(data as BufferSource).then(() => writer.close());
  writePromise.catch(() => { /* surfaced via the read loop / final await */ });
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await writePromise;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export interface ZipReadEntry {
  path: string;
  isDirectory: boolean;
  data: Uint8Array;
}

export async function readZip(buffer: ArrayBuffer): Promise<ZipReadEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find End Of Central Directory (scan backwards past any zip comment)
  let eocd = -1;
  const minEocd = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a ZIP archive (no central directory found).");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipReadEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

    // Local header: re-read name/extra lengths (can differ from central directory)
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.slice(dataStart, dataStart + compSize);

    const isDirectory = path.endsWith("/");
    if (!isDirectory && method !== 0 && method !== 8) {
      throw new Error(`Unsupported ZIP compression method ${method} for "${path}".`);
    }
    const data = isDirectory || compSize === 0
      ? new Uint8Array(0)
      : method === 0 ? raw : await inflateRaw(raw);

    entries.push({ path, isDirectory, data });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function nodesFromZip(buffer: ArrayBuffer, targetFolderId: string | null): Promise<ImportResult> {
  const entries = await readZip(buffer);
  const out: VfsNode[] = [];
  const skipped: string[] = [];
  const folderCache = new Map<string, string>();
  const decoder = new TextDecoder();

  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    if (entry.isDirectory) {
      ensureFolderPath(segments, targetFolderId, folderCache, out);
      continue;
    }
    if (entry.data.length > MAX_IMPORT_FILE_BYTES) {
      skipped.push(entry.path);
      continue;
    }
    const parent = ensureFolderPath(segments.slice(0, -1), targetFolderId, folderCache, out);
    const name = segments[segments.length - 1];
    if (isTextName(name)) {
      out.push(createNode({ parentId: parent, type: "file", name, content: decoder.decode(entry.data), encoding: "utf8" }));
    } else {
      out.push(createNode({ parentId: parent, type: "file", name, content: bytesToBase64(entry.data), encoding: "base64" }));
    }
  }
  return { nodes: out, skipped };
}

// ---------------------------------------------------------------------------
// Merge — how incoming nodes join the existing tree.
// ---------------------------------------------------------------------------

export interface MergePlan {
  /** The resulting full node list. */
  nodes: VfsNode[];
  added: number;
  overwritten: number;
  skippedCollisions: number;
}

/**
 * Merge `incoming` (a self-contained forest with fresh ids) into `existing`.
 *
 * mode "replace": incoming becomes the entire vault (existing is discarded).
 * mode "merge":   incoming roots land in `targetFolderId`; name collisions at
 *                 that level follow `collision` (rename / overwrite / skip).
 *                 Overwrite replaces the colliding node and its whole subtree.
 */
export function mergeImport(
  existing: VfsNode[],
  incoming: VfsNode[],
  mode: ImportMode,
  collision: CollisionPolicy,
  targetFolderId: string | null,
): MergePlan {
  if (mode === "replace") {
    const roots = incoming.map(n => (n.parentId === null ? { ...n } : n));
    return { nodes: roots, added: incoming.length, overwritten: 0, skippedCollisions: 0 };
  }

  let nodes = [...existing];
  let added = 0, overwritten = 0, skippedCollisions = 0;
  const incomingRoots = incoming.filter(n => n.parentId === null);
  const incomingChildren = incoming.filter(n => n.parentId !== null);
  const keptRootIds = new Set<string>();

  for (const root of incomingRoots) {
    const collide = nodes.find(
      n => n.parentId === targetFolderId && n.name.toLowerCase() === root.name.toLowerCase(),
    );
    if (collide) {
      if (collision === "skip") { skippedCollisions++; continue; }
      if (collision === "overwrite") {
        const doomed = new Set([collide.id, ...descendantIds(nodes, collide.id)]);
        nodes = nodes.filter(n => !doomed.has(n.id));
        overwritten++;
      } else {
        root.name = uniqueName(nodes, targetFolderId, root.name);
      }
    }
    keptRootIds.add(root.id);
    nodes.push({ ...root, parentId: targetFolderId });
    added++;
  }

  // Children ride along only if their root survived the collision policy.
  const kept = new Set(keptRootIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const child of incomingChildren) {
      if (!kept.has(child.id) && child.parentId && kept.has(child.parentId)) {
        kept.add(child.id);
        grew = true;
      }
    }
  }
  for (const child of incomingChildren) {
    if (kept.has(child.id)) {
      nodes.push(child);
      added++;
    }
  }

  return { nodes, added, overwritten, skippedCollisions };
}

/** Normalize sizes after any import (defensive: recompute from content). */
export function normalizeSizes(nodes: VfsNode[]): VfsNode[] {
  return nodes.map(n =>
    n.type === "file" ? { ...n, size: contentSize(n.content, n.encoding) } : { ...n, size: 0, content: "" },
  );
}
