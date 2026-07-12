import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, CircleAlert, Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { runStartupSelfTest, summarize, type ProbeResult } from "@/lib/self-test";
import { Button } from "@/components/ui/button";

export function StartupSelfTest({ autorun = true }: { autorun?: boolean }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ProbeResult[] | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      setResults(await runStartupSelfTest());
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (autorun) void run();
  }, [autorun]);

  const s = results ? summarize(results) : null;

  return (
    <section className="border border-border rounded-md bg-card">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="font-mono text-sm">Startup self-test · Row-level security</h2>
        </div>
        <div className="flex items-center gap-2">
          {s && (
            <span className={`font-mono text-xs ${s.ok ? "text-primary" : "text-destructive"}`}>
              {s.pass}/{s.total} pass · {s.fail} fail · {s.skip} skip
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={run} disabled={running}>
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span className="ml-1 font-mono text-xs">Re-run</span>
          </Button>
        </div>
      </header>
      <div className="divide-y divide-border">
        {!results && !running && (
          <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
            Idle. Click Re-run to verify RLS.
          </div>
        )}
        {running && !results && (
          <div className="px-4 py-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-mono text-xs">Probing tables under your session…</span>
          </div>
        )}
        {results?.map((r) => {
          const Icon =
            r.status === "pass" ? CheckCircle2 : r.status === "fail" ? XCircle : CircleAlert;
          const color =
            r.status === "pass"
              ? "text-primary"
              : r.status === "fail"
              ? "text-destructive"
              : "text-muted-foreground";
          return (
            <div key={r.table} className="px-4 py-3 flex items-start gap-3">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs">{r.table}</code>
                  <span className={`font-mono text-[10px] uppercase tracking-widest ${color}`}>
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">{r.detail}</div>
                <div className="mt-1 flex gap-3 font-mono text-[10px] text-muted-foreground">
                  <span>own-read: {r.checks.ownReadable ? "✓" : "✗"}</span>
                  <span>isolate: {r.checks.rlsIsolates ? "✓" : "✗"}</span>
                  <span>write-guard: {r.checks.writeGuardEnforced ? "✓" : "✗"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
