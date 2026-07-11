import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive, ChevronDown, ChevronRight, Copy, Download, File as FileIcon, FileArchive,
  FileCode, FileImage, FileJson, FilePlus2, FileText, Folder, FolderOpen, FolderPlus,
  FolderTree, History, Image as ImageIcon, LayoutGrid, List, Lock, Music, Palette,
  Pencil, Redo2, Scissors, Search, Settings2, Star, Trash2, Undo2, Upload, Video, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub,
  ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ExportDialog } from "@/components/vfs/ExportDialog";
import { ImportDialog } from "@/components/vfs/ImportDialog";
import { SnapshotPanel } from "@/components/vfs/SnapshotPanel";
import { NODE_COLORS, VfsNode, VfsSettings } from "@/lib/vfs/types";
import {
  childrenOf, computeStats, contentSize, createNode, crumbsOf, descendantIds,
  duplicateSubtree, extOf, formatBytes, isSelfOrDescendant, pathOf, pruneOrphans,
  searchNodes, sortNodes, uid, uniqueName,
} from "@/lib/vfs/vfs-core";
import { downloadNodeFile } from "@/lib/vfs/vfs-export";
import { nodesFromDataTransfer } from "@/lib/vfs/vfs-import";
import {
  estimateStorage, loadAllNodes, loadSettings, markSeeded, pruneAutoSnapshots,
  replaceAllNodes, saveSettings, saveSnapshot, wasSeeded,
} from "@/lib/vfs/vfs-db";

