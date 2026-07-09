import { supabase } from "@/integrations/supabase/client";

export type Agent = {
  id: string;
  user_id: string;
  pod_id: string | null;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  tool_ids: string[];
  flow: any;
  created_at: string;
  updated_at: string;
};

export async function listAgents(): Promise<Agent[]> {
  const { data, error } = await supabase.from("agents").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Agent[];
}

export async function createAgent(input: Partial<Agent> & { name: string }): Promise<Agent> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("agents").insert({
    user_id: userData.user.id,
    name: input.name,
    description: input.description ?? null,
    system_prompt: input.system_prompt ?? "",
    model: input.model ?? "google/gemini-3-flash-preview",
    tool_ids: input.tool_ids ?? [],
    pod_id: input.pod_id ?? null,
    flow: input.flow ?? {},
  }).select().single();
  if (error) throw error;
  return data as Agent;
}

export async function updateAgent(id: string, patch: Partial<Agent>): Promise<Agent> {
  const { data, error } = await supabase.from("agents").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as Agent;
}

export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase.from("agents").delete().eq("id", id);
  if (error) throw error;
}
