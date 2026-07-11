import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileArchive, FileUp, FolderUp, Import } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CollisionPolicy, ImportMode, VfsNode } from "@/lib/vfs/types";
import { childrenOf, computeStats, formatBytes, sortNodes } from "@/lib/vfs/vfs-core";
import { toTreeText } from "@/lib/vfs/vfs-export";
import {
  mergeImport, nodesFromFileList, nodesFromZip, normalizeSizes, parseJsonImport,
} from "@/lib/vfs/vfs-import";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: VfsNode[];
  defaultTargetId: string | null;
  onApply: (nextNodes: VfsNode[], summary: string, mode: ImportMode) => void;
}

interface FolderOption {
  id: string;
  label: string;
}

function folderOptions(nodes: VfsNode[]): FolderOption[] {
  const out: FolderOption[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = sortNodes(
      childrenOf(nodes, parentId).filter(n => n.type === "folder"),
      { sortBy: "name", sortDir: "asc", foldersFirst: true },
    );
    for (const kid of kids) {
      out.push({ id: kid.id, label: `${"  ".repeat(depth)}${kid.name}` });
      if (depth < 8) walk(kid.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const ROOT = "@root";

export function ImportDialog({ open, onOpenChange, nodes, defaultTargetId, onApply }: ImportDialogProps) {
  const [staged, setStaged] = useState<VfsNode[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [collision, setCollision] = useState<CollisionPolicy>("rename");
  const [target, setTarget] = useState<string>(defaultTargetId ?? ROOT);
  const [jsonText, setJsonText] = useState("");
  const [busy, setBusy] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => folderOptions(nodes), [nodes]);
  const stagedStats = useMemo(() => computeStats(staged), [staged]);
  const stagedPreview = useMemo(() => {
    if (staged.length === 0) return "";
    const text = toTreeText(staged, { showSizes: true });
    return text.length > 5000 ? text.slice(0, 5000) + "\n… (truncated)" : text;
  }, [staged]);

  const stage = (incoming: VfsNode[], skippedFiles: string[], label: string) => {
    setStaged(normalizeSizes(incoming));
    setSkipped(skippedFiles);
    setSourceLabel(label);
    if (incoming.length === 0) toast.warning("Nothing importable found in that source");
  };

  const reset = () => {
    setStaged([]);
    setSkipped([]);
    setSourceLabel("");
    setJsonText("");
  };

  const handleFiles = async (files: FileList | null, label: string) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const result = await nodesFromFileList(Array.from(files), null);
      stage(result.nodes, result.skipped, label);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const handleZip = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const buf = await files[0].arrayBuffer();
      const result = await nodesFromZip(buf, null);
      stage(result.nodes, result.skipped, files[0].name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZIP import failed");
    } finally {
      setBusy(false);
    }
  };

  const handleJson = () => {
    try {
      const parsed = parseJsonImport(jsonText);
      stage(parsed, [], "pasted JSON");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "JSON import failed");
    }
  };

  const handleApply = () => {
    if (staged.length === 0) return;
    const targetId = mode === "replace" ? null : target === ROOT ? null : target;
    const plan = mergeImport(nodes, staged, mode, collision, targetId);
    const summary =
      mode === "replace"
        ? `Vault replaced — ${plan.added} items imported`
        : `Imported ${plan.added} items` +
          (plan.overwritten ? `, overwrote ${plan.overwritten}` : "") +
          (plan.skippedCollisions ? `, skipped ${plan.skippedCollisions} collisions` : "");
    onApply(plan.nodes, summary, mode);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm uppercase tracking-wider">Import</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Bring in real files, whole folders, ZIP archives or a JSON vault export.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="files">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="files" className="font-mono text-xs gap-1"><FileUp size={12} /> Files</TabsTrigger>
            <TabsTrigger value="folder" className="font-mono text-xs gap-1"><FolderUp size={12} /> Folder</TabsTrigger>
            <TabsTrigger value="zip" className="font-mono text-xs gap-1"><FileArchive size={12} /> ZIP</TabsTrigger>
            <TabsTrigger value="json" className="font-mono text-xs gap-1"><Import size={12} /> JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="pt-3">
            <input
              ref={fileInput} type="file" multiple className="hidden"
              onChange={e => handleFiles(e.target.files, "selected files")}
            />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
              <FileUp size={13} /> Choose files…
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground font-mono">
              Tip: you can also drag & drop files or folders anywhere onto the Files page.
            </p>
          </TabsContent>

          <TabsContent value="folder" className="pt-3">
            <input
              ref={folderInput} type="file" multiple className="hidden"
              {...({ webkitdirectory: "" } as object)}
              onChange={e => handleFiles(e.target.files, "folder")}
            />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => folderInput.current?.click()}>
              <FolderUp size={13} /> Choose a folder…
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground font-mono">
              Recreates the entire directory structure inside the vault.
            </p>
          </TabsContent>

          <TabsContent value="zip" className="pt-3">
            <input
              ref={zipInput} type="file" accept=".zip,application/zip" className="hidden"
              onChange={e => handleZip(e.target.files)}
            />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => zipInput.current?.click()}>
              <FileArchive size={13} /> Choose a .zip…
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground font-mono">
              Stored and deflate-compressed archives are supported.
            </p>
          </TabsContent>

          <TabsContent value="json" className="pt-3 space-y-2">
            <Textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              placeholder='Paste a vault export — {"format":"jackie-vfs",…} — or any {name,type,children} tree'
              className="h-28 font-mono text-xs"
            />
            <Button variant="outline" size="sm" disabled={!jsonText.trim()} onClick={handleJson}>
              <Import size={13} /> Parse JSON
            </Button>
          </TabsContent>
        </Tabs>

        {staged.length > 0 && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-mono text-xs">
                Staged from <span className="text-primary">{sourceLabel}</span>: {stagedStats.folders} folders,{" "}
                {stagedStats.files} files, {formatBytes(stagedStats.bytes)}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-2 font-mono text-[11px]" onClick={reset}>
                Clear
              </Button>
            </div>

            {skipped.length > 0 && (
              <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] font-mono text-muted-foreground">
                  Skipped {skipped.length} oversized file{skipped.length > 1 ? "s" : ""} (&gt;8 MB):{" "}
                  {skipped.slice(0, 5).join(", ")}{skipped.length > 5 ? "…" : ""}
                </p>
              </div>
            )}

            <ScrollArea className="h-40 rounded border border-border bg-muted/30">
              <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre">{stagedPreview}</pre>
            </ScrollArea>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Mode</Label>
                <RadioGroup value={mode} onValueChange={v => setMode(v as ImportMode)} className="space-y-1">
                  <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
                    <RadioGroupItem value="merge" /> Merge into vault
                  </label>
                  <label className="flex items-center gap-2 font-mono text-xs cursor-pointer">
                    <RadioGroupItem value="replace" /> Replace entire vault
                  </label>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  On name collision
                </Label>
                <Select value={collision} onValueChange={v => setCollision(v as CollisionPolicy)} disabled={mode === "replace"}>
                  <SelectTrigger className="h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rename" className="font-mono text-xs">Keep both (rename)</SelectItem>
                    <SelectItem value="overwrite" className="font-mono text-xs">Overwrite existing</SelectItem>
                    <SelectItem value="skip" className="font-mono text-xs">Skip incoming</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Destination
                </Label>
                <Select value={target} onValueChange={setTarget} disabled={mode === "replace"}>
                  <SelectTrigger className="h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT} className="font-mono text-xs">Vault root</SelectItem>
                    {folders.map(f => (
                      <SelectItem key={f.id} value={f.id} className="font-mono text-xs">{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {mode === "replace" && (
              <p className="font-mono text-[11px] text-destructive">
                Replace deletes everything currently in the vault. A safety snapshot is taken first if auto-snapshots are on.
              </p>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={handleApply}>
                <Import size={13} /> {mode === "replace" ? "Replace vault" : "Import"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
