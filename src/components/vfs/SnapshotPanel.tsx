import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, Download, History, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VfsNode, VfsSnapshot } from "@/lib/vfs/types";
import { computeStats, formatBytes, uid } from "@/lib/vfs/vfs-core";
import { downloadBlob } from "@/lib/vfs/vfs-export";
import { deleteSnapshot, listSnapshots, saveSnapshot } from "@/lib/vfs/vfs-db";

interface SnapshotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: VfsNode[];
  onRestore: (nodes: VfsNode[], snapshotName: string) => void;
}

export function SnapshotPanel({ open, onOpenChange, nodes, onRestore }: SnapshotPanelProps) {
  const [snapshots, setSnapshots] = useState<VfsSnapshot[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { setSnapshots(await listSnapshots()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load snapshots"); }
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const stats = computeStats(nodes);
      await saveSnapshot({
        id: uid(),
        name: name.trim() || `Snapshot ${new Date().toLocaleString()}`,
        createdAt: Date.now(),
        nodeCount: nodes.length,
        bytes: stats.bytes,
        auto: false,
        nodes: nodes.map(n => ({ ...n })),
      });
      setName("");
      toast.success("Snapshot saved");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (snap: VfsSnapshot) => {
    try {
      await deleteSnapshot(snap.id);
      await refresh();
      toast.success("Snapshot deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleDownload = (snap: VfsSnapshot) => {
    const payload = {
      format: "jackie-vfs",
      version: 2,
      exportedAt: new Date(snap.createdAt).toISOString(),
      app: "Jackie",
      snapshot: snap.name,
      nodes: snap.nodes,
    };
    downloadBlob(`snapshot-${snap.name.replace(/[^\w-]+/g, "_").slice(0, 40)}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
            <History size={14} className="text-primary" /> Snapshots
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Point-in-time copies of the whole vault. Restore or download any of them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="Snapshot name (optional)…"
            className="h-8 font-mono text-xs"
          />
          <Button size="sm" disabled={busy} onClick={handleCreate}>
            <Camera size={13} /> Snapshot now
          </Button>
        </div>

        <ScrollArea className="max-h-80">
          <div className="space-y-1.5 pr-2">
            {snapshots.length === 0 && (
              <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                No snapshots yet. Take one before risky changes.
              </p>
            )}
            {snapshots.map(snap => (
              <div key={snap.id} className="flex items-center gap-2 rounded border border-border p-2 group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-xs">{snap.name}</span>
                    {snap.auto && (
                      <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] uppercase text-muted-foreground">
                        auto
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {new Date(snap.createdAt).toLocaleString()} · {snap.nodeCount} items · {formatBytes(snap.bytes)}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2" title="Restore this snapshot"
                    onClick={() => onRestore(snap.nodes.map(n => ({ ...n })), snap.name)}
                  >
                    <RotateCcw size={12} />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" title="Download as JSON" onClick={() => handleDownload(snap)}>
                    <Download size={12} />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive" title="Delete snapshot" onClick={() => handleDelete(snap)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