const DND_TYPE = "application/x-jackie-vfs";
const UNDO_LIMIT = 60;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function nodeIcon(node: VfsNode, open = false) {
  if (node.icon) return <span className="text-sm leading-none w-4 text-center shrink-0">{node.icon}</span>;
  const colorCls = NODE_COLORS.find(c => c.key === node.color)?.cls ?? "text-muted-foreground";
  if (node.type === "folder") {
    const Icon = open ? FolderOpen : Folder;
    return <Icon size={15} className={`shrink-0 ${node.color ? colorCls : "text-primary"}`} />;
  }
  const ext = extOf(node.name);
  const Icon =
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? FileImage :
    ["mp3", "wav", "ogg", "flac"].includes(ext) ? Music :
    ["mp4", "mov", "webm", "avi"].includes(ext) ? Video :
    ["zip", "tar", "gz", "7z", "rar"].includes(ext) ? FileArchive :
    ext === "json" ? FileJson :
    ["js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "c", "cpp", "sh", "html", "css", "sql"].includes(ext) ? FileCode :
    ["md", "markdown", "txt", "log"].includes(ext) ? FileText :
    FileIcon;
  return <Icon size={15} className={`shrink-0 ${colorCls}`} />;
}

function displayName(node: VfsNode, showExtensions: boolean): string {
  if (node.type === "folder" || showExtensions) return node.name;
  const dot = node.name.lastIndexOf(".");
  return dot > 0 ? node.name.slice(0, dot) : node.name;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function seedNodes(): VfsNode[] {
  const docs = createNode({ type: "folder", name: "Documents" });
  const projects = createNode({ type: "folder", name: "Projects" });
  const media = createNode({ type: "folder", name: "Media", color: "violet" });
  const welcome = createNode({
    type: "file",
    name: "Welcome.md",
    starred: true,
    content: [
      "# Vault",
      "",
      "A local-first file & folder system that lives in your browser (IndexedDB).",
      "",
      "## Saving",
      "- Every change is saved automatically — no save button needed",
      "- Take **Snapshots** before risky changes, restore them any time",
      "- Undo / redo with Ctrl+Z / Ctrl+Shift+Z",
      "",
      "## Export",
      "- JSON vault (full fidelity, re-importable)",
      "- ZIP archive (real files, opens anywhere)",
      "- ASCII tree, Markdown outline, CSV manifest",
      "- Export everything, or just a selection",
      "",
      "## Import",
      "- Drag & drop files or whole folders anywhere on this page",
      "- Folder picker, ZIP archives, pasted JSON",
      "- Merge or replace, with rename / overwrite / skip collision control",
      "",
      "## Controls",
      "- Right-click anything for the full menu",
      "- Multi-select with Ctrl / Shift click",
      "- Cut, copy, paste, duplicate, drag to move",
      "- Tags, colors, emoji icons, star & lock per item",
      "- Keys: N new file · Shift+N new folder · F2 rename · Del delete · / search",
    ].join("\n"),
  });
  const notes = createNode({
    type: "file", parentId: docs.id, name: "notes.txt", tags: ["inbox"],
    content: "Quick notes live here.\n",
  });
  const idea = createNode({
    type: "file", parentId: projects.id, name: "idea.md", color: "amber",
    content: "# Next big thing\n\n- [ ] sketch it\n- [ ] build it\n",
  });
  return [welcome, docs, projects, media, notes, idea];
}

// ---------------------------------------------------------------------------
// Context menu wrapper (shared by tree items, rows and tiles)
// ---------------------------------------------------------------------------

interface MenuHandlers {
  open: (n: VfsNode) => void;
  newFileIn: (folderId: string | null) => void;
  newFolderIn: (folderId: string | null) => void;
  rename: (n: VfsNode) => void;
  duplicate: (n: VfsNode) => void;
  copy: (n: VfsNode) => void;
  cut: (n: VfsNode) => void;
  paste: (folderId: string | null) => void;
  canPaste: boolean;
  toggleStar: (n: VfsNode) => void;
  toggleLock: (n: VfsNode) => void;
  setColor: (n: VfsNode, color: string | null) => void;
  exportNode: (n: VfsNode) => void;
  download: (n: VfsNode) => void;
  remove: (n: VfsNode) => void;
}

function NodeMenu({ node, h, children }: { node: VfsNode; h: MenuHandlers; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52 font-mono text-xs [&_[role=menuitem]]:gap-2">
        <ContextMenuItem onClick={() => h.open(node)}>
          {node.type === "folder" ? <FolderOpen size={12} /> : <Pencil size={12} />} Open
        </ContextMenuItem>
        {node.type === "folder" && (
          <>
            <ContextMenuItem onClick={() => h.newFileIn(node.id)}><FilePlus2 size={12} /> New file inside</ContextMenuItem>
            <ContextMenuItem onClick={() => h.newFolderIn(node.id)}><FolderPlus size={12} /> New folder inside</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={node.locked} onClick={() => h.rename(node)}><Pencil size={12} /> Rename<span className="ml-auto text-muted-foreground">F2</span></ContextMenuItem>
        <ContextMenuItem onClick={() => h.duplicate(node)}><Copy size={12} /> Duplicate</ContextMenuItem>
        <ContextMenuItem onClick={() => h.copy(node)}><Copy size={12} /> Copy<span className="ml-auto text-muted-foreground">⌘C</span></ContextMenuItem>
        <ContextMenuItem disabled={node.locked} onClick={() => h.cut(node)}><Scissors size={12} /> Cut<span className="ml-auto text-muted-foreground">⌘X</span></ContextMenuItem>
        {node.type === "folder" && (
          <ContextMenuItem disabled={!h.canPaste} onClick={() => h.paste(node.id)}>
            <Download size={12} /> Paste inside<span className="ml-auto text-muted-foreground">⌘V</span>
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => h.toggleStar(node)}>
          <Star size={12} className={node.starred ? "fill-amber-400 text-amber-400" : ""} /> {node.starred ? "Unstar" : "Star"}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => h.toggleLock(node)}>
          <Lock size={12} /> {node.locked ? "Unlock" : "Lock"}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="font-mono text-xs"><Palette size={12} /> Color</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            <div className="flex flex-wrap gap-1.5 p-2">
              {NODE_COLORS.map(c => (
                <button
                  key={c.key}
                  className={`h-5 w-5 rounded-full ${c.bg} ${node.color === c.key ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}
                  onClick={() => h.setColor(node, c.key)}
                  title={c.key}
                />
              ))}
              <button
                className="h-5 w-5 rounded-full border border-border bg-background text-[9px] font-mono"
                onClick={() => h.setColor(node, null)}
                title="none"
              >
                ×
              </button>
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => h.exportNode(node)}><Archive size={12} /> Export…</ContextMenuItem>
        {node.type === "file" && (
          <ContextMenuItem onClick={() => h.download(node)}><Download size={12} /> Download file</ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={node.locked}
          className="text-destructive focus:text-destructive"
          onClick={() => h.remove(node)}
        >
          <Trash2 size={12} /> Delete<span className="ml-auto text-muted-foreground">Del</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RenameInput({ node, onCommit, onCancel }: { node: VfsNode; onCommit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(node.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const dot = node.name.lastIndexOf(".");
    input.setSelectionRange(0, node.type === "file" && dot > 0 ? dot : node.name.length);
  }, [node]);
  return (
    <input
      ref={ref}
      data-testid="vfs-rename-input"
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(value)}
      onClick={e => e.stopPropagation()}
      className="h-5 w-full min-w-0 rounded border border-primary bg-background px-1 font-mono text-xs outline-none"
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Files() {
  const [nodes, setNodes] = useState<VfsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<VfsSettings>(() => loadSettings());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renameId, setRenameId] = useState<string | null>(null);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [search, setSearch] = useState("");
  const [clipboard, setClipboard] = useState<{ mode: "copy" | "cut"; ids: string[] } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null | "root">(null);
  const [externalDrag, setExternalDrag] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [snapsOpen, setSnapsOpen] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const undoStack = useRef<VfsNode[][]>([]);
  const redoStack = useRef<VfsNode[][]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const openFile = openFileId ? byId.get(openFileId) ?? null : null;
  const stats = useMemo(() => computeStats(nodes), [nodes]);
  const crumbs = useMemo(() => crumbsOf(nodes, currentFolderId), [nodes, currentFolderId]);

  const visibleChildren = useMemo(() => {
    let kids = childrenOf(nodes, currentFolderId);
    if (!settings.showHidden) kids = kids.filter(n => !n.name.startsWith("."));
    return sortNodes(kids, settings);
  }, [nodes, currentFolderId, settings]);

  const searchHits = useMemo(() => (search.trim() ? searchNodes(nodes, search) : []), [nodes, search]);

  // ------------------------------------------------------------- persistence

  const persist = useCallback((next: VfsNode[]) => {
    replaceAllNodes(next).catch(e =>
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  }, []);

  /** Apply a mutation: push undo, set state, persist. */
  const apply = useCallback((next: VfsNode[], undoable = true) => {
    if (undoable) {
      undoStack.current.push(nodesRef.current);
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
      redoStack.current = [];
    }
    setNodes(next);
    persist(next);
  }, [persist]);

  useEffect(() => {
    (async () => {
      try {
        let loaded = pruneOrphans(await loadAllNodes());
        if (loaded.length === 0 && !wasSeeded()) {
          loaded = seedNodes();
          await replaceAllNodes(loaded);
          markSeeded();
        }
        setNodes(loaded);
      } catch (e) {
        toast.error(`Failed to load vault: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
      estimateStorage().then(setStorage);
    })();
  }, []);

  useEffect(() => { saveSettings(settings); }, [settings]);

  // Keep editor draft in sync when opening a file
  useEffect(() => {
    if (openFile) {
      setDraft(openFile.content);
      setTagsDraft(openFile.tags.join(", "));
    }
  }, [openFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoSnapshot = useCallback(async (label: string) => {
    if (!settings.autoSnapshot || nodesRef.current.length === 0) return;
    try {
      const s = computeStats(nodesRef.current);
      await saveSnapshot({
        id: uid(), name: `auto: ${label}`, createdAt: Date.now(),
        nodeCount: nodesRef.current.length, bytes: s.bytes, auto: true,
        nodes: nodesRef.current.map(n => ({ ...n })),
      });
      await pruneAutoSnapshots(10);
    } catch { /* snapshots are best-effort */ }
  }, [settings.autoSnapshot]);

  // ------------------------------------------------------------- selection

  const selectionRoots = useMemo(() => {
    const ids = [...selectedIds].filter(id => byId.has(id));
    return ids.filter(id => !ids.some(other => other !== id && isSelfOrDescendant(nodes, other, id)));
  }, [selectedIds, byId, nodes]);

  const clickSelect = (n: VfsNode, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
        return next;
      });
      return;
    }
    if (e.shiftKey && selectedIds.size > 0) {
      const order = visibleChildren.map(c => c.id);
      const last = [...selectedIds].map(id => order.indexOf(id)).filter(i => i >= 0).pop() ?? -1;
      const cur = order.indexOf(n.id);
      if (last >= 0 && cur >= 0) {
        const [a, b] = [Math.min(last, cur), Math.max(last, cur)];
        setSelectedIds(new Set(order.slice(a, b + 1)));
        return;
      }
    }
    // Second click on the single selected item opens it (mobile-friendly)
    if (selectedIds.size === 1 && selectedIds.has(n.id)) { openNode(n); return; }
    setSelectedIds(new Set([n.id]));
  };

  // ------------------------------------------------------------- operations

  const openNode = (n: VfsNode) => {
    if (n.type === "folder") {
      setCurrentFolderId(n.id);
      setExpanded(prev => new Set(prev).add(n.id));
      setSelectedIds(new Set());
    } else {
      setOpenFileId(n.id);
      setSelectedIds(new Set([n.id]));
    }
  };

  const createIn = (folderId: string | null, type: "file" | "folder") => {
    const base = type === "file" ? "untitled.txt" : "New folder";
    const node = createNode({ parentId: folderId, type, name: uniqueName(nodesRef.current, folderId, base) });
    apply([...nodesRef.current, node]);
    if (folderId) setExpanded(prev => new Set(prev).add(folderId));
    if (folderId !== currentFolderId) setCurrentFolderId(folderId);
    setSearch("");
    setSelectedIds(new Set([node.id]));
    setRenameId(node.id);
  };

  /** Inline rename renders in the main panel only — jump there so the input is visible. */
  const startRename = (n: VfsNode) => {
    if (n.locked) return;
    if (n.parentId !== currentFolderId) setCurrentFolderId(n.parentId);
    setSearch("");
    setSelectedIds(new Set([n.id]));
    setRenameId(n.id);
  };

  const commitRename = (n: VfsNode, name: string) => {
    setRenameId(null);
    const clean = name.trim();
    if (!clean || clean === n.name) return;
    const finalName = uniqueName(nodesRef.current, n.parentId, clean, n.id);
    apply(nodesRef.current.map(x => (x.id === n.id ? { ...x, name: finalName, updatedAt: Date.now() } : x)));
  };

  const patchNode = (id: string, patch: Partial<VfsNode>) => {
    apply(nodesRef.current.map(x => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)));
  };

  const removeIds = (ids: string[]) => {
    const roots = ids.filter(id => byId.has(id));
    const locked = roots.filter(id => byId.get(id)!.locked);
    const deletable = roots.filter(id => !byId.get(id)!.locked);
    if (locked.length > 0) toast.warning(`${locked.length} locked item(s) were not deleted`);
    if (deletable.length === 0) return;
    if (settings.confirmDelete) {
      const names = deletable.slice(0, 3).map(id => byId.get(id)!.name).join(", ");
      if (!confirm(`Delete ${deletable.length} item(s) (${names}${deletable.length > 3 ? "…" : ""}) and everything inside?`)) return;
    }
    const doomed = new Set<string>();
    for (const id of deletable) {
      doomed.add(id);
      for (const d of descendantIds(nodesRef.current, id)) doomed.add(d);
    }
    apply(nodesRef.current.filter(n => !doomed.has(n.id)));
    setSelectedIds(new Set());
    if (openFileId && doomed.has(openFileId)) setOpenFileId(null);
    if (currentFolderId && doomed.has(currentFolderId)) setCurrentFolderId(null);
    toast.success(`Deleted ${doomed.size} item(s)`);
  };

  const moveIds = (ids: string[], targetFolderId: string | null) => {
    const current = nodesRef.current;
    const valid = ids.filter(id => {
      const n = current.find(x => x.id === id);
      if (!n || n.locked) return false;
      if (n.parentId === targetFolderId) return false;
      if (targetFolderId && isSelfOrDescendant(current, id, targetFolderId)) return false;
      return true;
    });
    if (valid.length === 0) return;
    let next = [...current];
    for (const id of valid) {
      const n = next.find(x => x.id === id)!;
      const name = uniqueName(next.filter(x => x.id !== id), targetFolderId, n.name);
      next = next.map(x => (x.id === id ? { ...x, parentId: targetFolderId, name, updatedAt: Date.now() } : x));
    }
    apply(next);
    if (targetFolderId) setExpanded(prev => new Set(prev).add(targetFolderId));
    toast.success(`Moved ${valid.length} item(s)`);
  };

  const duplicateOne = (n: VfsNode) => {
    const copyName = uniqueName(nodesRef.current, n.parentId, n.name);
    const copies = duplicateSubtree(nodesRef.current, n.id, n.parentId, copyName);
    apply([...nodesRef.current, ...copies]);
    toast.success("Duplicated");
  };

  const pasteInto = (targetFolderId: string | null) => {
    if (!clipboard) return;
    if (clipboard.mode === "cut") {
      moveIds(clipboard.ids, targetFolderId);
      setClipboard(null);
      return;
    }
    const current = nodesRef.current;
    let next = [...current];
    let count = 0;
    for (const id of clipboard.ids) {
      const src = current.find(x => x.id === id);
      if (!src) continue;
      const name = uniqueName(next, targetFolderId, src.name);
      const copies = duplicateSubtree(next, id, targetFolderId, name);
      next = [...next, ...copies];
      count += copies.length;
    }
    if (count > 0) {
      apply(next);
      toast.success(`Pasted ${count} item(s)`);
    }
  };

  const copySelection = (seed?: VfsNode) => {
    const ids = seed && !selectedIds.has(seed.id) ? [seed.id] : selectionRoots;
    if (ids.length === 0) return;
    setClipboard({ mode: "copy", ids });
    toast.info(`Copied ${ids.length} item(s)`);
  };

  const cutSelection = (seed?: VfsNode) => {
    const ids = (seed && !selectedIds.has(seed.id) ? [seed.id] : selectionRoots)
      .filter(id => !byId.get(id)?.locked);
    if (ids.length === 0) return;
    setClipboard({ mode: "cut", ids });
    toast.info(`Cut ${ids.length} item(s)`);
  };

  const saveOpenFile = () => {
    if (!openFile || openFile.locked) return;
    patchNode(openFile.id, { content: draft, size: contentSize(draft, openFile.encoding) });
    toast.success("File saved");
  };

  const commitTags = () => {
    if (!openFile) return;
    const tags = tagsDraft.split(",").map(t => t.trim()).filter(Boolean);
    patchNode(openFile.id, { tags });
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(nodesRef.current);
    setNodes(prev);
    persist(prev);
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(nodesRef.current);
    setNodes(next);
    persist(next);
  };

  const handleImportApply = async (next: VfsNode[], summary: string, mode: "merge" | "replace") => {
    await autoSnapshot(mode === "replace" ? "before replace import" : "before import");
    apply(pruneOrphans(next));
    if (mode === "replace") {
      setCurrentFolderId(null);
      setOpenFileId(null);
      setSelectedIds(new Set());
    }
    toast.success(summary);
    estimateStorage().then(setStorage);
  };

  const handleRestore = async (snapNodes: VfsNode[], name: string) => {
    await autoSnapshot("before restore");
    apply(pruneOrphans(snapNodes));
    setSnapsOpen(false);
    setCurrentFolderId(null);
    setOpenFileId(null);
    setSelectedIds(new Set());
    toast.success(`Restored "${name}"`);
  };

  const openExport = (scope: string[]) => {
    setExportScope(scope);
    setExportOpen(true);
  };

  // ------------------------------------------------------------- drag & drop

  const onNodeDragStart = (n: VfsNode, e: React.DragEvent) => {
    const ids = selectedIds.has(n.id) ? selectionRoots : [n.id];
    e.dataTransfer.setData(DND_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  const onFolderDrop = async (targetFolderId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    setExternalDrag(0);
    const internal = e.dataTransfer.getData(DND_TYPE);
    if (internal) {
      try { moveIds(JSON.parse(internal) as string[], targetFolderId); } catch { /* malformed */ }
      return;
    }
    if (e.dataTransfer.files.length > 0 || e.dataTransfer.items.length > 0) {
      try {
        const { nodes: incoming, skipped } = await nodesFromDataTransfer(e.dataTransfer, null);
        if (incoming.length === 0) return;
        const next = [...nodesRef.current];
        for (const n of incoming) {
          if (n.parentId === null) {
            next.push({ ...n, parentId: targetFolderId, name: uniqueName(next, targetFolderId, n.name) });
          } else {
            next.push(n);
          }
        }
        apply(next);
        if (targetFolderId) setExpanded(prev => new Set(prev).add(targetFolderId));
        toast.success(`Imported ${incoming.length} item(s)${skipped.length ? `, skipped ${skipped.length} oversized` : ""}`);
        estimateStorage().then(setStorage);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Drop import failed");
      }
    }
  };

  const dragOverProps = (id: string | null | "root") => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverId(id);
    },
    onDragLeave: () => setDragOverId(prev => (prev === id ? null : prev)),
  });

  // ------------------------------------------------------------- keyboard

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (typing) return;
      if (exportOpen || importOpen || snapsOpen) return;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(visibleChildren.map(n => n.id)));
        return;
      }
      if (mod && e.key.toLowerCase() === "c") { copySelection(); return; }
      if (mod && e.key.toLowerCase() === "x") { cutSelection(); return; }
      if (mod && e.key.toLowerCase() === "v") { pasteInto(currentFolderId); return; }
      if (e.key === "Delete" || (e.key === "Backspace" && mod)) { removeIds(selectionRoots); return; }
      if (e.key === "F2" && selectionRoots.length > 0) {
        const first = byId.get(selectionRoots[0]);
        if (first) startRename(first);
        return;
      }
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "Escape") {
        if (search) setSearch("");
        else if (selectedIds.size > 0) setSelectedIds(new Set());
        else setOpenFileId(null);
        return;
      }
      if (!mod && e.key === "n") { createIn(currentFolderId, "file"); return; }
      if (!mod && e.key === "N") { createIn(currentFolderId, "folder"); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // ------------------------------------------------------------- menu handlers

  const menuHandlers: MenuHandlers = {
    open: openNode,
    newFileIn: id => createIn(id, "file"),
    newFolderIn: id => createIn(id, "folder"),
    rename: startRename,
    duplicate: duplicateOne,
    copy: n => copySelection(n),
    cut: n => cutSelection(n),
    paste: pasteInto,
    canPaste: !!clipboard,
    toggleStar: n => patchNode(n.id, { starred: !n.starred }),
    toggleLock: n => patchNode(n.id, { locked: !n.locked }),
    setColor: (n, color) => patchNode(n.id, { color }),
    exportNode: n => openExport([n.id]),
    download: downloadNodeFile,
    remove: n => removeIds(selectedIds.has(n.id) ? selectionRoots : [n.id]),
  };

  // ------------------------------------------------------------- tree render

  const renderTree = (parentId: string | null, depth: number): React.ReactNode => {
    let kids = childrenOf(nodes, parentId);
    if (!settings.showHidden) kids = kids.filter(n => !n.name.startsWith("."));
    return sortNodes(kids, settings).map(n => {
      const isFolder = n.type === "folder";
      const isOpen = expanded.has(n.id);
      const active = selectedIds.has(n.id) || currentFolderId === n.id;
      return (
        <div key={n.id}>
          <NodeMenu node={n} h={menuHandlers}>
            <div
              draggable
              onDragStart={e => onNodeDragStart(n, e)}
              {...(isFolder ? dragOverProps(n.id) : {})}
              onDrop={isFolder ? e => onFolderDrop(n.id, e) : undefined}
              onClick={e => {
                if (isFolder) {
                  setCurrentFolderId(n.id);
                  setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
                    return next;
                  });
                  setSelectedIds(new Set([n.id]));
                } else {
                  clickSelect(n, e);
                }
              }}
              onDoubleClick={() => openNode(n)}
              className={`flex items-center gap-1.5 rounded px-1.5 py-1 cursor-pointer select-none border-l-2 ${
                settings.treeIndentGuides && depth > 0 ? "border-border/40" : "border-transparent"
              } ${active ? "bg-primary/10 text-primary" : "hover:bg-muted/60"} ${
                dragOverId === n.id ? "ring-1 ring-primary bg-primary/10" : ""
              } ${clipboard?.mode === "cut" && clipboard.ids.includes(n.id) ? "opacity-50" : ""}`}
              style={{ marginLeft: depth * 12 }}
            >
              {isFolder ? (
                <span className="text-muted-foreground shrink-0">
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              {nodeIcon(n, isOpen)}
              <span className="truncate font-mono text-xs">{displayName(n, settings.showExtensions)}</span>
              {n.starred && <Star size={9} className="shrink-0 fill-amber-400 text-amber-400" />}
              {n.locked && <Lock size={9} className="shrink-0 text-muted-foreground" />}
            </div>
          </NodeMenu>
          {isFolder && isOpen && renderTree(n.id, depth + 1)}
        </div>
      );
    });
  };

  // ------------------------------------------------------------- main items

  const itemRow = (n: VfsNode) => (
    <NodeMenu key={n.id} node={n} h={menuHandlers}>
      <div
        draggable
        onDragStart={e => onNodeDragStart(n, e)}
        {...(n.type === "folder" ? dragOverProps(n.id) : {})}
        onDrop={n.type === "folder" ? e => onFolderDrop(n.id, e) : undefined}
        onClick={e => clickSelect(n, e)}
        onDoubleClick={() => openNode(n)}
        className={`group flex items-center gap-2 border-b border-border/40 px-2 cursor-pointer select-none ${
          settings.density === "compact" ? "py-1" : "py-2"
        } ${selectedIds.has(n.id) ? "bg-primary/10" : "hover:bg-muted/50"} ${
          dragOverId === n.id ? "ring-1 ring-inset ring-primary" : ""
        } ${clipboard?.mode === "cut" && clipboard.ids.includes(n.id) ? "opacity-50" : ""}`}
      >
        {nodeIcon(n)}
        <div className="min-w-0 flex-1">
          {renameId === n.id ? (
            <RenameInput node={n} onCommit={name => commitRename(n, name)} onCancel={() => setRenameId(null)} />
          ) : (
            <span className="truncate font-mono text-xs flex items-center gap-1.5">
              {displayName(n, settings.showExtensions)}
              {n.starred && <Star size={9} className="fill-amber-400 text-amber-400 shrink-0" />}
              {n.locked && <Lock size={9} className="text-muted-foreground shrink-0" />}
            </span>
          )}
          {n.tags.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {n.tags.map(t => (
                <button
                  key={t}
                  onClick={e => { e.stopPropagation(); setSearch(`#${t}`); }}
                  className="rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground hover:text-primary"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="hidden w-20 text-right font-mono text-[10px] text-muted-foreground sm:block">
          {n.type === "folder" ? `${childrenOf(nodes, n.id).length} items` : formatBytes(n.size)}
        </span>
        <span className="hidden w-20 text-right font-mono text-[10px] text-muted-foreground md:block">
          {timeAgo(n.updatedAt)}
        </span>
      </div>
    </NodeMenu>
  );

  const itemTile = (n: VfsNode) => (
    <NodeMenu key={n.id} node={n} h={menuHandlers}>
      <div
        draggable
        onDragStart={e => onNodeDragStart(n, e)}
        {...(n.type === "folder" ? dragOverProps(n.id) : {})}
        onDrop={n.type === "folder" ? e => onFolderDrop(n.id, e) : undefined}
        onClick={e => clickSelect(n, e)}
        onDoubleClick={() => openNode(n)}
        className={`flex flex-col items-center gap-1.5 rounded border p-3 cursor-pointer select-none text-center ${
          selectedIds.has(n.id) ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
        } ${dragOverId === n.id ? "ring-1 ring-primary" : ""} ${
          clipboard?.mode === "cut" && clipboard.ids.includes(n.id) ? "opacity-50" : ""
        }`}
      >
        <div className="scale-150 py-1.5">{nodeIcon(n)}</div>
        {renameId === n.id ? (
          <RenameInput node={n} onCommit={name => commitRename(n, name)} onCancel={() => setRenameId(null)} />
        ) : (
          <span className="w-full truncate font-mono text-[11px] leading-tight">
            {displayName(n, settings.showExtensions)}
          </span>
        )}
        <span className="font-mono text-[9px] text-muted-foreground">
          {n.type === "folder" ? `${childrenOf(nodes, n.id).length} items` : formatBytes(n.size)}
        </span>
        <span className="flex gap-1">
          {n.starred && <Star size={9} className="fill-amber-400 text-amber-400" />}
          {n.locked && <Lock size={9} className="text-muted-foreground" />}
        </span>
      </div>
    </NodeMenu>
  );

  // ------------------------------------------------------------- render

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-mono text-sm text-muted-foreground animate-pulse">Loading vault…</span>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background pb-16 md:pb-0 flex flex-col"
      onDragEnter={e => {
        if (Array.from(e.dataTransfer.types).includes("Files")) setExternalDrag(d => d + 1);
      }}
      onDragLeave={() => setExternalDrag(d => Math.max(0, d - 1))}
      onDragOver={e => e.preventDefault()}
      onDrop={e => onFolderDrop(currentFolderId, e)}
    >
      {/* External file drop overlay */}
      {externalDrag > 0 && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-lg border-2 border-dashed border-primary p-8 text-center">
            <Upload className="mx-auto mb-2 text-primary" size={28} />
            <p className="font-mono text-sm">
              Drop to import into <span className="text-primary">{crumbs.length ? crumbs[crumbs.length - 1].name : "Vault"}</span>
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">files & whole folders supported</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FolderTree className="text-primary" size={18} />
          <h1 className="font-mono text-sm uppercase tracking-wider">Vault</h1>
          <span className="font-mono text-[10px] text-muted-foreground">
            {stats.folders} folders · {stats.files} files · {formatBytes(stats.bytes)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2" title="Undo (Ctrl+Z)" onClick={undo} disabled={undoStack.current.length === 0}>
              <Undo2 size={13} />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={redoStack.current.length === 0}>
              <Redo2 size={13} />
            </Button>
            <Button
              size="sm" variant="ghost" className="h-7 px-2" title={settings.viewMode === "list" ? "Grid view" : "List view"}
              onClick={() => setSettings(s => ({ ...s, viewMode: s.viewMode === "list" ? "grid" : "list" }))}
            >
              {settings.viewMode === "list" ? <LayoutGrid size={13} /> : <List size={13} />}
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2" title="View & behavior settings">
                  <Settings2 size={13} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sorting</div>
                <div className="flex gap-2">
                  <Select value={settings.sortBy} onValueChange={v => setSettings(s => ({ ...s, sortBy: v as VfsSettings["sortBy"] }))}>
                    <SelectTrigger className="h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name" className="font-mono text-xs">Name</SelectItem>
                      <SelectItem value="type" className="font-mono text-xs">Type</SelectItem>
                      <SelectItem value="size" className="font-mono text-xs">Size</SelectItem>
                      <SelectItem value="updated" className="font-mono text-xs">Modified</SelectItem>
                      <SelectItem value="created" className="font-mono text-xs">Created</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={settings.sortDir} onValueChange={v => setSettings(s => ({ ...s, sortDir: v as "asc" | "desc" }))}>
                    <SelectTrigger className="h-8 w-24 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc" className="font-mono text-xs">Asc</SelectItem>
                      <SelectItem value="desc" className="font-mono text-xs">Desc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {([
                  ["foldersFirst", "Folders first"],
                  ["showExtensions", "Show file extensions"],
                  ["showHidden", "Show hidden (.dot) files"],
                  ["treeIndentGuides", "Tree indent guides"],
                  ["confirmDelete", "Confirm before delete"],
                  ["autoSnapshot", "Auto-snapshot before risky ops"],
                ] as [keyof VfsSettings, string][]).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <Label className="font-mono text-[11px]">{label}</Label>
                    <Switch
                      checked={settings[key] as boolean}
                      onCheckedChange={v => setSettings(s => ({ ...s, [key]: v }))}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-mono text-[11px]">Density</Label>
                  <Select value={settings.density} onValueChange={v => setSettings(s => ({ ...s, density: v as VfsSettings["density"] }))}>
                    <SelectTrigger className="h-7 w-28 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cozy" className="font-mono text-xs">Cozy</SelectItem>
                      <SelectItem value="compact" className="font-mono text-xs">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {storage && storage.quota > 0 && (
                  <div className="border-t border-border pt-2">
                    <div className="mb-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                      <span>Browser storage</span>
                      <span>{formatBytes(storage.usage)} / {formatBytes(storage.quota)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-7 font-mono text-xs" onClick={() => createIn(currentFolderId, "file")}>
            <FilePlus2 size={13} /> File
          </Button>
          <Button size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => createIn(currentFolderId, "folder")}>
            <FolderPlus size={13} /> Folder
          </Button>
          <Button size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => setImportOpen(true)}>
            <Upload size={13} /> Import
          </Button>
          <Button size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => openExport(selectionRoots)}>
            <Download size={13} /> Export
          </Button>
          <Button size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => setSnapsOpen(true)}>
            <History size={13} /> Snapshots
          </Button>
          <div className="relative ml-auto w-full sm:w-56">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search names, content, #tags…  ( / )"
              className="h-7 pl-7 pr-7 font-mono text-xs"
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Selection / clipboard bar */}
      {(selectedIds.size > 0 || clipboard) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
          {selectedIds.size > 0 && (
            <>
              <span className="font-mono text-[10px] text-muted-foreground">{selectedIds.size} selected</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 font-mono text-[10px]" onClick={() => copySelection()}>Copy</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 font-mono text-[10px]" onClick={() => cutSelection()}>Cut</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 font-mono text-[10px]" onClick={() => openExport(selectionRoots)}>Export</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 font-mono text-[10px] text-destructive" onClick={() => removeIds(selectionRoots)}>Delete</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 font-mono text-[10px]" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </>
          )}
          {clipboard && (
            <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              {clipboard.mode === "cut" ? <Scissors size={10} /> : <Copy size={10} />}
              {clipboard.ids.length} in clipboard
              <Button size="sm" variant="ghost" className="h-6 px-2 font-mono text-[10px]" onClick={() => pasteInto(currentFolderId)}>
                Paste here
              </Button>
              <button className="hover:text-foreground" onClick={() => setClipboard(null)}><X size={10} /></button>
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Tree sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border md:block">
          <div
            {...dragOverProps("root")}
            onDrop={e => onFolderDrop(null, e)}
            onClick={() => { setCurrentFolderId(null); setSelectedIds(new Set()); }}
            className={`flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 font-mono text-xs uppercase tracking-wider ${
              currentFolderId === null ? "text-primary" : "text-muted-foreground hover:text-foreground"
            } ${dragOverId === "root" ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}
          >
            <FolderTree size={13} /> Vault root
          </div>
          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="p-2">{renderTree(null, 0)}</div>
          </ScrollArea>
        </aside>

        {/* Main panel */}
        <main className="min-w-0 flex-1 flex flex-col">
          {/* Breadcrumbs */}
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
            <button
              {...dragOverProps("root")}
              onDrop={e => onFolderDrop(null, e)}
              onClick={() => setCurrentFolderId(null)}
              className={`font-mono text-xs ${currentFolderId === null ? "text-primary" : "text-muted-foreground hover:text-foreground"} ${
                dragOverId === "root" ? "underline decoration-primary" : ""
              }`}
            >
              Vault
            </button>
            {crumbs.map(c => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight size={11} className="text-muted-foreground" />
                <button
                  {...dragOverProps(c.id)}
                  onDrop={e => onFolderDrop(c.id, e)}
                  onClick={() => setCurrentFolderId(c.id)}
                  className={`font-mono text-xs ${c.id === currentFolderId ? "text-primary" : "text-muted-foreground hover:text-foreground"} ${
                    dragOverId === c.id ? "underline decoration-primary" : ""
                  }`}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>

          <ScrollArea className="flex-1">
            {search.trim() ? (
              <div className="p-2">
                <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {searchHits.length} result{searchHits.length === 1 ? "" : "s"} for “{search}”
                </div>
                {searchHits.map(hit => (
                  <div
                    key={hit.node.id}
                    onClick={() => {
                      setSearch("");
                      if (hit.node.type === "folder") setCurrentFolderId(hit.node.id);
                      else {
                        setCurrentFolderId(hit.node.parentId);
                        setSelectedIds(new Set([hit.node.id]));
                        setOpenFileId(hit.node.id);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/60"
                  >
                    {nodeIcon(hit.node)}
                    <span className="truncate font-mono text-xs">{hit.path}</span>
                    {hit.matchedContent && (
                      <span className="rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground">content</span>
                    )}
                  </div>
                ))}
                {searchHits.length === 0 && (
                  <p className="p-6 text-center font-mono text-xs text-muted-foreground">Nothing matches.</p>
                )}
              </div>
            ) : visibleChildren.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-10 text-center">
                <Folder size={28} className="text-muted-foreground" />
                <p className="font-mono text-xs text-muted-foreground">This folder is empty.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => createIn(currentFolderId, "file")}>
                    <FilePlus2 size={12} /> New file
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => setImportOpen(true)}>
                    <Upload size={12} /> Import
                  </Button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">…or drop files / folders anywhere.</p>
              </div>
            ) : settings.viewMode === "grid" ? (
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleChildren.map(itemTile)}
              </div>
            ) : (
              <div>{visibleChildren.map(itemRow)}</div>
            )}
          </ScrollArea>
        </main>

        {/* Editor / details panel */}
        {openFile && (
          <section className="fixed inset-0 z-40 flex flex-col bg-background lg:static lg:z-auto lg:w-96 lg:shrink-0 lg:border-l lg:border-border">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              {nodeIcon(openFile)}
              <span className="truncate font-mono text-xs">{pathOf(nodes, openFile.id)}</span>
              <div className="ml-auto flex items-center gap-1">
                {openFile.encoding === "utf8" && (
                  <Button
                    size="sm" variant="ghost" className="h-6 px-2 font-mono text-[10px]"
                    disabled={openFile.locked || draft === openFile.content}
                    onClick={saveOpenFile}
                  >
                    Save
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => downloadNodeFile(openFile)} title="Download">
                  <Download size={12} />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setOpenFileId(null)} title="Close">
                  <X size={12} />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
              <span>{formatBytes(openFile.size)}</span>
              <span>{openFile.mime}</span>
              <span>edited {timeAgo(openFile.updatedAt)}</span>
              {draft !== openFile.content && openFile.encoding === "utf8" && (
                <span className="text-primary">● unsaved</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <button onClick={() => patchNode(openFile.id, { starred: !openFile.starred })} title="Star">
                <Star size={13} className={openFile.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />
              </button>
              <button onClick={() => patchNode(openFile.id, { locked: !openFile.locked })} title="Lock (prevents edits & delete)">
                <Lock size={13} className={openFile.locked ? "text-primary" : "text-muted-foreground"} />
              </button>
              <span className="flex gap-1">
                {NODE_COLORS.map(c => (
                  <button
                    key={c.key}
                    className={`h-3.5 w-3.5 rounded-full ${c.bg} ${openFile.color === c.key ? "ring-1 ring-foreground ring-offset-1 ring-offset-background" : "opacity-60 hover:opacity-100"}`}
                    onClick={() => patchNode(openFile.id, { color: openFile.color === c.key ? null : c.key })}
                    title={c.key}
                  />
                ))}
              </span>
              <Input
                value={openFile.icon ?? ""}
                onChange={e => patchNode(openFile.id, { icon: e.target.value.slice(0, 4) || null })}
                placeholder="emoji"
                className="h-6 w-16 font-mono text-[10px]"
                title="Emoji icon override"
              />
              <Input
                value={tagsDraft}
                onChange={e => setTagsDraft(e.target.value)}
                onBlur={commitTags}
                onKeyDown={e => e.key === "Enter" && commitTags()}
                placeholder="tags, comma, separated"
                className="h-6 flex-1 min-w-24 font-mono text-[10px]"
              />
            </div>

            {openFile.encoding === "utf8" ? (
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                    e.preventDefault();
                    saveOpenFile();
                  }
                }}
                disabled={openFile.locked}
                spellCheck={false}
                className="flex-1 resize-none rounded-none border-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
                placeholder="Empty file — start typing…"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                {openFile.mime.startsWith("image/") ? (
                  <img
                    src={`data:${openFile.mime};base64,${openFile.content}`}
                    alt={openFile.name}
                    className="max-h-64 max-w-full rounded border border-border object-contain"
                  />
                ) : (
                  <ImageIcon size={28} className="text-muted-foreground" />
                )}
                <p className="font-mono text-xs text-muted-foreground">
                  Binary file · {formatBytes(openFile.size)}
                </p>
                <Button size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => downloadNodeFile(openFile)}>
                  <Download size={12} /> Download
                </Button>
              </div>
            )}
          </section>
        )}
      </div>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} nodes={nodes} scopeIds={exportScope} />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        nodes={nodes}
        defaultTargetId={currentFolderId}
        onApply={handleImportApply}
      />
      <SnapshotPanel open={snapsOpen} onOpenChange={setSnapsOpen} nodes={nodes} onRestore={handleRestore} />
    </div>
  );
}
