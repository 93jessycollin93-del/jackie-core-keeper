import { describe, expect, it } from "vitest";
import { VfsNode } from "@/lib/vfs/types";
import {
  computeStats, descendantIds, duplicateSubtree, formatBytes, isSelfOrDescendant,
  pathOf, pruneOrphans, sanitizeName, searchNodes, sortNodes, uniqueName, createNode,
} from "@/lib/vfs/vfs-core";
import {
  buildZip, crc32, resolveScope, toCsvManifest, toJsonExport, toTreeText, zipEntriesFromNodes,
} from "@/lib/vfs/vfs-export";
import { mergeImport, normalizeSizes, parseJsonImport, readZip, remapIds } from "@/lib/vfs/vfs-import";

const folder = (name: string, parentId: string | null = null, extra: Partial<VfsNode> = {}) =>
  createNode({ type: "folder", name, parentId, ...extra });
const file = (name: string, parentId: string | null = null, content = "", extra: Partial<VfsNode> = {}) =>
  createNode({ type: "file", name, parentId, content, ...extra });

/** docs/ { notes.txt, sub/ { deep.md } }, root.txt */
function fixture() {
  const docs = folder("docs");
  const notes = file("notes.txt", docs.id, "hello world");
  const sub = folder("sub", docs.id);
  const deep = file("deep.md", sub.id, "# deep");
  const root = file("root.txt", null, "top");
  return { docs, notes, sub, deep, root, all: [docs, notes, sub, deep, root] };
}

