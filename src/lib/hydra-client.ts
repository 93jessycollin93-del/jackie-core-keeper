// Client wrapper for the Hydra Coder edge function.
// Ollama URL + model come from browser localStorage (user's own settings, not secrets).

export type HydraCandidate = {
  provider: string;
  model: string;
  ok: boolean;
  answer: string;
  latency_ms: number;
  error?: string;
};

export type HydraResponse = {
  agent: "coder";
  source: string;
  final_answer: string;
  winner: { provider: string; model: string };
  reasoning?: string;
  candidates: HydraCandidate[];
  judge_latency_ms: number;
  total_latency_ms: number;
  error?: string;
};

const OLLAMA_URL_KEY = "hydra.ollama.url";
const OLLAMA_MODEL_KEY = "hydra.ollama.model";
const HYDRA_MODE_KEY = "hydra.mode";

export type HydraMode = "ollama_first" | "parallel" | "cloud_only";

export const getOllamaSettings = () => ({
  url: (typeof window !== "undefined" && localStorage.getItem(OLLAMA_URL_KEY)) || "",
  model:
    (typeof window !== "undefined" && localStorage.getItem(OLLAMA_MODEL_KEY)) ||
    "qwen2.5-coder:7b",
  mode: ((typeof window !== "undefined" && localStorage.getItem(HYDRA_MODE_KEY)) ||
    "ollama_first") as HydraMode,
});

export const setOllamaSettings = (s: { url?: string; model?: string; mode?: HydraMode }) => {
  if (typeof window === "undefined") return;
  if (s.url !== undefined) localStorage.setItem(OLLAMA_URL_KEY, s.url);
  if (s.model !== undefined) localStorage.setItem(OLLAMA_MODEL_KEY, s.model);
  if (s.mode !== undefined) localStorage.setItem(HYDRA_MODE_KEY, s.mode);
};

const HYDRA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hydra-coder`;

export async function callHydraCoder(prompt: string, system?: string): Promise<HydraResponse> {
  const settings = getOllamaSettings();
  const resp = await fetch(HYDRA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      system,
      ollama_url: settings.url || undefined,
      ollama_model: settings.model,
      mode: settings.mode,
    }),
  });
  const data = (await resp.json()) as HydraResponse;
  if (!resp.ok) throw new Error(data.error || `Hydra failed: ${resp.status}`);
  return data;
}
