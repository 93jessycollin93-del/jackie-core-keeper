import { VfsNode, VfsNodeType, VfsSettings } from "./types";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "js", "jsx", "ts", "tsx", "css", "scss", "html", "htm",
  "xml", "svg", "yml", "yaml", "toml", "ini", "csv", "tsv", "log", "sh", "bash", "py",
  "rb", "go", "rs", "java", "c", "h", "cpp", "hpp", "sql", "env", "gitignore", "conf",
]);

const MIME_BY_EXT: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", json: "application/json", js: "text/javascript",
  ts: "text/typescript", css: "text/css", html: "text/html", htm: "text/html",
  xml: "application/xml", svg: "image/svg+xml", csv: "text/csv", yml: "text/yaml",
  yaml: "text/yaml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", pdf: "application/pdf", zip: "application/zip",
  mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav",
};

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function guessMime(name: string): string {
  return MIME_BY_EXT[extOf(name)] || "application/octet-stream";
}

export function isTextName(name: string): boolean {
  const ext = extOf(name);
  return ext === "" || TEXT_EXTENSIONS.has(ext) || (MIME_BY_EXT[ext] || "").startsWith("text/");
}

export function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return text.length;
}

export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/=+$/, "");
  return Math.floor(clean.length * 3 / 4);
}

export function contentSize(content: string, encoding: "utf8" | "base64"): number {
  return encoding === "base64" ? base64ByteLength(content) : utf8ByteLength(content);
}

export function sanitizeName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[/\\\u0000-\u001f\u007f]/g, "").trim();
  return cleaned || "untitled";
}

