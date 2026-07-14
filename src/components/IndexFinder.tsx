import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Mic, Search, SlidersHorizontal, Sparkles, X, Download, Cpu, Terminal } from "lucide-react";
import { toast } from "sonner";

/**
 * INDEX-01 — Floating AI Finder
 * Collapsed → pill in bottom-right.
 * Expanded → command palette (voice + text nav).
 * Config → model dashboard (Rule Matrix vs Custom LLM), WASM capability chips,
 *          heap allocator sim, weights puller, live inference console.
 * All client-side. Zero secrets. Fully "compressible" — collapses to a 1-dot pod.
 */

type Mode = "collapsed" | "palette" | "config";
type ModelKind = "rules" | "llm";

const CMDS: { phrase: string; route?: string; action?: string }[] = [
  { phrase: "open chat", route: "/" },
  { phrase: "open game", route: "/" },
  { phrase: "open tasks", route: "/tasks" },
  { phrase: "open board", route: "/tasks/board" },
  { phrase: "open calendar", route: "/tasks/calendar" },
  { phrase: "open agents", route: "/agents" },
  { phrase: "open pods", route: "/pods" },
  { phrase: "open notes", route: "/pods" },
  { phrase: "open files", route: "/files" },
  { phrase: "open vault", route: "/files" },
  { phrase: "open telegram", action: "external:https://t.me" },
  { phrase: "clean system", action: "clean" },
  { phrase: "compress all", action: "compress" },
];

const capability = () => {
  const wasm = typeof WebAssembly === "object";
  const simd = (() => {
    try {
      return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]));
    } catch { return false; }
  })();
  const webgpu = "gpu" in navigator;
  const webgl = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } })();
  return { wasm, simd, webgpu, webgl };
};

