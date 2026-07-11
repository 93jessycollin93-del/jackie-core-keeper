import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Braces, Copy, Download, FileArchive, FileText, ListTree, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExportFormat, VfsNode } from "@/lib/vfs/types";
import { computeStats, formatBytes } from "@/lib/vfs/vfs-core";
import {
  buildZip, downloadBlob, resolveScope, timestampName, toCsvManifest, toJsonExport,
  toMarkdown, toTreeText, zipEntriesFromNodes,
} from "@/lib/vfs/vfs-export";

const FORMATS: { key: ExportFormat; label: string; hint: string; icon: typeof Braces }[] = [
  { key: "json", label: "JSON vault", hint: "Full fidelity — re-importable with tags, colors & metadata", icon: Braces },
  { key: "zip", label: "ZIP archive", hint: "Real files & folders, opens anywhere", icon: FileArchive },
  { key: "tree", label: "Tree text", hint: "ASCII tree like the unix `tree` command", icon: ListTree },
  { key: "markdown", label: "Markdown", hint: "Outline with optional file contents", icon: FileText },
  { key: "csv", label: "CSV manifest", hint: "Flat path list for spreadsheets", icon: Table2 },
];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: VfsNode[];
  /** Node ids to scope the export to (from selection / context menu). Empty = whole vault. */
  scopeIds: string[];
}

export function ExportDialog({ open, onOpenChange, nodes, scopeIds }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [useScope, setUseScope] = useState(true);
  const [includeContent, setIncludeContent] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [showSizes, setShowSizes] = useState(true);

  const effectiveScope = useScope && scopeIds.length > 0 ? scopeIds : undefined;
  const scoped = useMemo(() => resolveScope(nodes, effectiveScope), [nodes, effectiveScope]);
  const stats = useMemo(() => computeStats(scoped), [scoped]);

  const textOutput = useMemo(() => {
    if (!open) return "";
    try {
      switch (format) {
        case "json": return toJsonExport(nodes, { scopeIds: effectiveScope, includeContent, pretty });
        case "tree": return toTreeText(nodes, { scopeIds: effectiveScope, showSizes });
        case "markdown": return toMarkdown(nodes, { scopeIds: effectiveScope, includeContent });
        case "csv": return toCsvManifest(nodes, effectiveScope);
        case "zip": {
          const entries = zipEntriesFromNodes(nodes, effectiveScope);
          const listing = entries.slice(0, 60).map(e => `${e.path}  (${formatBytes(e.data.length)})`);
          if (entries.length > 60) listing.push(`… and ${entries.length - 60} more`);
          return listing.join("\n") || "(empty archive)";
        }
      }
    } catch (e) {
      return `Export failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }, [open, format, nodes, effectiveScope, includeContent, pretty, showSizes]);

  const preview = textOutput.length > 6000 ? textOutput.slice(0, 6000) + "\n… (truncated preview)" : textOutput;

  const handleDownload = () => {
    try {
      if (format === "zip") {
        const bytes = buildZip(zipEntriesFromNodes(nodes, effectiveScope));
        downloadBlob(timestampName("vault", "zip"), new Blob([bytes as unknown as BlobPart], { type: "application/zip" }));
      } else {
        const ext = format === "json" ? "json" : format === "markdown" ? "md" : format === "csv" ? "csv" : "txt";
        const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain";
        downloadBlob(timestampName("vault", ext), new Blob([textOutput], { type: mime }));
      }
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textOutput);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm uppercase tracking-wider">Export vault</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {stats.folders} folders · {stats.files} files · {formatBytes(stats.bytes)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="space-y-4">
            <RadioGroup value={format} onValueChange={v => setFormat(v as ExportFormat)} className="space-y-1">
              {FORMATS.map(f => (
                <label
                  key={f.key}
                  className={`flex items-start gap-2 rounded border p-2 cursor-pointer transition-colors ${
                    format === f.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={f.key} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      <f.icon size={12} className="text-primary shrink-0" /> {f.label}
                    </span>
                    <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">{f.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>

            <div className="space-y-2 border-t border-border pt-3">
              {scopeIds.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-mono text-[11px]">Selection only ({scopeIds.length})</Label>
                  <Switch checked={useScope} onCheckedChange={setUseScope} />
                </div>
              )}
              {(format === "json" || format === "markdown") && (
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-mono text-[11px]">Include file contents</Label>
                  <Switch checked={includeContent} onCheckedChange={setIncludeContent} />
                </div>
              )}
              {format === "json" && (
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-mono text-[11px]">Pretty-print</Label>
                  <Switch checked={pretty} onCheckedChange={setPretty} />
                </div>
              )}
              {format === "tree" && (
                <div className="flex items-center justify-between gap-2">
                  <Label className="font-mono text-[11px]">Show file sizes</Label>
                  <Switch checked={showSizes} onCheckedChange={setShowSizes} />
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Preview
            </div>
            <ScrollArea className="h-72 rounded border border-border bg-muted/30">
              <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre">{preview}</pre>
            </ScrollArea>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {format !== "zip" && (
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy size={13} /> Copy
            </Button>
          )}
          <Button size="sm" onClick={handleDownload}>
            <Download size={13} /> Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
