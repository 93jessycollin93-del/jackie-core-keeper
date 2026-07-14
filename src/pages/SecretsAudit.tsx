import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ShieldAlert, ShieldCheck, KeyRound, Network, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { scanFrontendLeaks, buildSecretUsageGraph, type LeakFinding } from "@/lib/jackie-secret-audit";
import { KEY_VALIDATORS, validateKey } from "@/lib/jackie-key-validation";

// Best-effort list of secrets known to exist in this project — the Cloud
// secrets tool is server-side, so we seed with what the workspace exposes
// via context and edge-function reads. The usage graph auto-adds any others
// it discovers in `Deno.env.get(...)` calls.
const KNOWN_SECRETS = [
  "LOVABLE_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "OLLAMA_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_JWKS",
  "SUPABASE_DB_URL",
];

const SEV_STYLE = {
  critical: "text-red-400 border-red-500/40 bg-red-500/5",
  warn: "text-amber-400 border-amber-500/40 bg-amber-500/5",
  info: "text-sky-400 border-sky-500/40 bg-sky-500/5",
} as const;

export default function SecretsAudit() {
  const leaks = useMemo<LeakFinding[]>(() => scanFrontendLeaks(), []);
  const graph = useMemo(() => buildSecretUsageGraph(KNOWN_SECRETS), []);

  const [validatorInput, setValidatorInput] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const critical = leaks.filter((l) => l.severity === "critical").length;
  const warn = leaks.filter((l) => l.severity === "warn").length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start gap-3">
          <Link to="/providers" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="font-mono text-xl flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              Secrets Audit
            </h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Static scan of the frontend bundle + edge-function sources. Runs locally in your browser — nothing is uploaded.
            </p>
          </div>
        </header>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground uppercase">Critical leaks</div>
            <div className={`text-2xl font-mono ${critical ? "text-red-400" : "text-green-500"}`}>{critical}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground uppercase">Warnings</div>
            <div className={`text-2xl font-mono ${warn ? "text-amber-400" : "text-green-500"}`}>{warn}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground uppercase">Secrets mapped</div>
            <div className="text-2xl font-mono text-primary">{graph.length}</div>
          </Card>
        </div>

        {/* Leaks */}
        <section className="space-y-2">
          <h2 className="font-mono text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Frontend exposure scan
          </h2>
          {leaks.length === 0 ? (
            <Card className="p-4 flex items-center gap-2 text-sm text-green-500">
              <ShieldCheck className="w-4 h-4" />
              No hardcoded keys, VITE_* secret leaks, or risky token logs detected in <code>src/**</code>.
            </Card>
          ) : (
            <div className="space-y-2">
              {leaks.map((l, i) => (
                <Card key={i} className={`p-3 border ${SEV_STYLE[l.severity]}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">{l.severity}</Badge>
                      <span className="font-mono text-xs">{l.category}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{l.file}:{l.line}</span>
                  </div>
                  <div className="text-xs mb-1">{l.detail}</div>
                  <pre className="text-[11px] font-mono bg-background/60 border border-border rounded px-2 py-1 overflow-x-auto">
                    {l.snippet}
                  </pre>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Secret usage graph */}
        <section className="space-y-2">
          <h2 className="font-mono text-sm flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            Secret → edge-function usage graph
          </h2>
          <p className="text-xs text-muted-foreground">
            Every configured secret and the edge functions that read it via <code>Deno.env.get(...)</code>.
          </p>
          <div className="grid gap-2">
            {graph.map((row) => (
              <Card key={row.secret} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-primary" />
                    <span className="font-mono text-sm">{row.secret}</span>
                  </div>
                  {row.functions.length === 0 ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">unused</Badge>
                  ) : (
                    <Badge className="text-[10px]">{row.functions.length} consumer{row.functions.length === 1 ? "" : "s"}</Badge>
                  )}
                </div>
                {row.functions.length > 0 && (
                  <ul className="space-y-1">
                    {row.functions.map((fn) => (
                      <li key={fn.name} className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-primary">{fn.name}</span>
                        <span className="text-muted-foreground">{fn.file}:{fn.lines.join(",")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </section>

        {/* Client-side key format validator */}
        <section className="space-y-2">
          <h2 className="font-mono text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Key format pre-flight
          </h2>
          <p className="text-xs text-muted-foreground">
            Paste a key to check its shape locally before wasting a health-check round-trip. Values never leave your browser and are not stored.
          </p>
          <div className="grid gap-2">
            {Object.values(KEY_VALIDATORS).map((v) => {
              const raw = validatorInput[v.secretName] ?? "";
              const result = raw ? validateKey(v.secretName, raw) : null;
              const shown = revealed[v.secretName];
              return (
                <Card key={v.secretName} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-mono text-sm">{v.secretName}</div>
                      <div className="text-[11px] text-muted-foreground">{v.label} — expected: <code>{v.expected}</code></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type={shown ? "text" : "password"}
                      autoComplete="off"
                      value={raw}
                      onChange={(e) => setValidatorInput((s) => ({ ...s, [v.secretName]: e.target.value }))}
                      placeholder={v.expected}
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRevealed((s) => ({ ...s, [v.secretName]: !s[v.secretName] }))}
                      aria-label={shown ? "Hide value" : "Show value"}
                    >
                      {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  {result && (
                    <div
                      className={`mt-2 text-[11px] font-mono ${
                        result.severity === "ok" ? "text-green-500" :
                        result.severity === "warn" ? "text-amber-400" :
                        "text-red-400"
                      }`}
                    >
                      {result.severity.toUpperCase()} · {result.message}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
