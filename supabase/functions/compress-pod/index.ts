// Compresses a pod's contents (child pods + item_refs + agent notes) into a
// dense summary blob. Nested pods are compressed hierarchically: children first,
// then their summaries roll up into the parent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function summarize(text: string): Promise<string> {
  if (!text.trim()) return "(empty pod)";
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You compress context into the densest possible summary. Preserve names, IDs, numbers, decisions, and open questions. Drop pleasantries. Output plain text, no markdown headers." },
        { role: "user", content: text.slice(0, 60000) },
      ],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI ${resp.status}: ${t}`);
  }
  const j = await resp.json();
  return j.choices?.[0]?.message?.content?.trim() ?? "(no summary)";
}

async function compressPodRecursive(supa: any, podId: string): Promise<string> {
  const { data: pod, error } = await supa.from("pods").select("*").eq("id", podId).single();
  if (error) throw error;

  const { data: children } = await supa.from("pods").select("*").eq("parent_pod_id", podId);
  const childSummaries: string[] = [];
  for (const c of children ?? []) {
    const s = c.compressed_context ?? await compressPodRecursive(supa, c.id);
    childSummaries.push(`[POD: ${c.name}]\n${s}`);
  }

  const { data: agents } = await supa.from("agents").select("name,description,system_prompt").eq("pod_id", podId);
  const agentBlock = (agents ?? []).map((a: any) =>
    `[AGENT: ${a.name}]\n${a.description ?? ""}\n${a.system_prompt}`
  ).join("\n\n");

  const items = (pod.item_refs ?? []) as Array<{ kind: string; text?: string }>;
  const itemBlock = items.map(i => `[${i.kind}] ${i.text ?? ""}`).join("\n");

  const raw = [
    pod.description ?? "",
    itemBlock,
    agentBlock,
    childSummaries.join("\n\n"),
  ].filter(Boolean).join("\n\n---\n\n");

  const summary = await summarize(raw);

  await supa.from("pods").update({
    compressed_context: summary,
    compressed_at: new Date().toISOString(),
  }).eq("id", podId);

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { pod_id } = await req.json();
    if (!pod_id) throw new Error("pod_id required");
    await compressPodRecursive(supa, pod_id);
    const { data: pod } = await supa.from("pods").select("*").eq("id", pod_id).single();
    return new Response(JSON.stringify({ pod }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
