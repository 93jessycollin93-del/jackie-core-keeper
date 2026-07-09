import { supabase } from "@/integrations/supabase/client";

export type Pod = {
  id: string;
  user_id: string;
  parent_pod_id: string | null;
  name: string;
  description: string | null;
  compressed_context: string | null;
  item_refs: Array<{ kind: string; id?: string; text?: string }>;
  compressed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listPods(): Promise<Pod[]> {
  const { data, error } = await supabase.from("pods").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pod[];
}

export async function createPod(input: { name: string; parent_pod_id?: string | null; description?: string }): Promise<Pod> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("pods").insert([{
    user_id: userData.user.id,
    name: input.name,
    parent_pod_id: input.parent_pod_id ?? null,
    description: input.description ?? null,
  }]).select().single();
  if (error) throw error;
  return data as Pod;
}

export async function updatePod(id: string, patch: Partial<Pod>): Promise<Pod> {
  const { data, error } = await supabase.from("pods").update(patch as any).eq("id", id).select().single();
  if (error) throw error;
  return data as Pod;
}

export async function deletePod(id: string): Promise<void> {
  const { error } = await supabase.from("pods").delete().eq("id", id);
  if (error) throw error;
}

export async function compressPod(id: string): Promise<Pod> {
  const { data, error } = await supabase.functions.invoke("compress-pod", { body: { pod_id: id } });
  if (error) throw error;
  return data.pod as Pod;
}

// Build a tree from a flat list
export type PodNode = Pod & { children: PodNode[] };
export function buildPodTree(pods: Pod[]): PodNode[] {
  const map = new Map<string, PodNode>();
  pods.forEach(p => map.set(p.id, { ...p, children: [] }));
  const roots: PodNode[] = [];
  map.forEach(node => {
    if (node.parent_pod_id && map.has(node.parent_pod_id)) {
      map.get(node.parent_pod_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}
