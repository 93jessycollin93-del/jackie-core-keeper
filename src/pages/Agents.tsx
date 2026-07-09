import { useEffect, useState } from "react";
import { Agent, createAgent, deleteAgent, listAgents, updateAgent } from "@/lib/agents-db";
import { TOOLS, TOOL_CATEGORIES, TOOL_BY_ID } from "@/lib/tools-registry";
import { runTool } from "@/lib/tool-runner";
import { compressPod } from "@/lib/pods-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bot, Plus, Trash2, Save, X, Play, Zap } from "lucide-react";

const MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-3.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5.5",
];

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setAgents(await listAgents());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    try {
      const a = await createAgent({ name: "New Agent", system_prompt: "You are Jackie, a helpful assistant." });
      await refresh();
      setEditing(a);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      await updateAgent(editing.id, {
        name: editing.name,
        description: editing.description,
        system_prompt: editing.system_prompt,
        model: editing.model,
        tool_ids: editing.tool_ids,
      });
      toast.success("Agent saved");
      // Auto-compress the parent pod when an agent inside it changes
      if (editing.pod_id) {
        compressPod(editing.pod_id).catch(() => {/* silent */});
      }
      await refresh();
      setEditing(null);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleTest = async (toolId: string) => {
    const def = TOOL_BY_ID.get(toolId);
    if (!def?.executable) { toast.error(`${toolId} not executable`); return; }
    // Minimal probe args per tool
    const probes: Record<string, any> = {
      calculator: { expr: "2+2" },
      web_search: { query: "hello" },
      http_request: { url: "https://httpbin.org/get" },
      token_counter: { text: "hello world" },
      system_info: {},
      model_status_check: {},
      network_check: { host: "1.1.1.1" },
      json_parse: { text: '{"a":1}' },
      markdown_to_html: { md: "**hi**" },
      gemini_api: { prompt: "say hi in 3 words" },
      code_execute_javascript: { code: "return 1+1;" },
    };
    const args = probes[toolId] ?? {};
    toast.loading(`Testing ${def.name}…`, { id: toolId });
    const res = await runTool(toolId, args);
    toast.dismiss(toolId);
    if (res.ok) toast.success(`${def.name}: OK`);
    else toast.error(`${def.name}: ${res.error}`);
    console.log(`[tool:${toolId}]`, res);
  };


  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent?")) return;
    await deleteAgent(id);
    if (editing?.id === id) setEditing(null);
    await refresh();
  };

  const toggleTool = (id: string) => {
    if (!editing) return;
    const has = editing.tool_ids.includes(id);
    setEditing({
      ...editing,
      tool_ids: has ? editing.tool_ids.filter(t => t !== id) : [...editing.tool_ids, id],
    });
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <header className="border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="text-primary" size={20} />
          <h1 className="font-mono text-sm uppercase tracking-wider">Agents</h1>
        </div>
        <Button size="sm" onClick={handleCreate}><Plus size={14} /> New</Button>
      </header>

      <div className="grid md:grid-cols-[280px_1fr] gap-0">
        <aside className="border-r border-border p-2 max-h-[calc(100vh-56px)] overflow-y-auto">
          {loading && <p className="text-xs text-muted-foreground p-2">Loading…</p>}
          {!loading && agents.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No agents yet. Create one to customize.</p>
          )}
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => setEditing(a)}
              className={`w-full text-left p-2 rounded text-sm mb-1 ${
                editing?.id === a.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
            >
              <div className="font-mono text-xs">{a.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{a.tool_ids.length} tools · {a.model.split("/")[1]}</div>
            </button>
          ))}
        </aside>

        <main className="p-4 max-h-[calc(100vh-56px)] overflow-y-auto">
          {!editing && <p className="text-sm text-muted-foreground">Select an agent to edit, or create a new one.</p>}
          {editing && (
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-center justify-between">
                <h2 className="font-mono text-xs uppercase">Editing</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X size={14} /></Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(editing.id)}><Trash2 size={14} /></Button>
                  <Button size="sm" onClick={handleSave}><Save size={14} /> Save</Button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Name</label>
                <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Description</label>
                <Input value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">Model</label>
                <select
                  className="w-full bg-background border border-border rounded p-2 text-sm font-mono"
                  value={editing.model}
                  onChange={e => setEditing({ ...editing, model: e.target.value })}
                >
                  {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">System Prompt</label>
                <Textarea
                  rows={6}
                  value={editing.system_prompt}
                  onChange={e => setEditing({ ...editing, system_prompt: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Tools ({editing.tool_ids.length}/{TOOLS.length})
                </label>
                <div className="space-y-3 mt-2">
                  {TOOL_CATEGORIES.map(cat => (
                    <div key={cat}>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">{cat}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {TOOLS.filter(t => t.category === cat).map(t => (
                          <label key={t.id} className="flex items-start gap-2 text-xs p-1.5 rounded hover:bg-muted cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editing.tool_ids.includes(t.id)}
                              onChange={() => toggleTool(t.id)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="font-mono">{t.name}</span>
                              <span className="block text-muted-foreground text-[10px]">{t.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
