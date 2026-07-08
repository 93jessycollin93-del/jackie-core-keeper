/**
 * Ollama API client for local LLM inference
 * Default endpoint: http://localhost:11434
 */

export interface OllamaConfig {
  endpoint: string;
  model: string;
  temperature?: number;
  topP?: number;
  topK?: number;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

let cachedConfig: OllamaConfig | null = null;

export function getOllamaConfig(): OllamaConfig {
  if (!cachedConfig) {
    const stored = localStorage.getItem("ollama-config");
    cachedConfig = stored
      ? JSON.parse(stored)
      : {
          endpoint: "http://localhost:11434",
          model: "mistral",
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
        };
  }
  return cachedConfig;
}

export function setOllamaConfig(config: Partial<OllamaConfig>) {
  cachedConfig = { ...getOllamaConfig(), ...config };
  localStorage.setItem("ollama-config", JSON.stringify(cachedConfig));
}

export async function checkOllamaHealth(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getOllamaModels(endpoint: string): Promise<string[]> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) return [];

    interface TagsResponse {
      models?: Array<{ name: string }>;
    }
    const data: TagsResponse = await response.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

export async function streamOllamaChat({
  messages,
  config,
  onDelta,
  onDone,
  onError,
}: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  config: OllamaConfig;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}): Promise<void> {
  try {
    const endpoint = config.endpoint.replace(/\/$/, "");
    const url = `${endpoint}/api/chat`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        options: {
          temperature: config.temperature ?? 0.7,
          top_p: config.topP ?? 0.9,
          top_k: config.topK ?? 40,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (!line.trim()) continue;

        try {
          const response: OllamaResponse = JSON.parse(line);
          if (response.message?.content) {
            onDelta(response.message.content);
          }
        } catch {
          continue;
        }
      }
    }

    onDone();
  } catch (error) {
    onError(error instanceof Error ? error.message : "Unknown error");
  }
}
