// Automatic provider fallback — try providers in order, hop on failure.
// Default chain: Ollama (primary, local) → Groq (fast free) → OpenRouter → Lovable.
import { streamProviderChat, type ChatMessage } from "./jackie-provider-stream";
import { findProvider, type ProviderId } from "./jackie-providers";

export interface FallbackAttempt {
  provider: ProviderId;
  model: string;
  ok: boolean;
  error?: string;
}

const DEFAULT_CHAIN: ProviderId[] = ["ollama", "groq", "openrouter", "lovable"];

// Errors that mean "this provider is dead, hop to next" vs a real content/model
// error we should surface. Keep this permissive — network, secret-missing,
// 5xx, and Ollama-unreachable all trigger fallback.
function isTransientFailure(err: string): boolean {
  const e = err.toLowerCase();
  return (
    e.includes("missing secret") ||
    e.includes("not configured") ||
    e.includes("unauthorized") ||
    e.includes("failed to fetch") ||
    e.includes("connection failed") ||
    e.includes("networkerror") ||
    e.includes("ollama") ||
    e.includes("timeout") ||
    /\b(5\d\d|429|402)\b/.test(e)
  );
}

/**
 * Stream a chat with automatic provider fallback. On transient failure
 * (missing secret, network, 5xx, rate-limit) the next provider in the
 * chain is attempted with its default model. `onProviderChange` fires
 * whenever a hop happens so the UI can reflect the active provider.
 *
 * Once any content has streamed to `onDelta`, we do NOT fall back —
 * partial output is committed, and the error is reported as-is.
 */
export async function streamProviderChatWithFallback({
  provider,
  model,
  messages,
  system,
  chain = DEFAULT_CHAIN,
  onDelta,
  onDone,
  onError,
  onProviderChange,
  onAttempt,
}: {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  system?: string;
  chain?: ProviderId[];
  onDelta: (t: string) => void;
  onDone: () => void;
  onError: (e: string) => void;
  onProviderChange?: (p: ProviderId, model: string) => void;
  onAttempt?: (a: FallbackAttempt) => void;
}) {
  // Build ordered attempt list: requested provider first, then chain minus dup.
  const order: ProviderId[] = [provider, ...chain.filter((p) => p !== provider)];
  let received = 0;

  for (let i = 0; i < order.length; i++) {
    const pid = order[i];
    const def = findProvider(pid);
    if (!def) continue;
    const useModel = pid === provider ? model : def.models[0].id;
    if (i > 0) onProviderChange?.(pid, useModel);

    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      streamProviderChat({
        provider: pid,
        model: useModel,
        messages,
        system,
        onDelta: (t) => {
          received += t.length;
          onDelta(t);
        },
        onDone: () => resolve({ ok: true }),
        onError: (e) => resolve({ ok: false, error: e }),
      });
    });

    onAttempt?.({ provider: pid, model: useModel, ok: result.ok, error: result.error });

    if (result.ok) {
      onDone();
      return;
    }
    // If we already streamed content, don't hop — commit what we have.
    if (received > 0) {
      onError(result.error ?? "Stream interrupted");
      return;
    }
    // Non-transient errors (bad prompt, invalid model shape) — stop.
    if (result.error && !isTransientFailure(result.error) && i < order.length - 1) {
      onError(result.error);
      return;
    }
    // Otherwise: hop to next provider.
  }

  onError("All providers failed. Configure OLLAMA_BASE_URL, GROQ_API_KEY, or OPENROUTER_API_KEY.");
}