export function createNode(partial: Partial<VfsNode> & { name: string; type: VfsNodeType }): VfsNode {
  const now = Date.now();
  const encoding = partial.encoding ?? "utf8";
  const content = partial.type === "folder" ? "" : (partial.content ?? "");
  return {
    id: partial.id ?? uid(),
    parentId: partial.parentId ?? null,
    type: partial.type,
    name: sanitizeName(partial.name),
    content,
    encoding,
    mime: partial.mime ?? (partial.type === "folder" ? "inode/directory" : guessMime(partial.name)),
    size: partial.type === "folder" ? 0 : contentSize(content, encoding),
    color: partial.color ?? null,
    icon: partial.icon ?? null,
    tags: partial.tags ?? [],
    starred: partial.starred ?? false,
    locked: partial.locked ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function childrenOf(nodes: VfsNode[], parentId: string | null): VfsNode[] {
  return nodes.filter(n => n.parentId === parentId);
}

/** All descendant ids of a node (not including itself). */
export function descendantIds(nodes: VfsNode[], id: string): string[] {
  const byParent = new Map<string | null, VfsNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of byParent.get(cur) ?? []) {
      out.push(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

/** True if `maybeDescendant` is inside the subtree rooted at `ancestorId` (or is it). */
export function isSelfOrDescendant(nodes: VfsNode[], ancestorId: string, maybeDescendant: string): boolean {
  if (ancestorId === maybeDescendant) return true;
  const byId = new Map(nodes.map(n => [n.id, n]));
  let cur = byId.get(maybeDescendant);
  const seen = new Set<string>();
  while (cur && cur.parentId !== null) {
    if (seen.has(cur.id)) return false; // corrupt cycle guard
    seen.add(cur.id);
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

/** Full path like "docs/notes/todo.txt". */
export function pathOf(nodes: VfsNode[], id: string): string {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const parts: string[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join("/");
}

/** Breadcrumb chain of nodes from root to the given folder id. */
export function crumbsOf(nodes: VfsNode[], id: string | null): VfsNode[] {
  if (!id) return [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const chain: VfsNode[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/** Resolve a name collision inside a folder: "report.txt" -> "report (2).txt". */
export function uniqueName(nodes: VfsNode[], parentId: string | null, desired: string, excludeId?: string): string {
  const siblings = new Set(
    nodes.filter(n => n.parentId === parentId && n.id !== excludeId).map(n => n.name.toLowerCase()),
  );
  const clean = sanitizeName(desired);
  if (!siblings.has(clean.toLowerCase())) return clean;
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!siblings.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem}-${uid().slice(0, 8)}${ext}`;
}

export function sortNodes(list: VfsNode[], settings: Pick<VfsSettings, "sortBy" | "sortDir" | "foldersFirst">): VfsNode[] {
  const dir = settings.sortDir === "asc" ? 1 : -1;
  const sorted = [...list].sort((a, b) => {
    if (settings.foldersFirst && a.type !== b.type) return a.type === "folder" ? -1 : 1;
    switch (settings.sortBy) {
      case "size": return (a.size - b.size) * dir || a.name.localeCompare(b.name);
      case "updated": return (a.updatedAt - b.updatedAt) * dir || a.name.localeCompare(b.name);
      case "created": return (a.createdAt - b.createdAt) * dir || a.name.localeCompare(b.name);
      case "type": return (extOf(a.name).localeCompare(extOf(b.name)) || a.name.localeCompare(b.name)) * dir;
      default: return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * dir;
    }
  });
  return sorted;
}

/** Deep-copy a subtree under a new parent, regenerating every id. Returns the new nodes. */
export function duplicateSubtree(nodes: VfsNode[], rootId: string, newParentId: string | null, newName?: string): VfsNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const root = byId.get(rootId);
  if (!root) return [];
  const idMap = new Map<string, string>();
  const ids = [rootId, ...descendantIds(nodes, rootId)];
  for (const oldId of ids) idMap.set(oldId, uid());
  const now = Date.now();
  return ids.map(oldId => {
    const src = byId.get(oldId)!;
    const isRoot = oldId === rootId;
    return {
      ...src,
      id: idMap.get(oldId)!,
      parentId: isRoot ? newParentId : idMap.get(src.parentId!)!,
      name: isRoot && newName ? newName : src.name,
      locked: false,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export interface VfsStats {
  files: number;
  folders: number;
  bytes: number;
}

export function computeStats(nodes: VfsNode[]): VfsStats {
  let files = 0, folders = 0, bytes = 0;
  for (const n of nodes) {
    if (n.type === "folder") folders++;
    else { files++; bytes += n.size; }
  }
  return { files, folders, bytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes, u = -1;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export interface SearchHit {
  node: VfsNode;
  path: string;
  matchedContent: boolean;
}

export function searchNodes(nodes: VfsNode[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tagQuery = q.startsWith("#") ? q.slice(1) : null;
  const hits: SearchHit[] = [];
  for (const n of nodes) {
    if (tagQuery !== null) {
      if (n.tags.some(t => t.toLowerCase().includes(tagQuery))) {
        hits.push({ node: n, path: pathOf(nodes, n.id), matchedContent: false });
      }
      continue;
    }
    const nameHit = n.name.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q));
    const contentHit = !nameHit && n.type === "file" && n.encoding === "utf8" &&
      n.content.toLowerCase().includes(q);
    if (nameHit || contentHit) {
      hits.push({ node: n, path: pathOf(nodes, n.id), matchedContent: contentHit });
    }
  }
  return hits.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 200);
}

/** Drop nodes whose parent chain is broken (orphans) — keeps the store consistent. */
export function pruneOrphans(nodes: VfsNode[]): VfsNode[] {
  const ids = new Set(nodes.map(n => n.id));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const ok = new Map<string, boolean>();
  const reachable = (n: VfsNode): boolean => {
    if (ok.has(n.id)) return ok.get(n.id)!;
    ok.set(n.id, true); // provisional (cycle guard: treat as reachable, cycle members dropped below)
    let good: boolean;
    if (n.parentId === null) good = true;
    else if (!ids.has(n.parentId)) good = false;
    else good = reachable(byId.get(n.parentId)!);
    ok.set(n.id, good);
    return good;
  };
  return nodes.filter(n => reachable(n));
}