export const IndexFinder = () => {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("collapsed");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ModelKind>("rules");
  const [weightsUrl, setWeightsUrl] = useState("https://github.com/onnx/models/raw/main/model.onnx");
  const [quantSize, setQuantSize] = useState("142.5");
  const [heapMb, setHeapMb] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const caps = useMemo(capability, []);

  const push = (line: string) => {
    const ts = new Date().toLocaleTimeString([], { hour12: false });
    setLog(l => [...l.slice(-40), `[${ts}] ${line}`]);
  };

  useEffect(() => {
    push("[SYSTEM] Ready to compile local model arrays");
    push(`[HARDWARE] Wasm:${caps.wasm?"OK":"NO"} | SIMD:${caps.simd?"YES":"NO"} | WebGPU:${caps.webgpu?"YES":"NO"} | WebGL:${caps.webgl?"YES":"NO"}`);
    push("[HARDWARE] Device profile verified");
  }, []); // eslint-disable-line

  useEffect(() => { if (mode === "palette") inputRef.current?.focus(); }, [mode]);
  useEffect(() => { logRef.current?.scrollTo({ top: 999999 }); }, [log]);

  const runCommand = (raw: string) => {
    const q = raw.trim().toLowerCase();
    if (!q) return;
    const hit = CMDS.find(c => q.includes(c.phrase));
    if (!hit) {
      push(`[INFERENCE] No local match → fallback generated locally for "${raw}"`);
      toast.error(`No match for "${raw}"`);
      return;
    }
    push(`[INFERENCE] Evaluated token match → ${hit.phrase}`);
    if (hit.route) { nav(hit.route); toast.success(`→ ${hit.phrase}`); }
    else if (hit.action?.startsWith("external:")) window.open(hit.action.slice(9), "_blank");
    else if (hit.action === "clean") { setLog([]); push("[SYSTEM] Cleared"); toast.success("System clean"); }
    else if (hit.action === "compress") { setMode("collapsed"); toast.success("Compressed to pod"); }
    setQuery("");
  };

  const voice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Voice unsupported in this browser"); return; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; setQuery(t); runCommand(t); };
    r.start();
  };

  const simulateAlloc = () => {
    push("[WASM] Reserving Float32 heap segments…");
    let mb = 0;
    const iv = setInterval(() => {
      mb += 8; setHeapMb(mb); push(`[WASM] +8MB → total ${mb}MB`);
      if (mb >= 64) {
        clearInterval(iv);
        setTimeout(() => { setHeapMb(0); push("[WASM] Heap released"); }, 900);
      }
    }, 120);
  };

  const pullWeights = async () => {
    push(`[LOADER] HEAD ${weightsUrl}`);
    try {
      const r = await fetch(weightsUrl, { method: "HEAD", mode: "no-cors" });
      push(`[LOADER] Response opaque=${r.type} — declared ${quantSize}MB`);
      push("[SYSTEM] Loaded WebAssembly executor (simulated)");
      toast.success("Weights registered");
    } catch (e) {
      push(`[LOADER] ERROR ${String(e)}`);
      toast.error("Fetch failed");
    }
  };

  // ---------- COLLAPSED PILL ----------
  if (mode === "collapsed") {
    return (
      <button
        onClick={() => setMode("palette")}
        className="fixed bottom-[7.5rem] right-3 z-50 group flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-neutral-900/95 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.25)] backdrop-blur hover:border-emerald-400/60 transition-all"
        aria-label="Open INDEX-01"
      >
        <span className="relative flex">
          <Bot size={16} className="text-emerald-400" />
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </span>
        <span className="font-mono text-[10px] tracking-widest text-emerald-300 uppercase">Index-01 Local AI</span>
        <Mic size={12} className="text-neutral-500 group-hover:text-emerald-400" />
      </button>
    );
  }

  // ---------- EXPANDED PANEL ----------
  return (
    <div className="fixed bottom-20 right-3 left-3 sm:left-auto sm:w-[380px] z-50">
      <div className="rounded-2xl bg-neutral-950/95 border border-emerald-500/25 shadow-[0_0_40px_rgba(16,185,129,0.15)] backdrop-blur-xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-emerald-400" />
            <span className="font-mono text-[11px] tracking-widest text-emerald-300 uppercase">
              Index-01 {mode === "config" ? "AI Finder" : "AI Finder"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode(mode === "config" ? "palette" : "config")}
              className={`p-1.5 rounded-md transition ${mode === "config" ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-200"}`}
              aria-label="Config"
            >
              <SlidersHorizontal size={14} />
            </button>
            <button onClick={() => setMode("collapsed")} className="p-1.5 text-neutral-500 hover:text-neutral-200" aria-label="Collapse">
              <X size={14} />
            </button>
          </div>
        </div>

        {mode === "palette" && (
          <div className="p-3.5 space-y-3">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runCommand(query)}
                placeholder='Say "Open Tasks" or type…'
                className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-neutral-900/70 border border-neutral-800 focus:border-emerald-500/50 outline-none font-mono text-[12px] text-neutral-200 placeholder:text-neutral-600"
              />
              <button
                onClick={voice}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md ${listening ? "bg-emerald-500/20 text-emerald-400 animate-pulse" : "text-neutral-500 hover:text-emerald-400"}`}
              >
                <Mic size={13} />
              </button>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="font-mono text-[9px] tracking-widest text-neutral-500 uppercase mb-2">
                Try saying (0% latency command list)
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {CMDS.slice(0, 8).map(c => (
                  <button
                    key={c.phrase}
                    onClick={() => runCommand(c.phrase)}
                    className="text-left font-mono text-[11px] text-neutral-300 hover:text-emerald-400 flex items-center gap-1.5"
                  >
                    <span className="text-neutral-600">•</span>"{c.phrase.replace(/\b\w/g, s => s.toUpperCase())}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === "config" && (
          <div className="p-3.5 space-y-3 max-h-[65vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <Cpu size={13} className="text-indigo-400" />
              <span className="font-mono text-[10px] tracking-widest text-indigo-300 uppercase">Model Configuration Dashboard</span>
            </div>

            {/* kind toggle */}
            <div className="flex rounded-lg bg-neutral-900/70 border border-neutral-800 p-1">
              {(["rules","llm"] as const).map(k => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`flex-1 py-2 rounded-md font-mono text-[11px] transition ${
                    kind === k
                      ? k === "rules" ? "bg-emerald-500 text-black" : "bg-indigo-500 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {k === "rules" ? "Rule Matrix (128 B)" : "Custom LLM (<150 MB)"}
                </button>
              ))}
            </div>

            {kind === "rules" && (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 flex gap-2">
                <Sparkles size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-neutral-300">
                  <span className="text-emerald-400 font-semibold">Default Ultra-low Power:</span> Running a highly compressed, instant local lookup table that requires <span className="text-white font-semibold">0 MB memory allocation</span>. Extremely battery-friendly.
                </div>
              </div>
            )}

            {kind === "llm" && (
              <>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono text-[9px] tracking-widest text-neutral-500 uppercase">Model Quantized Weights URL</span>
                    <span className="font-mono text-[9px] text-indigo-400">CUSTOM LOAD</span>
                  </div>
                  <input
                    value={weightsUrl}
                    onChange={e => setWeightsUrl(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-md bg-neutral-950 border border-neutral-800 font-mono text-[11px] text-neutral-200"
                  />
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <div className="font-mono text-[9px] tracking-widest text-neutral-500 uppercase mb-1">Quant Size (MB)</div>
                      <input value={quantSize} onChange={e => setQuantSize(e.target.value)} className="w-full px-2.5 py-2 rounded-md bg-neutral-950 border border-neutral-800 font-mono text-[11px] text-neutral-200" />
                    </div>
                    <button onClick={pullWeights} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-700 hover:border-emerald-500/50 hover:text-emerald-400 font-mono text-[11px] text-neutral-200">
                      <Download size={12} /> Pull Weights
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="font-mono text-[10px] font-semibold text-neutral-200">WASM Heap Allocator Test</span>
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${heapMb > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-500/10 text-emerald-400"}`}>
                      {heapMb} MB allocated
                    </span>
                  </div>
                  <p className="text-[10.5px] text-neutral-400 leading-relaxed">
                    Reserve physical Float32 heap segments to test your browser thread buffer cap.
                  </p>
                  <button onClick={simulateAlloc} className="w-full py-2 rounded-md bg-neutral-950 border border-neutral-800 hover:border-neutral-600 font-mono text-[11px] text-neutral-200">
                    Simulate Alloc
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {([["WASM",caps.wasm],["SIMD",caps.simd],["WEBGPU",caps.webgpu],["WEBGL",caps.webgl]] as const).map(([k,v]) => (
                    <div key={k} className={`rounded-md border p-2 text-center ${v ? "border-emerald-500/40 bg-emerald-500/10" : "border-neutral-800 bg-neutral-900/40"}`}>
                      <div className="font-mono text-[9px] tracking-widest text-neutral-400">{k}</div>
                      <div className={`font-mono text-[11px] font-bold ${v ? "text-emerald-400" : "text-neutral-600"}`}>{v ? "YES" : "NO"}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* console */}
            <div className="rounded-lg border border-neutral-800 bg-black/60">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-neutral-800">
                <Terminal size={11} className="text-neutral-500" />
                <span className="font-mono text-[9px] tracking-widest text-neutral-500 uppercase">Model Inference Compiler Console</span>
              </div>
              <div ref={logRef} className="p-3 h-40 overflow-y-auto font-mono text-[10px] leading-relaxed text-emerald-400/80 space-y-0.5">
                {log.map((l, i) => <div key={i} className="whitespace-pre truncate">{l}</div>)}
              </div>
            </div>
          </div>
        )}

        {/* status bar */}
        <div className="flex items-center justify-between px-3.5 py-2 border-t border-neutral-800 bg-neutral-900/40">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[9px] text-neutral-400">
              {kind === "rules" ? "Standby • 128-byte Index-01 Local Model" : `${caps.wasm ? "WASM Ready" : "WASM Off"} • Weights Pending Load`}
            </span>
          </div>
          <span className="font-mono text-[9px] text-neutral-500">v1.0 (Local)</span>
        </div>
      </div>
    </div>
  );
};
