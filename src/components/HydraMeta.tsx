import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Cpu, CheckCircle2, XCircle } from "lucide-react";
import type { HydraCandidate } from "@/lib/hydra-client";

interface HydraMetaProps {
  winner: { provider: string; model: string };
  candidates: HydraCandidate[];
  total_latency_ms: number;
  judge_latency_ms: number;
  source: string;
  reasoning?: string;
}

export const HydraMeta = ({
  winner,
  candidates,
  total_latency_ms,
  judge_latency_ms,
  source,
  reasoning,
}: HydraMetaProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const okCount = candidates.filter((c) => c.ok).length;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Cpu size={10} className="text-primary" />
        <span className="uppercase tracking-wider">
          {t("hydra.meta", {
            count: candidates.length,
            ok: okCount,
            winner: `${winner?.provider}/${winner?.model}`,
            ms: total_latency_ms,
          })}
        </span>
        <span className="ml-auto opacity-60">{source}</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {reasoning && (
            <div className="font-mono text-[10px] text-muted-foreground italic px-2 py-1 bg-secondary/30 rounded-sm">
              {t("hydra.judgeSays")}: {reasoning}
            </div>
          )}
          <div className="grid grid-cols-1 gap-1">
            {candidates.map((c, i) => (
              <details
                key={`${c.provider}-${c.model}-${i}`}
                className="border border-border rounded-sm bg-secondary/20"
              >
                <summary className="cursor-pointer px-2 py-1 flex items-center gap-2 font-mono text-[10px]">
                  {c.ok ? (
                    <CheckCircle2 size={10} className="text-green-500" />
                  ) : (
                    <XCircle size={10} className="text-destructive" />
                  )}
                  <span className="text-foreground">{c.provider}</span>
                  <span className="text-muted-foreground truncate">{c.model}</span>
                  <span className="ml-auto text-muted-foreground">{c.latency_ms}ms</span>
                </summary>
                <div className="px-2 py-1.5 border-t border-border">
                  {c.ok ? (
                    <pre className="font-mono text-[10px] text-foreground/80 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                      {c.answer}
                    </pre>
                  ) : (
                    <div className="font-mono text-[10px] text-destructive break-words">
                      {c.error}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
          <div className="font-mono text-[9px] text-muted-foreground/60 flex gap-3">
            <span>{t("hydra.judgeLatency")}: {judge_latency_ms}ms</span>
            <span>{t("hydra.totalLatency")}: {total_latency_ms}ms</span>
          </div>
        </div>
      )}
    </div>
  );
};
