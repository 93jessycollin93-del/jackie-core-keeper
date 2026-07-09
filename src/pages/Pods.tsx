import { useEffect, useState } from "react";
import { buildPodTree, compressPod, createPod, deletePod, listPods, Pod, PodNode } from "@/lib/pods-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Box, Plus, Trash2, Zap, ChevronRight, ChevronDown } from "lucide-react";

function PodItem({ node, depth, onCreate, onDelete, onCompress }: {
  node: PodNode;
  depth: number;
  onCreate: (parentId: string) => void;
  onDelete: (id: string) => void;
  onCompress: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [busy, setBusy] = useState(false);

  const handleCompress = async () => {
    setBusy(true);
    try { await onCompress(node.id); } finally { setBusy(false); }
  };

  return (
    <div>
      <div
        className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted group border-l-2 border-transparent hover:border-primary"
        style={{ marginLeft: depth * 16 }}
      >
        <button onClick={() => setOpen(!open)} className="mt-0.5 text-muted-foreground">
          {node.children.length > 0 ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <Box size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm truncate">{node.name}</span>
            {node.compressed_at && (
              <span className="text-[9px] font-mono uppercase text-primary">Sealed</span>
            )}
            <span className="text-[9px] text-muted-foreground">{node.children.length} nested</span>
          </div>
          {node.compressed_context && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
              {node.compressed_context}
            </p>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onCreate(node.id)} title="Nest a pod inside">
            <Plus size={12} />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCompress} disabled={busy} title="Compress pod">
            <Zap size={12} className={busy ? "animate-pulse text-primary" : ""} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(node.id)}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
      {open && node.children.map(child => (
        <PodItem key={child.id} node={child} depth={depth + 1} onCreate={onCreate} onDelete={onDelete} onCompress={onCompress} />
      ))}
    </div>
  );
}

export default function Pods() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  const refresh = async () => {
    try { setPods(await listPods()); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreateRoot = async () => {
    const name = newName.trim() || "New Pod";
    try { await createPod({ name }); setNewName(""); await refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleNest = async (parentId: string) => {
    const name = prompt("Nested pod name?", "Sub-Pod");
    if (!name) return;
    try { await createPod({ name, parent_pod_id: parentId }); await refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete pod and all nested pods?")) return;
    try { await deletePod(id); await refresh(); } catch (e: any) { toast.error(e.message); }
  };

  const handleCompress = async (id: string) => {
    try {
      await compressPod(id);
      toast.success("Pod sealed");
      await refresh();
    } catch (e: any) { toast.error("Compress failed: " + e.message); }
  };

  const tree = buildPodTree(pods);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <header className="border-b border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Box className="text-primary" size={20} />
          <h1 className="font-mono text-sm uppercase tracking-wider">Compression Pods</h1>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Root pod name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreateRoot()}
          />
          <Button onClick={handleCreateRoot}><Plus size={14} /> Pod</Button>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono mt-2 uppercase">
          Nest pods inside pods · Compress = summarize into a sealed context blob
        </p>
      </header>

      <div className="p-2">
        {loading && <p className="text-xs text-muted-foreground p-2">Loading…</p>}
        {!loading && tree.length === 0 && (
          <p className="text-xs text-muted-foreground p-2">No pods yet. Create a root pod above.</p>
        )}
        {tree.map(node => (
          <PodItem
            key={node.id}
            node={node}
            depth={0}
            onCreate={handleNest}
            onDelete={handleDelete}
            onCompress={handleCompress}
          />
        ))}
      </div>
    </div>
  );
}
