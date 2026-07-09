// Universal tool executor. Handles the ~30 keyless/edge-executable tools.
// Called from client via supabase.functions.invoke("tool-exec", { body: { tool_id, args } })
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function gemini(prompt: string, system = ""): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

async function ghFetch(path: string): Promise<any> {
  const tok = Deno.env.get("GITHUB_TOKEN");
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      "Accept": "application/vnd.github+json",
      ...(tok ? { "Authorization": `Bearer ${tok}` } : {}),
    },
  });
  return { status: r.status, body: await r.json() };
}

const EXECUTORS: Record<string, (args: any) => Promise<any>> = {
  // CORE
  web_search: async ({ query }) => {
    const r = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    const html = await r.text();
    const results = [...html.matchAll(/class="result__title">\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .slice(0, 10).map(m => ({ url: m[1], title: m[2].replace(/<[^>]+>/g, "").trim() }));
    return { results };
  },
  code_execute_python: async () => ({ error: "Python execution requires a local runtime agent; edge is JS/TS only." }),
  code_execute_bash: async () => ({ error: "Shell exec unavailable in edge runtime; connect a local Jackie agent." }),
  code_execute_javascript: async ({ code }) => {
    try {
      // deno-lint-ignore no-explicit-any
      const fn = new Function(`return (async()=>{ ${code} })();`);
      const out = await fn();
      return { result: out };
    } catch (e) { return { error: String(e) }; }
  },
  http_request: async ({ url, method = "GET", headers = {}, body }) => {
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    let json; try { json = JSON.parse(txt); } catch { /* ignore */ }
    return { status: r.status, body: json ?? txt };
  },
  calculator: async ({ expr }) => {
    if (!/^[-+*/().\d\s%,eE^]+$/.test(expr)) return { error: "unsafe expression" };
    try { return { result: Function(`"use strict";return (${expr.replace(/\^/g, "**")})`)() }; }
    catch (e) { return { error: String(e) }; }
  },

  // FILE & DATA (storage bucket = chat-attachments)
  file_list: async ({ prefix = "" }) => {
    const url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/list/chat-attachments`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")}` },
      body: JSON.stringify({ prefix, limit: 100 }),
    });
    return { files: await r.json() };
  },
  file_read: async ({ path }) => {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/chat-attachments/${path}`);
    return { status: r.status, size: r.headers.get("content-length"), text: r.status === 200 ? await r.text() : null };
  },
  file_write: async ({ path, content }) => {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/chat-attachments/${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")}` },
      body: content,
    });
    return { status: r.status };
  },
  file_delete: async ({ path }) => {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/chat-attachments/${path}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")}` },
    });
    return { status: r.status };
  },
  json_parse: async ({ text, path }) => {
    const obj = JSON.parse(text);
    if (!path) return { value: obj };
    const parts = path.split(".");
    let v = obj; for (const p of parts) v = v?.[p];
    return { value: v };
  },
  csv_handler: async ({ csv }) => {
    const rows = csv.trim().split("\n").map((r: string) => r.split(","));
    const [header, ...data] = rows;
    return { header, rows: data.map((r: string[]) => Object.fromEntries(header.map((h: string, i: number) => [h, r[i]]))) };
  },
  yaml_parser: async ({ text }) => {
    // very basic: use dynamic import of yaml if present, else naive
    try {
      const { parse } = await import("https://deno.land/std@0.224.0/yaml/mod.ts");
      return { value: parse(text) };
    } catch (e) { return { error: String(e) }; }
  },
  markdown_to_html: async ({ md }) => {
    const html = md
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    return { html };
  },

  // AI
  ollama_call: async ({ prompt, model = "mistral" }) => {
    const base = Deno.env.get("OLLAMA_BASE_URL");
    if (!base) return { error: "OLLAMA_BASE_URL not set" };
    const r = await fetch(`${base}/api/generate`, { method: "POST", body: JSON.stringify({ model, prompt, stream: false }) });
    return await r.json();
  },
  groq_api: async ({ prompt, model = "llama-3.1-8b-instant" }) => {
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return { error: "GROQ_API_KEY not set" };
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
    return await r.json();
  },
  gemini_api: async ({ prompt, system }) => ({ text: await gemini(prompt, system) }),
  model_status_check: async () => {
    const checks: Record<string, any> = {};
    checks.lovable = LOVABLE_API_KEY ? "configured" : "missing";
    checks.groq = Deno.env.get("GROQ_API_KEY") ? "configured" : "missing";
    checks.ollama = Deno.env.get("OLLAMA_BASE_URL") ? "configured" : "missing";
    checks.anthropic = Deno.env.get("ANTHROPIC_API_KEY") ? "configured" : "missing";
    return checks;
  },

  // SYSTEM
  system_info: async () => ({
    runtime: "Deno edge",
    deno: Deno.version,
    memory: (Deno as any).memoryUsage?.() ?? null,
    time: new Date().toISOString(),
  }),
  network_check: async ({ host = "1.1.1.1" }) => {
    const start = Date.now();
    try { const r = await fetch(`https://${host}`); return { ok: r.ok, ms: Date.now() - start, status: r.status }; }
    catch (e) { return { ok: false, error: String(e) }; }
  },

  // GITHUB
  github_issue_read: async ({ owner, repo, number }) => ghFetch(`/repos/${owner}/${repo}/issues/${number}`),
  github_pr_read: async ({ owner, repo, number }) => ghFetch(`/repos/${owner}/${repo}/pulls/${number}`),
  github_search_code: async ({ query }) => ghFetch(`/search/code?q=${encodeURIComponent(query)}`),
  github_commit_info: async ({ owner, repo, sha }) => ghFetch(`/repos/${owner}/${repo}/commits/${sha}`),
  repo_info: async ({ owner, repo }) => ghFetch(`/repos/${owner}/${repo}`),

  // INTEGRATIONS
  slack_send: async ({ text }) => {
    const url = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!url) return { error: "SLACK_WEBHOOK_URL not set" };
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    return { status: r.status };
  },
  discord_notify: async ({ content }) => {
    const url = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!url) return { error: "DISCORD_WEBHOOK_URL not set" };
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    return { status: r.status };
  },
  webhook_call: async ({ url, payload }) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { status: r.status, body: await r.text() };
  },

  // TEXT / NLP
  text_summarize: async ({ text }) => ({ summary: await gemini(text, "Summarize densely, preserve names/numbers/decisions.") }),
  sentiment_analyze: async ({ text }) => ({ label: (await gemini(text, "Reply with exactly one word: positive, negative, or neutral.")).trim().toLowerCase() }),
  token_counter: async ({ text }) => ({ approx_tokens: Math.ceil(text.length / 4), chars: text.length }),
  language_detect: async ({ text }) => ({ language: (await gemini(text, "Reply with only the ISO 639-1 language code of the text.")).trim() }),

  // DATABASE
  sql_query: async () => ({ error: "sql_query requires a linked external DB — configure DATABASE_URL secret first." }),
  postgres_connect: async () => ({ ok: !!Deno.env.get("SUPABASE_URL"), url_configured: !!Deno.env.get("SUPABASE_URL") }),
  sqlite_query: async () => ({ error: "sqlite in edge runtime requires a WASM SQLite module — not yet enabled." }),

  // SECURITY
  api_key_validator: async ({ key, provider }) => {
    const patterns: Record<string, RegExp> = {
      openai: /^sk-[A-Za-z0-9]{20,}$/,
      anthropic: /^sk-ant-[A-Za-z0-9-]{20,}$/,
      groq: /^gsk_[A-Za-z0-9]{20,}$/,
      stripe: /^sk_(live|test)_[A-Za-z0-9]{20,}$/,
      github: /^gh[pousr]_[A-Za-z0-9]{20,}$/,
    };
    const re = patterns[provider];
    return { valid: re ? re.test(key) : null, provider };
  },
  ssl_cert_check: async ({ host }) => {
    try { const r = await fetch(`https://${host}`); return { ok: r.ok, status: r.status, https: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  },
  auth_token_check: async ({ token }) => {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false, error: "not a JWT" };
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      const exp = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
      const expired = payload.exp ? Date.now() / 1000 > payload.exp : null;
      return { valid: true, payload, exp, expired };
    } catch (e) { return { valid: false, error: String(e) }; }
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { tool_id, args } = await req.json();
    const fn = EXECUTORS[tool_id];
    if (!fn) return new Response(JSON.stringify({ error: `tool ${tool_id} not executable in edge` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const result = await fn(args ?? {});
    return new Response(JSON.stringify({ ok: true, tool_id, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