describe("vfs-core", () => {
  it("sanitizes names but keeps spaces", () => {
    expect(sanitizeName("a/b\\c")).toBe("abc");
    expect(sanitizeName("  hello world  ")).toBe("hello world");
    expect(sanitizeName("///")).toBe("untitled");
  });

  it("resolves unique names with (n) suffix before the extension", () => {
    const { all, docs } = fixture();
    expect(uniqueName(all, docs.id, "new.txt")).toBe("new.txt");
    expect(uniqueName(all, docs.id, "notes.txt")).toBe("notes (2).txt");
    expect(uniqueName(all, docs.id, "NOTES.TXT")).toBe("NOTES (2).TXT");
    expect(uniqueName(all, docs.id, "sub")).toBe("sub (2)");
    // excludeId lets a node keep its own name during rename
    const { all: a2, notes: n2 } = fixture();
    expect(uniqueName(a2, n2.parentId, "notes.txt", n2.id)).toBe("notes.txt");
  });

  it("computes descendants and ancestry", () => {
    const { all, docs, notes, sub, deep, root } = fixture();
    const ids = descendantIds(all, docs.id);
    expect(new Set(ids)).toEqual(new Set([notes.id, sub.id, deep.id]));
    expect(isSelfOrDescendant(all, docs.id, deep.id)).toBe(true);
    expect(isSelfOrDescendant(all, docs.id, docs.id)).toBe(true);
    expect(isSelfOrDescendant(all, docs.id, root.id)).toBe(false);
    expect(isSelfOrDescendant(all, deep.id, docs.id)).toBe(false);
  });

  it("builds full paths", () => {
    const { all, deep } = fixture();
    expect(pathOf(all, deep.id)).toBe("docs/sub/deep.md");
  });

  it("duplicates a subtree with fresh ids and intact structure", () => {
    const { all, docs } = fixture();
    const copies = duplicateSubtree(all, docs.id, null, "docs copy");
    expect(copies).toHaveLength(4);
    const copyRoot = copies.find(c => c.parentId === null)!;
    expect(copyRoot.name).toBe("docs copy");
    const oldIds = new Set(all.map(n => n.id));
    for (const c of copies) expect(oldIds.has(c.id)).toBe(false);
    const merged = [...all, ...copies];
    const deepCopy = copies.find(c => c.name === "deep.md")!;
    expect(pathOf(merged, deepCopy.id)).toBe("docs copy/sub/deep.md");
  });

  it("sorts folders first with numeric-aware names", () => {
    const a = file("2.txt"), b = file("10.txt"), c = folder("zzz");
    const sorted = sortNodes([b, a, c], { sortBy: "name", sortDir: "asc", foldersFirst: true });
    expect(sorted.map(n => n.name)).toEqual(["zzz", "2.txt", "10.txt"]);
  });

  it("computes stats and formats bytes", () => {
    const { all } = fixture();
    const stats = computeStats(all);
    expect(stats.folders).toBe(2);
    expect(stats.files).toBe(3);
    expect(stats.bytes).toBe("hello world".length + "# deep".length + "top".length);
    expect(formatBytes(10)).toBe("10 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("searches names, content and #tags", () => {
    const { all } = fixture();
    const tagged = file("tagged.txt", null, "", { tags: ["urgent"] });
    const nodes = [...all, tagged];
    expect(searchNodes(nodes, "deep").map(h => h.node.name)).toContain("deep.md");
    const contentHit = searchNodes(nodes, "hello")[0];
    expect(contentHit.node.name).toBe("notes.txt");
    expect(contentHit.matchedContent).toBe(true);
    expect(searchNodes(nodes, "#urg").map(h => h.node.name)).toEqual(["tagged.txt"]);
  });

  it("prunes orphaned subtrees", () => {
    const { all, sub, deep } = fixture();
    const orphan = file("lost.txt", "no-such-parent");
    const orphanChildOfDeleted = { ...deep, parentId: "ghost" };
    const nodes = [...all.filter(n => n.id !== deep.id), orphan, orphanChildOfDeleted];
    const pruned = pruneOrphans(nodes);
    expect(pruned.find(n => n.name === "lost.txt")).toBeUndefined();
    expect(pruned.find(n => n.id === orphanChildOfDeleted.id)).toBeUndefined();
    expect(pruned.find(n => n.id === sub.id)).toBeDefined();
  });
});

describe("vfs-export", () => {
  it("JSON export → import roundtrip preserves structure and content", () => {
    const { all } = fixture();
    const json = toJsonExport(all, { includeContent: true, pretty: false });
    const imported = parseJsonImport(json);
    expect(imported).toHaveLength(all.length);
    const deep = imported.find(n => n.name === "deep.md")!;
    expect(deep.content).toBe("# deep");
    expect(pathOf(imported, deep.id)).toBe("docs/sub/deep.md");
    // ids must be regenerated on import
    const oldIds = new Set(all.map(n => n.id));
    for (const n of imported) expect(oldIds.has(n.id)).toBe(false);
  });

  it("can exclude content from JSON export", () => {
    const { all } = fixture();
    const json = toJsonExport(all, { includeContent: false, pretty: false });
    const parsed = JSON.parse(json);
    for (const n of parsed.nodes) expect(n.content).toBe("");
  });

  it("scopes exports to a subtree and re-roots it", () => {
    const { all, sub, deep } = fixture();
    const scoped = resolveScope(all, [sub.id]);
    expect(scoped.map(n => n.id).sort()).toEqual([sub.id, deep.id].sort());
    expect(scoped.find(n => n.id === sub.id)!.parentId).toBeNull();
  });

  it("renders an ASCII tree", () => {
    const { all } = fixture();
    const tree = toTreeText(all, { showSizes: false });
    expect(tree).toContain("├── docs/");
    expect(tree).toContain("│   ├── sub/"); // folders sort first inside docs
    expect(tree).toContain("│   │   └── deep.md");
    expect(tree).toContain("│   └── notes.txt");
    expect(tree).toContain("└── root.txt");
    expect(tree).toContain("2 folders, 3 files");
  });

  it("renders a CSV manifest", () => {
    const { all } = fixture();
    const csv = toCsvManifest(all);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("path,type,size_bytes,mime,tags,starred,created,updated");
    expect(lines).toHaveLength(all.length + 1);
    expect(csv).toContain('"docs/sub/deep.md"');
  });

  it("computes the reference CRC32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("ZIP build → read roundtrip preserves paths and bytes", async () => {
    const { all } = fixture();
    const entries = zipEntriesFromNodes(all);
    const zip = buildZip(entries);
    const back = await readZip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer);
    expect(back.map(e => e.path).sort()).toEqual(entries.map(e => e.path).sort());
    const deepEntry = back.find(e => e.path === "docs/sub/deep.md")!;
    expect(new TextDecoder().decode(deepEntry.data)).toBe("# deep");
    const dirEntry = back.find(e => e.path === "docs/");
    expect(dirEntry?.isDirectory).toBe(true);
  });
});

