import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Server } from "lucide-react";
import { getOllamaSettings, setOllamaSettings, type HydraMode } from "@/lib/hydra-client";

interface HydraSettingsProps {
  open: boolean;
  onClose: () => void;
}

export const HydraSettings = ({ open, onClose }: HydraSettingsProps) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [model, setModel] = useState("qwen2.5-coder:7b");
  const [mode, setMode] = useState<HydraMode>("ollama_first");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const s = getOllamaSettings();
      setUrl(s.url);
      setModel(s.model);
      setMode(s.mode);
      setTestResult(null);
    }
  }, [open]);

  if (!open) return null;

  const save = () => {
    setOllamaSettings({ url: url.trim(), model: model.trim(), mode });
    onClose();
  };

  const testConnection = async () => {
    if (!url.trim()) {
      setTestResult(t("hydra.settings.urlRequired"));
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch(`${url.replace(/\/+$/, "")}/api/tags`);
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      const models = (data?.models ?? []).map((m: any) => m.name).join(", ");
      setTestResult(t("hydra.settings.connected") + (models ? ` — ${models}` : ""));
    } catch (e) {
      setTestResult(
        t("hydra.settings.failed") + `: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-popover border border-border rounded-sm w-full max-w-md p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-primary" />
            <span className="font-mono text-xs uppercase tracking-wider">
              {t("hydra.settings.title")}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-2">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("hydra.settings.url")}
            </span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full mt-1 px-2 py-1.5 rounded-sm bg-secondary/50 border border-border font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("hydra.settings.model")}
            </span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="qwen2.5-coder:7b"
              className="w-full mt-1 px-2 py-1.5 rounded-sm bg-secondary/50 border border-border font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("hydra.settings.mode")}
            </span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as HydraMode)}
              className="w-full mt-1 px-2 py-1.5 rounded-sm bg-secondary/50 border border-border font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="ollama_first">{t("hydra.settings.modeOllamaFirst")}</option>
              <option value="parallel">{t("hydra.settings.modeParallel")}</option>
              <option value="cloud_only">{t("hydra.settings.modeCloudOnly")}</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground rounded-sm disabled:opacity-50"
          >
            {testing ? t("hydra.settings.testing") : t("hydra.settings.test")}
          </button>
          {testResult && (
            <span className="font-mono text-[10px] text-muted-foreground truncate">
              {testResult}
            </span>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground leading-relaxed">
          {t("hydra.settings.hint")}
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {t("app.cancel")}
          </button>
          <button
            onClick={save}
            className="px-3 py-1 bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-wider rounded-sm hover:opacity-90"
          >
            {t("app.save", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
};
