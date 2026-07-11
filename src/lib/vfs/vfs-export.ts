import { VfsNode } from "./types";
import { childrenOf, computeStats, descendantIds, formatBytes, pathOf, sortNodes } from "./vfs-core";

export const EXPORT_FORMAT_ID = "jackie-vfs";
export const EXPORT_VERSION = 2;

export interface JsonExportOptions {
  /** Restrict the export to these node ids (each with its whole subtree). Omit = everything. */
  scopeIds?: string[];
  includeContent: boolean;
  pretty: boolean;
}

/** Expand scope roots into the full set of nodes to export (roots + descendants, deduped). */
export function resolveScope(nodes: VfsNode[], scopeIds?: string[]): VfsNode[] {
  if (!scopeIds || scopeIds.length === 0) return nodes;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const keep = new Set<string>();
  for (const id of scopeIds) {
    if (!byId.has(id)) continue;
    keep.add(id);
    for (const d of descendantIds(nodes, id)) keep.add(d);
  }
  // Re-root: scoped roots lose their parent pointer if the parent is outside the scope.
  return nodes
    .filter(n => keep.has(n.id))
    .map(n => (n.parentId && keep.has(n.parentId) ? n : { ...n, parentId: null }));
}

export function toJsonExport(nodes: VfsNode[], opts: JsonExportOptions): string {
  const scoped = resolveScope(nodes, opts.scopeIds);
  const stats = computeStats(scoped);
  const payload = {
    format: EXPORT_FORMAT_ID,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Jackie",
    stats: { files: stats.files, folders: stats.folders, bytes: stats.bytes },
    nodes: scoped.map(n => ({
      ...n,
      content: opts.includeContent ? n.content : "",
    })),
  };
  return JSON.stringify(payload, null, opts.pretty ? 2 : 0);
}

export interface TreeTextOptions {
  scopeIds?: string[];
  showSizes: boolean;
}

/** Render an ASCII tree like the unix `tree` command. */
export function toTreeText(nodes: VfsNode[], opts: TreeTextOptions): string {
  const scoped = resolveScope(nodes, opts.scopeIds);
  const sortCfg = { sortBy: "name" as const, sortDir: "asc" as const, foldersFirst: true };
  const lines: string[] = ["."];
  const walk = (parentId: string | null, prefix: string) => {
    const kids = sortNodes(childrenOf(scoped, parentId), sortCfg);
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1;
      const branch = last ? "└── " : "├── ";
      const size = opts.showSizes && kid.type === "file" ? `  [${formatBytes(kid.size)}]` : "";
      const slash = kid.type === "folder" ? "/" : "";
      lines.push(`${prefix}${branch}${kid.name}${slash}${size}`);
      if (kid.type === "folder") walk(kid.id, prefix + (last ? "    " : "│   "));
    });
  };
  walk(null, "");
  const stats = computeStats(scoped);
  lines.push("", `${stats.folders} folders, ${stats.files} files, ${formatBytes(stats.bytes)}`);
  return lines.join("\n");
}

export interface MarkdownOptions {
  scopeIds?: string[];
  includeContent: boolean;
}

export function toMarkdown(nodes: VfsNode[], opts: MarkdownOptions): string {
  const scoped = resolveScope(nodes, opts.scopeIds);
  const sortCfg = { sortBy: "name" as const, sortDir: "asc" as const, foldersFirst: true };
  const out: string[] = ["# Vault export", ""];
  const walk = (parentId: string | null, depth: number) => {
    for (const kid of sortNodes(childrenOf(scoped, parentId), sortCfg)) {
      const indent = "  ".repeat(depth);
      if (kid.type === "folder") {
        out.push(`${indent}- 📁 **${kid.name}/**`);
        walk(kid.id, depth + 1);
      } else {
        const tags = kid.tags.length ? ` \`#${kid.tags.join("` `#")}\`` : "";
        out.push(`${indent}- 📄 ${kid.name} (${formatBytes(kid.size)})${tags}`);
        if (opts.includeContent && kid.encoding === "utf8" && kid.content.trim()) {
          out.push("");
          out.push(`${indent}  \`\`\``);
          for (const line of kid.content.split("\n")) out.push(`${indent}  ${line}`);
          out.push(`${indent}  \`\`\``);
          out.push("");
        }
      }
    }
  };
  walk(null, 0);
  return out.join("\n");
}

export function toCsvManifest(nodes: VfsNode[], scopeIds?: string[]): string {
  const scoped = resolveScope(nodes, scopeIds);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = ["path,type,size_bytes,mime,tags,starred,created,updated"];
  const sorted = [...scoped].sort((a, b) => pathOf(scoped, a.id).localeCompare(pathOf(scoped, b.id)));
  for (const n of sorted) {
    rows.push([
      esc(pathOf(scoped, n.id) + (n.type === "folder" ? "/" : "")),
      n.type,
      String(n.size),
      esc(n.mime),
      esc(n.tags.join(";")),
      n.starred ? "1" : "0",
      new Date(n.createdAt).toISOString(),
      new Date(n.updatedAt).toISOString(),
    ].join(","));
  }
  return rows.join("\n");
}

// ---------------------------------------------------------------------------
// ZIP writer — store-only (method 0), no dependencies. Readable by any unzip.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(ms: number): { date: number; time: number } {
  const d = new Date(ms);
  const year = Math.max(1980, d.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

export interface ZipEntry {
  /** Forward-slash path. Directories must end with "/". */
  path: string;
  data: Uint8Array;
  mtime: number;
}

/** Build a ZIP archive (stored, uncompressed) from entries. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const { date, time } = dosDateTime(entry.mtime);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);       // local file header signature
    lv.setUint16(4, 20, true);               // version needed
    lv.setUint16(6, 0x0800, true);           // flags: UTF-8 names
    lv.setUint16(8, 0, true);                // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);               // extra length
    local.set(nameBytes, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);       // central directory signature
    cv.setUint16(4, 20, true);               // version made by
    cv.setUint16(6, 20, true);               // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(38, entry.path.endsWith("/") ? 0x10 : 0, true); // dir attribute
    cv.setUint32(42, offset, true);          // local header offset
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);         // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Convert VFS nodes to zip entries (folders become directory entries so empty dirs survive). */
export function zipEntriesFromNodes(nodes: VfsNode[], scopeIds?: string[]): ZipEntry[] {
  const scoped = resolveScope(nodes, scopeIds);
  const entries: ZipEntry[] = [];
  for (const n of scoped) {
    const path = pathOf(scoped, n.id);
    if (!path) continue;
    if (n.type === "folder") {
      entries.push({ path: path + "/", data: new Uint8Array(0), mtime: n.updatedAt });
    } else {
      const data = n.encoding === "base64" ? base64ToBytes(n.content) : new TextEncoder().encode(n.content);
      entries.push({ path, data, mtime: n.updatedAt });
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function timestampName(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

/** Download a single VFS file as a real file. */
export function downloadNodeFile(node: VfsNode): void {
  const blob = node.encoding === "base64"
    ? new Blob([base64ToBytes(node.content) as unknown as BlobPart], { type: node.mime })
    : new Blob([node.content], { type: node.mime || "text/plain" });
  downloadBlob(node.name, blob);
}