describe("vfs-import", () => {
  it("accepts a nested {name,type,children} legacy tree", () => {
    const legacy = JSON.stringify({
      name: "root",
      type: "folder",
      children: [
        { name: "a.txt", type: "file", content: "aaa" },
        { name: "inner", type: "folder", children: [{ name: "b.txt", content: "bbb" }] },
      ],
    });
    const nodes = parseJsonImport(legacy);
    expect(nodes).toHaveLength(4);
    const b = nodes.find(n => n.name === "b.txt")!;
    expect(pathOf(nodes, b.id)).toBe("root/inner/b.txt");
    expect(b.content).toBe("bbb");
  });

  it("accepts a bare array with parentId links and heals dangling parents", () => {
    const arr = JSON.stringify([
      { id: "f1", name: "stuff", type: "folder" },
      { id: "x1", name: "in.txt", type: "file", parentId: "f1", content: "in" },
      { id: "x2", name: "dangling.txt", type: "file", parentId: "missing" },
    ]);
    const nodes = parseJsonImport(arr);
    expect(nodes).toHaveLength(3);
    const inFile = nodes.find(n => n.name === "in.txt")!;
    expect(pathOf(nodes, inFile.id)).toBe("stuff/in.txt");
    expect(nodes.find(n => n.name === "dangling.txt")!.parentId).toBeNull();
  });

  it("rejects garbage", () => {
    expect(() => parseJsonImport("not json")).toThrow(/valid JSON/i);
    expect(() => parseJsonImport('{"foo": 1}')).toThrow(/No files or folders/i);
  });

  it("remapIds keeps structure but changes every id", () => {
    const { all, deep } = fixture();
    const remapped = remapIds(all);
    const oldIds = new Set(all.map(n => n.id));
    for (const n of remapped) expect(oldIds.has(n.id)).toBe(false);
    const newDeep = remapped.find(n => n.name === deep.name)!;
    expect(pathOf(remapped, newDeep.id)).toBe("docs/sub/deep.md");
  });

  it("merge with rename keeps both on collision", () => {
    const { all } = fixture();
    const incoming = [folder("docs"), file("root.txt", null, "new top")];
    const inDocs = file("inside.txt", incoming[0].id, "x");
    const plan = mergeImport(all, [...incoming, inDocs], "merge", "rename", null);
    const names = plan.nodes.filter(n => n.parentId === null).map(n => n.name).sort();
    expect(names).toEqual(["docs", "docs (2)", "root (2).txt", "root.txt"].sort());
    // child rides along under the renamed folder
    const renamed = plan.nodes.find(n => n.name === "docs (2)")!;
    expect(plan.nodes.find(n => n.name === "inside.txt")!.parentId).toBe(renamed.id);
    expect(plan.skippedCollisions).toBe(0);
  });

  it("merge with overwrite replaces the colliding subtree", () => {
    const { all, notes } = fixture();
    const newDocs = folder("docs");
    const fresh = file("fresh.txt", newDocs.id, "fresh");
    const plan = mergeImport(all, [newDocs, fresh], "merge", "overwrite", null);
    expect(plan.overwritten).toBe(1);
    expect(plan.nodes.find(n => n.id === notes.id)).toBeUndefined(); // old subtree gone
    const docsNow = plan.nodes.filter(n => n.name === "docs");
    expect(docsNow).toHaveLength(1);
    expect(plan.nodes.find(n => n.name === "fresh.txt")!.parentId).toBe(newDocs.id);
  });

  it("merge with skip drops colliding roots and their children", () => {
    const { all } = fixture();
    const newDocs = folder("docs");
    const child = file("child.txt", newDocs.id, "c");
    const keeper = file("keeper.txt");
    const plan = mergeImport(all, [newDocs, child, keeper], "merge", "skip", null);
    expect(plan.skippedCollisions).toBe(1);
    expect(plan.nodes.find(n => n.id === newDocs.id)).toBeUndefined();
    expect(plan.nodes.find(n => n.name === "child.txt")).toBeUndefined();
    expect(plan.nodes.find(n => n.name === "keeper.txt")).toBeDefined();
    expect(plan.added).toBe(1);
  });

  it("merge targets a destination folder", () => {
    const { all, sub } = fixture();
    const dropped = file("dropped.txt");
    const plan = mergeImport(all, [dropped], "merge", "rename", sub.id);
    const node = plan.nodes.find(n => n.name === "dropped.txt")!;
    expect(node.parentId).toBe(sub.id);
    expect(pathOf(plan.nodes, node.id)).toBe("docs/sub/dropped.txt");
  });

  it("replace mode swaps the whole vault", () => {
    const { all } = fixture();
    const incoming = [file("only.txt", null, "solo")];
    const plan = mergeImport(all, incoming, "replace", "rename", null);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].name).toBe("only.txt");
  });

  it("normalizeSizes recomputes byte sizes from content", () => {
    const f = file("f.txt", null, "12345");
    f.size = 999;
    const [fixed] = normalizeSizes([f]);
    expect(fixed.size).toBe(5);
  });

  it("reads deflate-compressed ZIP entries when DecompressionStream exists", async () => {
    if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") return;
    const content = new TextEncoder().encode("deflate me ".repeat(50));
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    void writer.write(content).then(() => writer.close());
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const compressed = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let pos = 0;
    for (const c of chunks) { compressed.set(c, pos); pos += c.length; }

    // hand-build a one-entry zip with method 8
    const name = new TextEncoder().encode("big.txt");
    const local = new Uint8Array(30 + name.length + compressed.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true); // deflate
    lv.setUint32(14, crc32(content), true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, content.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(compressed, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true); // method at offset 10 in central header
    cv.setUint32(16, crc32(content), true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, content.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, 0, true);
    central.set(name, 46);

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length, true);

    const zip = new Uint8Array(local.length + central.length + eocd.length);
    zip.set(local, 0);
    zip.set(central, local.length);
    zip.set(eocd, local.length + central.length);

    const entries = await readZip(zip.buffer as ArrayBuffer);
    expect(entries).toHaveLength(1);
    expect(new TextDecoder().decode(entries[0].data)).toBe("deflate me ".repeat(50));
  });
});
