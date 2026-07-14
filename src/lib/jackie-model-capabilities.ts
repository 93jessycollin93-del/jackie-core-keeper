// Per-model capability inference. Heuristic — derived from provider metadata
// and public model cards; not a network call. Keep additions small and honest.
import type { ProviderId, ModelDef } from "./jackie-providers";

export interface ModelCapabilities {
  chat: boolean;
  tools: boolean;
  json: boolean;
  /** Context window in tokens; 0 = unknown. */
  context: number;
}

/** Approx context windows by id substring. First match wins. */
const CTX_RULES: Array<[RegExp, number]> = [
  [/gemini-3.*pro/i, 2_000_000],
  [/gemini-2\.5-pro/i, 2_000_000],
  [/gemini-3.*flash/i, 1_000_000],
  [/gemini-2\.5-flash/i, 1_000_000],
  [/gpt-5/i, 400_000],
  [/llama-?4/i, 1_000_000],
  [/llama-?3\.3.*70b/i, 128_000],
  [/llama-?3\.[12].*(70b|405b|90b)/i, 128_000],
  [/llama-?3\.[12].*(8b|11b|3b|1b)/i, 128_000],
  [/llama3\.[23]/i, 128_000],
  [/qwen.*coder/i, 128_000],
  [/qwen[-\.]?2\.5|qwen-?3/i, 128_000],
  [/deepseek-r1/i, 64_000],
  [/deepseek-(coder|chat|v[23])/i, 64_000],
  [/mixtral-8x7b-32768/i, 32_768],
  [/mixtral/i, 32_000],
  [/mistral-small-3/i, 128_000],
  [/mistral[-:]?7b/i, 32_000],
  [/gemma-?[23]-27b/i, 8_192],
  [/gemma2?[-:]?(9b|27b)/i, 8_192],
  [/phi-?3.*128k/i, 128_000],
  [/phi-?3/i, 4_096],
  [/hermes-3/i, 128_000],
  [/codellama/i, 16_000],
  [/starcoder2/i, 16_000],
  [/llama-guard/i, 8_192],
];

function contextFor(id: string): number {
  for (const [re, n] of CTX_RULES) if (re.test(id)) return n;
  return 0;
}

/** Models that don't do function-calling / tool-use reliably. */
const NO_TOOLS = [
  /llama-guard/i,           // safety classifier
  /deepseek-r1/i,           // pure reasoning, no native tools
  /-vision/i,               // most vision-only variants
  /llama-?3\.2-(1b|3b)/i,   // too small for reliable tools
  /phi-?3/i,
  /gemma-?2-9b/i,
];

/** Models that don't reliably emit strict JSON schema output. */
const NO_JSON = [
  /llama-guard/i,
  /-vision/i,
  /llama-?3\.2-1b/i,
];

function matchesAny(id: string, list: RegExp[]) {
  return list.some((re) => re.test(id));
}

export function inferCapabilities(_provider: ProviderId, m: ModelDef): ModelCapabilities {
  const id = m.id;
  const chat = true;
  const tools = !matchesAny(id, NO_TOOLS);
  const json = !matchesAny(id, NO_JSON);
  return { chat, tools, json, context: contextFor(id) };
}

export function formatContext(n: number): string {
  if (!n) return "?";
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}
