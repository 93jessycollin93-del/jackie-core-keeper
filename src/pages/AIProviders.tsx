import { useState } from "react";
import { Link } from "react-router-dom";
import { PROVIDERS, OLLAMA_AGENTS, FRAMEWORKS, findProvider, type ProviderId } from "@/lib/jackie-providers";
import { streamProviderChat } from "@/lib/jackie-provider-stream";
import { streamProviderChatWithFallback, type FallbackAttempt } from "@/lib/jackie-provider-fallback";
import { inferCapabilities, formatContext } from "@/lib/jackie-model-capabilities";
import { checkProviderHealth, type HealthResult } from "@/lib/jackie-provider-health";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Zap, Cpu, Cloud, HardDrive, ExternalLink, KeyRound, Play, Loader2, CheckCircle2, Network, Users, Workflow, Database, Blocks, AlertTriangle, ShieldCheck, Activity, Radio } from "lucide-react";

const FRAMEWORK_ICONS = {
  graph: Network,
  crew: Users,
  workflow: Workflow,
  rag: Database,
  kernel: Blocks,
} as const;

function CapChips({ provider, modelId }: { provider: ProviderId; modelId: string }) {
  const def = findProvider(provider);
  const m = def?.models.find((x) => x.id === modelId);
  if (!m) return null;
  const c = inferCapabilities(provider, m);
  return (
    <span className="inline-flex flex-wrap gap-1 items-center">
      {c.chat && <span className="text-[9px] px-1 rounded bg-slate-500/20 text-slate-300" title="Chat completions">chat</span>}
      {c.tools && <span className="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-400" title="Function / tool calling">tools</span>}
      {c.json && <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-400" title="Structured JSON output">json</span>}
      {c.context > 0 && <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300" title="Approx context window">{formatContext(c.context)}ctx</span>}
    </span>
  );
}

const STATUS_STYLE: Record<HealthResult["status"], string> = {
  idle: "text-muted-foreground",
  checking: "text-blue-400",
  ok: "text-green-500",
  degraded: "text-amber-500",
  error: "text-red-400",
};


const ICONS: Record<ProviderId, typeof Zap> = {
  lovable: Cloud,
  groq: Zap,
  openrouter: Cpu,
  ollama: HardDrive,
};

export default function AIProviders() {
  const [providerId, setProviderId] = useState<ProviderId>("lovable");
  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  const [modelId, setModelId] = useState(provider.models[0].id);
  const [prompt, setPrompt] = useState("Say hello in 1 sentence. Include your model name.");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<ProviderId, HealthResult>>({
    lovable: { status: "idle" },
    groq: { status: "idle" },
    openrouter: { status: "idle" },
    ollama: { status: "idle" },
  });
  const [autoFallback, setAutoFallback] = useState(true);
  const [fallbackTrail, setFallbackTrail] = useState<FallbackAttempt[]>([]);
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);

  const pingProvider = async (id: ProviderId) => {
    const p = PROVIDERS.find((x) => x.id === id)!;
    setHealth((h) => ({ ...h, [id]: { status: "checking" } }));
    const res = await checkProviderHealth({ provider: id, model: p.models[0].id });
    setHealth((h) => ({ ...h, [id]: res }));
    return res;
  };

  const pingAll = async () => {
    await Promise.all(PROVIDERS.map((p) => pingProvider(p.id)));
  };

  const runTest = async (opts?: { provider?: ProviderId; model?: string; prompt?: string }) => {
    const useProvider = opts?.provider ?? providerId;
    const useModel = opts?.model ?? modelId;
    const usePrompt = opts?.prompt ?? prompt;
    if (opts?.provider && opts.provider !== providerId) setProviderId(opts.provider);
    if (opts?.model && opts.model !== modelId) setModelId(opts.model);
    if (opts?.prompt) setPrompt(opts.prompt);
    setRunning(true); setOutput(""); setError(null);
    setFallbackTrail([]);
    setActiveProvider(useProvider);
    document.getElementById("provider-test-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });

    // Skip pre-flight health gate when auto-fallback is on — fallback handles failures.
    if (!autoFallback) {
      const current = health[useProvider];
      if (!current || current.status === "idle" || current.status === "error") {
        setHealth((h) => ({ ...h, [useProvider]: { status: "checking" } }));
        const res = await checkProviderHealth({ provider: useProvider, model: useModel });
        setHealth((h) => ({ ...h, [useProvider]: res }));
        if (res.status === "error") {
          setError(`Health check failed before test: ${res.error ?? "unknown"}`);
          setRunning(false);
          return;
        }
      }
      await streamProviderChat({
        provider: useProvider,
        model: useModel,
        messages: [{ role: "user", content: usePrompt }],
        system: "You are Jackie. Respond concisely.",
        onDelta: (t) => setOutput((o) => o + t),
        onDone: () => setRunning(false),
        onError: (e) => { setError(e); setRunning(false); },
      });
      return;
    }

    await streamProviderChatWithFallback({
      provider: useProvider,
      model: useModel,
      messages: [{ role: "user", content: usePrompt }],
      system: "You are Jackie. Respond concisely.",
      onDelta: (t) => setOutput((o) => o + t),
      onDone: () => setRunning(false),
      onError: (e) => { setError(e); setRunning(false); },
      onProviderChange: (p, m) => {
        setActiveProvider(p);
        setHealth((h) => ({ ...h, [p]: h[p].status === "idle" ? { status: "checking" } : h[p] }));
      },
      onAttempt: (a) => {
        setFallbackTrail((t) => [...t, a]);
        setHealth((h) => ({
          ...h,
          [a.provider]: a.ok
            ? { status: "ok", latencyMs: h[a.provider].latencyMs ?? 0 }
            : { status: "error", error: a.error },
        }));
      },
    });
  };

  const switchProvider = (id: ProviderId) => {
    setProviderId(id);
    const p = PROVIDERS.find((x) => x.id === id)!;
    setModelId(p.models[0].id);
    setOutput(""); setError(null);
  };


  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">AI Provider Hub</h1>
            <p className="text-sm text-muted-foreground">Jackie here — pick a provider, test it, wire it into any bot.</p>
          </div>
        </div>

        {/* Health check bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="w-3.5 h-3.5 text-primary" />
            Provider health — pings each endpoint with a minimal prompt before you test.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none border border-border rounded px-2 h-8">
              <input
                type="checkbox"
                checked={autoFallback}
                onChange={(e) => setAutoFallback(e.target.checked)}
                className="accent-primary"
              />
              Auto-fallback (Ollama → Groq → OpenRouter → Lovable)
            </label>
            <Link to="/secrets-audit">
              <Button size="sm" variant="ghost" className="gap-1.5 h-8 border border-border">
                <ShieldCheck className="w-3.5 h-3.5" />
                Secrets audit
              </Button>
            </Link>
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={pingAll}>
              <Radio className="w-3.5 h-3.5" />
              Ping all
            </Button>
          </div>
        </div>

        {/* Provider grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PROVIDERS.map((p) => {
            const Icon = ICONS[p.id];
            const active = p.id === providerId;
            const h = health[p.id];
            const dot =
              h.status === "ok" ? "bg-green-500" :
              h.status === "degraded" ? "bg-amber-500" :
              h.status === "error" ? "bg-red-500" :
              h.status === "checking" ? "bg-blue-500 animate-pulse" :
              "bg-muted-foreground/40";
            return (
              <Card
                key={p.id}
                onClick={() => switchProvider(p.id)}
                className={`p-4 cursor-pointer transition border ${active ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${dot}`} title={`Health: ${h.status}`} />
                    {p.free && <Badge variant="secondary" className="text-[10px]">FREE</Badge>}
                  </div>
                </div>
                <h3 className="font-semibold text-sm">{p.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.description}</p>

                <div className={`mt-2 text-[10px] ${STATUS_STYLE[h.status]}`}>
                  {h.status === "idle" && "health: not checked"}
                  {h.status === "checking" && "pinging…"}
                  {h.status === "ok" && `ok · ${h.latencyMs}ms`}
                  {h.status === "degraded" && `degraded · ${h.latencyMs}ms`}
                  {h.status === "error" && `error · ${h.error?.slice(0, 60) ?? ""}`}
                </div>

                {p.requiresSecret && (
                  <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5 text-[11px] text-amber-500">
                    <KeyRound className="w-3 h-3" />
                    Needs {p.requiresSecret}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] gap-1 border border-border"
                    onClick={(e) => { e.stopPropagation(); pingProvider(p.id); }}
                    disabled={h.status === "checking"}
                  >
                    {h.status === "checking" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
                    Ping
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      runTest({
                        provider: p.id,
                        model: p.models[0].id,
                        prompt: `Reply with exactly: "PONG from ${p.label} · ${p.models[0].id}".`,
                      });
                    }}
                    disabled={running}
                  >
                    {running && providerId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    Test
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>


        {/* Test panel */}
        <Card id="provider-test-panel" className="p-4 md:p-6 space-y-4 scroll-mt-4">

          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div>
              <h2 className="font-semibold">Test: {provider.label}</h2>
              <p className="text-xs text-muted-foreground">{provider.description}</p>
            </div>
            {provider.helpUrl && (
              <a href={provider.helpUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Get {provider.requiresSecret ?? "docs"}
                </Button>
              </a>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Model</label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {provider.models.map((m) => {
                    const c = inferCapabilities(providerId, m);
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {m.label}
                          {m.free && <span className="text-[9px] px-1 rounded bg-green-500/20 text-green-500">FREE</span>}
                          {m.vision && <span className="text-[9px] px-1 rounded bg-blue-500/20 text-blue-500">VISION</span>}
                          {m.reasoning && <span className="text-[9px] px-1 rounded bg-purple-500/20 text-purple-500">R1</span>}
                          {c.tools && <span className="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-400">tools</span>}
                          {c.json && <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-400">json</span>}
                          {c.context > 0 && <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300">{formatContext(c.context)}ctx</span>}
                          {m.note && <span className="text-[9px] text-muted-foreground">· {m.note}</span>}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => runTest()} disabled={running} className="w-full gap-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running ? "Streaming..." : "Run test"}
              </Button>
            </div>
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="font-mono text-xs"
          />

          <div className="rounded-lg border border-border bg-secondary/40 p-3 min-h-[140px]">
            {error ? (
              <div className="text-xs text-red-400 font-mono whitespace-pre-wrap">{error}</div>
            ) : output ? (
              <div className="text-xs whitespace-pre-wrap font-mono">
                {output}
                {!running && <CheckCircle2 className="inline w-3 h-3 ml-2 text-green-500" />}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Output appears here…</div>
            )}
          </div>
        </Card>

        {/* Ollama agent presets */}
        <Card className="p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Suggested Ollama Agents</h2>
            <Badge variant="secondary" className="text-[10px]">local · offline · $0</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Install <code className="text-primary">ollama pull &lt;model&gt;</code> on your machine, expose via
            Cloudflare Tunnel, drop URL in <code className="text-primary">OLLAMA_BASE_URL</code>, then hit "Run test" above.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {OLLAMA_AGENTS.map((a) => (
              <div key={a.name} className="rounded-lg border border-border p-3 hover:border-primary/40 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-semibold">{a.name}</span>
                  <button
                    onClick={() => { switchProvider("ollama"); setModelId(a.model); setPrompt(a.role); }}
                    className="text-[10px] text-primary hover:underline"
                  >Load →</button>
                </div>
                <div className="text-[11px] text-muted-foreground mb-1">{a.role}</div>
                <code className="text-[10px] text-primary">{a.model}</code>
              </div>
            ))}
          </div>
        </Card>

        {/* Agent frameworks */}
        <Card className="p-4 md:p-6">
          <div className="flex items-center gap-2 mb-1">
            <Network className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Agent Frameworks</h2>
            <Badge variant="secondary" className="text-[10px]">local · Ollama-first</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Wire Jackie into any of these frameworks. All recommended models run locally via Ollama —
            click a model to load it into the tester above.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {FRAMEWORKS.map((f) => {
              const Icon = FRAMEWORK_ICONS[f.category];
              return (
                <div key={f.id} className="rounded-lg border border-border p-3 hover:border-primary/40 transition">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                      <span className="font-mono text-sm font-semibold">{f.label}</span>
                      {f.officialLink ? (
                        <span title="Verified official docs/repo" className="inline-flex items-center gap-0.5 text-[9px] text-green-500">
                          <ShieldCheck className="w-2.5 h-2.5" /> official
                        </span>
                      ) : (
                        <span title="Best-effort search — not an official project link" className="inline-flex items-center gap-0.5 text-[9px] text-amber-500">
                          <AlertTriangle className="w-2.5 h-2.5" /> search only
                        </span>
                      )}
                    </div>
                    <a href={f.docsUrl} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                      {f.officialLink ? "docs" : "search"} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">{f.description}</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {f.recommendedModels.map((m) => {
                      // Ollama registry ids; infer against a synthetic ModelDef.
                      const caps = inferCapabilities("ollama", { id: m, label: m });
                      return (
                        <span key={m} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5">
                          <button
                            onClick={() => { switchProvider("ollama"); setModelId(m); }}
                            className="text-[10px] text-primary hover:underline font-mono"
                            title="Load into Ollama tester"
                          >
                            {m}
                          </button>
                          {caps.tools && <span className="text-[9px] px-1 rounded bg-cyan-500/20 text-cyan-400">tools</span>}
                          {caps.json && <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-400">json</span>}
                          {caps.context > 0 && <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300">{formatContext(caps.context)}</span>}
                        </span>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[11px] gap-1.5"
                    onClick={() => runTest({
                      provider: "ollama",
                      model: f.recommendedModels[0],
                      prompt: `You are simulating an agent inside the ${f.label} framework. In one short sentence, describe how you would decompose the task "summarize a 3-page PDF" using ${f.label}. End with the exact token OK-${f.id.toUpperCase()}.`,
                    })}
                    disabled={running}
                  >
                    {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    One-click test · {f.recommendedModels[0]}
                  </Button>
                </div>

              );
            })}
          </div>
        </Card>



        {/* Secrets info */}
        <Card className="p-4 md:p-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="text-xs space-y-2">
              <p className="font-semibold text-foreground">Adding API keys in-app</p>
              <p className="text-muted-foreground">
                Open <span className="text-foreground font-mono">Backend → Secrets</span> from the Lovable Cloud panel and paste keys:
              </p>
              <ul className="space-y-1 font-mono text-[11px]">
                <li>· <span className="text-primary">GROQ_API_KEY</span> — free at console.groq.com/keys</li>
                <li>· <span className="text-primary">OPENROUTER_API_KEY</span> — free at openrouter.ai/keys</li>
                <li>· <span className="text-primary">OLLAMA_BASE_URL</span> — your tunnel URL (e.g. https://ollama.yourdomain.com)</li>
                <li>· <span className="text-primary">OLLAMA_API_KEY</span> — optional if your tunnel requires auth</li>
              </ul>
              <p className="text-muted-foreground pt-2">
                No redeploy needed — the edge functions pick them up on the next request.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
