// Hydra Coder Agent — Ollama-first, cloud fallback, Lovable AI Gateway ultimate fallback.
// Fans out one prompt to N free providers in parallel, runs a judge, returns the winner.
// Any provider without a configured key/URL is silently skipped — the agent never dies.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Candidate = {
  provider: string;
  model: string;
  ok: boolean;
  answer: string;
  latency_ms: number;
  error?: string;
};

const TIMEOUT_MS = 20000;
const CODER_SYSTEM =
  "You are Hydra Coder. Write clean, correct, production-ready code. Be terse. Use markdown code blocks with language tags. Prefer clarity over cleverness. Explain only when non-obvious.";

// ─── HTTP helper with timeout ─────────────────────────────
async function fetchJson(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Provider callers (all return { answer } or throw) ─────
async function callOllama(prompt: string, system: string, baseUrl: string, model: string) {
  const data = await fetchJson(`${baseUrl.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });
  return data?.message?.content ?? "";
}

async function callGroq(prompt: string, system: string, apiKey: string, model: string) {
  const data = await fetchJson("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callGemini(prompt: string, system: string, apiKey: string, model: string) {
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    }
  );
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callTogether(prompt: string, system: string, apiKey: string, model: string) {
  const data = await fetchJson("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callOpenRouter(prompt: string, system: string, apiKey: string, model: string) {
  const data = await fetchJson("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callCloudflare(prompt: string, system: string, token: string, accountId: string, model: string) {
  const data = await fetchJson(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    }
  );
  return data?.result?.response ?? "";
}

async function callCohere(prompt: string, system: string, apiKey: string, model: string) {
  const data = await fetchJson("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  return data?.message?.content?.[0]?.text ?? "";
}

async function callHuggingFace(prompt: string, system: string, apiKey: string, model: string) {
  const data = await fetchJson(
    `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    }
  );
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callLovableGateway(prompt: string, system: string, apiKey: string, model = "google/gemini-2.5-flash") {
  const data = await fetchJson("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  return data?.choices?.[0]?.message?.content ?? "";
}

// ─── Branch wrapper: measure + trap errors ────────────────
async function branch(
  provider: string,
  model: string,
  fn: () => Promise<string>
): Promise<Candidate> {
  const start = Date.now();
  try {
    const answer = await fn();
    const latency_ms = Date.now() - start;
    if (!answer || !answer.trim()) throw new Error("empty answer");
    return { provider, model, ok: true, answer, latency_ms };
  } catch (e) {
    return {
      provider,
      model,
      ok: false,
      answer: "",
      latency_ms: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── Judge: pick or synthesize the best answer ─────────────
async function judge(prompt: string, candidates: Candidate[], apiKey: string) {
  const winners = candidates.filter((c) => c.ok);
  if (winners.length === 0) throw new Error("no successful candidates");
  if (winners.length === 1) {
    return { winner_index: 0, final_answer: winners[0].answer, reasoning: "sole survivor" };
  }
  const start = Date.now();
  const numbered = winners
    .map((c, i) => `[Candidate ${i}] (${c.provider}/${c.model})\n${c.answer}`)
    .join("\n\n---\n\n");
  const system =
    'You are the judge. Read the candidate coding answers below. Pick the single best one OR synthesize a better answer from the strongest parts. Reply ONLY with strict JSON: {"winner_index": number, "final_answer": string, "reasoning": string}. final_answer must be complete and self-contained. Do not wrap the JSON in code fences.';
  const raw = await callLovableGateway(
    `USER PROMPT:\n${prompt}\n\nCANDIDATES:\n${numbered}`,
    system,
    apiKey
  );
  const latency = Date.now() - start;
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned);
    return { ...parsed, judge_latency_ms: latency };
  } catch {
    // Judge output malformed — fall back to first successful
    return {
      winner_index: 0,
      final_answer: winners[0].answer,
      reasoning: "judge output unparseable; picked first candidate",
      judge_latency_ms: latency,
    };
  }
}

// ─── Handler ───────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const total_start = Date.now();
  try {
    const body = await req.json();
    const prompt: string = (body?.prompt ?? "").toString();
    const system: string = (body?.system ?? CODER_SYSTEM).toString();
    const ollamaUrl: string | undefined = body?.ollama_url;
    const ollamaModel: string = body?.ollama_model ?? "qwen2.5-coder:7b";
    const mode: "ollama_first" | "parallel" | "cloud_only" = body?.mode ?? "ollama_first";

    if (!prompt.trim()) {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = (k: string) => Deno.env.get(k);
    const LOVABLE_API_KEY = env("LOVABLE_API_KEY") ?? "";

    // ── Ollama-first path: try local box, if it answers we're done
    if (mode === "ollama_first" && ollamaUrl) {
      const ollamaCandidate = await branch("ollama", ollamaModel, () =>
        callOllama(prompt, system, ollamaUrl, ollamaModel)
      );
      if (ollamaCandidate.ok) {
        return new Response(
          JSON.stringify({
            agent: "coder",
            source: "ollama",
            final_answer: ollamaCandidate.answer,
            winner: { provider: "ollama", model: ollamaModel },
            candidates: [ollamaCandidate],
            judge_latency_ms: 0,
            total_latency_ms: Date.now() - total_start,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Ollama failed — fall through to cloud fan-out
    }

    // ── Cloud fan-out: every configured provider in parallel
    const tasks: Promise<Candidate>[] = [];

    // Ollama still joins the fan-out in parallel mode (redundancy branch)
    if (mode === "parallel" && ollamaUrl) {
      tasks.push(branch("ollama", ollamaModel, () => callOllama(prompt, system, ollamaUrl, ollamaModel)));
    }

    if (env("GROQ_API_KEY")) {
      tasks.push(branch("groq", "llama-3.3-70b-versatile", () =>
        callGroq(prompt, system, env("GROQ_API_KEY")!, "llama-3.3-70b-versatile")
      ));
      tasks.push(branch("groq", "qwen-2.5-coder-32b", () =>
        callGroq(prompt, system, env("GROQ_API_KEY")!, "qwen-2.5-coder-32b")
      ));
    }
    if (env("GEMINI_API_KEY")) {
      tasks.push(branch("gemini", "gemini-2.0-flash", () =>
        callGemini(prompt, system, env("GEMINI_API_KEY")!, "gemini-2.0-flash")
      ));
    }
    if (env("TOGETHER_API_KEY")) {
      tasks.push(branch("together", "Qwen/Qwen2.5-Coder-32B-Instruct", () =>
        callTogether(prompt, system, env("TOGETHER_API_KEY")!, "Qwen/Qwen2.5-Coder-32B-Instruct")
      ));
    }
    if (env("OPENROUTER_API_KEY")) {
      tasks.push(branch("openrouter", "deepseek/deepseek-chat-v3.1:free", () =>
        callOpenRouter(prompt, system, env("OPENROUTER_API_KEY")!, "deepseek/deepseek-chat-v3.1:free")
      ));
      tasks.push(branch("openrouter", "qwen/qwen-2.5-coder-32b-instruct:free", () =>
        callOpenRouter(prompt, system, env("OPENROUTER_API_KEY")!, "qwen/qwen-2.5-coder-32b-instruct:free")
      ));
    }
    if (env("CLOUDFLARE_API_TOKEN") && env("CLOUDFLARE_ACCOUNT_ID")) {
      tasks.push(branch("cloudflare", "@cf/qwen/qwen2.5-coder-32b-instruct", () =>
        callCloudflare(prompt, system, env("CLOUDFLARE_API_TOKEN")!, env("CLOUDFLARE_ACCOUNT_ID")!, "@cf/qwen/qwen2.5-coder-32b-instruct")
      ));
    }
    if (env("COHERE_API_KEY")) {
      tasks.push(branch("cohere", "command-r-08-2024", () =>
        callCohere(prompt, system, env("COHERE_API_KEY")!, "command-r-08-2024")
      ));
    }
    if (env("HUGGINGFACE_API_KEY")) {
      tasks.push(branch("huggingface", "mistralai/Mixtral-8x7B-Instruct-v0.1", () =>
        callHuggingFace(prompt, system, env("HUGGINGFACE_API_KEY")!, "mistralai/Mixtral-8x7B-Instruct-v0.1")
      ));
    }

    let candidates: Candidate[] = [];
    if (tasks.length > 0) {
      const settled = await Promise.allSettled(tasks);
      candidates = settled.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : { provider: "unknown", model: "unknown", ok: false, answer: "", latency_ms: 0, error: String(r.reason) }
      );
    }

    const anyOk = candidates.some((c) => c.ok);

    // Ultimate fallback: Lovable AI Gateway
    if (!anyOk) {
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({
            error: "All providers failed and no fallback available. Configure Ollama URL or add at least one provider API key.",
            candidates,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const fallback = await branch("lovable-gateway", "google/gemini-2.5-flash", () =>
        callLovableGateway(prompt, system, LOVABLE_API_KEY)
      );
      candidates.push(fallback);
      if (!fallback.ok) {
        return new Response(
          JSON.stringify({ error: "All providers including fallback failed", candidates }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Judge
    let judged;
    try {
      judged = LOVABLE_API_KEY
        ? await judge(prompt, candidates, LOVABLE_API_KEY)
        : (() => {
            const winners = candidates.filter((c) => c.ok);
            return { winner_index: 0, final_answer: winners[0].answer, reasoning: "no judge key", judge_latency_ms: 0 };
          })();
    } catch (e) {
      const winners = candidates.filter((c) => c.ok);
      judged = {
        winner_index: 0,
        final_answer: winners[0]?.answer ?? "",
        reasoning: `judge failed: ${e instanceof Error ? e.message : String(e)}`,
        judge_latency_ms: 0,
      };
    }

    const winners = candidates.filter((c) => c.ok);
    const winner = winners[judged.winner_index] ?? winners[0];

    return new Response(
      JSON.stringify({
        agent: "coder",
        source: mode,
        final_answer: judged.final_answer,
        winner: { provider: winner?.provider, model: winner?.model },
        reasoning: judged.reasoning,
        candidates,
        judge_latency_ms: judged.judge_latency_ms ?? 0,
        total_latency_ms: Date.now() - total_start,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("hydra-coder error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
