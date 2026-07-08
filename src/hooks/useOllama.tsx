import { useState, useCallback, useEffect } from "react";
import {
  getOllamaConfig,
  setOllamaConfig,
  checkOllamaHealth,
  getOllamaModels,
  streamOllamaChat,
  type OllamaConfig,
} from "@/lib/ollama-client";

export interface UseOllamaState {
  isEnabled: boolean;
  isHealthy: boolean;
  isLoading: boolean;
  models: string[];
  config: OllamaConfig;
  error: string | null;
}

export function useOllama() {
  const [state, setState] = useState<UseOllamaState>({
    isEnabled: localStorage.getItem("ollama-enabled") === "true",
    isHealthy: false,
    isLoading: false,
    models: [],
    config: getOllamaConfig(),
    error: null,
  });

  const checkHealth = useCallback(async (endpoint?: string) => {
    const ep = endpoint || state.config.endpoint;
    const healthy = await checkOllamaHealth(ep);

    if (healthy) {
      const models = await getOllamaModels(ep);
      setState((prev) => ({ ...prev, isHealthy: true, models, error: null }));
    } else {
      setState((prev) => ({
        ...prev,
        isHealthy: false,
        models: [],
        error: `Cannot connect to Ollama at ${ep}`,
      }));
    }
  }, [state.config.endpoint]);

  const setEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem("ollama-enabled", enabled ? "true" : "false");
    setState((prev) => ({ ...prev, isEnabled: enabled }));
  }, []);

  const updateConfig = useCallback((updates: Partial<OllamaConfig>) => {
    const newConfig = { ...state.config, ...updates };
    setOllamaConfig(newConfig);
    setState((prev) => ({ ...prev, config: newConfig }));
  }, [state.config]);

  const streamChat = useCallback(
    async (
      messages: Array<{ role: "user" | "assistant"; content: string }>,
      onDelta: (text: string) => void,
      onDone: () => void,
      onError: (error: string) => void
    ) => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        await streamOllamaChat({
          messages,
          config: state.config,
          onDelta,
          onDone: () => {
            setState((prev) => ({ ...prev, isLoading: false }));
            onDone();
          },
          onError: (error) => {
            setState((prev) => ({ ...prev, isLoading: false, error }));
            onError(error);
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setState((prev) => ({ ...prev, isLoading: false, error: msg }));
        onError(msg);
      }
    },
    [state.config]
  );

  // Check health on mount
  useEffect(() => {
    if (state.isEnabled) {
      checkHealth();
    }
  }, []);

  return {
    ...state,
    checkHealth,
    setEnabled,
    updateConfig,
    streamChat,
  };
}
