import { supabase } from "@/integrations/supabase/client";
import { TOOL_BY_ID } from "./tools-registry";

export type ToolResult = { ok: boolean; tool_id?: string; result?: any; error?: string };

export async function runTool(tool_id: string, args: Record<string, any> = {}): Promise<ToolResult> {
  const def = TOOL_BY_ID.get(tool_id);
  if (!def) return { ok: false, error: `unknown tool ${tool_id}` };
  if (!def.executable) return { ok: false, error: `${tool_id} is registered but not executable in edge runtime` };
  const { data, error } = await supabase.functions.invoke("tool-exec", { body: { tool_id, args } });
  if (error) return { ok: false, error: error.message };
  return data as ToolResult;
}
