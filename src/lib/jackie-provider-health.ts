// Lightweight provider health check.
// Fires a tiny "ping" prompt through the same streaming path and classifies
// the result: ok / degraded / error, with latency in ms.
import type { ProviderId } from "./jackie-providers";
import { streamProviderChat } from "./jackie-provider-stream";

export type HealthStatus = "idle" | "checking" | "ok" | "degraded" | "error";

export interface HealthResult {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
  sample?: string;
}

const OK_MS = 3_000;
const DEGRADED_MS = 10_000;
const HARD_TIMEOUT = 15_000;

export async function checkProviderHealth(opts: {
  provider: ProviderId;
  model: string;
}): Promise<HealthResult> {
  const start = performance.now();
  let firstDeltaAt: number | null = null;
  let sample = "";
  let errored: string | null = null;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      errored = errored ?? `Timed out after ${HARD_TIMEOUT}ms`;
      resolve();
    }, HARD_TIMEOUT);

    streamProviderChat({
      provider: opts.provider,
      model: opts.model,
      system: "Reply with a single word.",
      messages: [{ role: "user", content: "ping" }],
      onDelta: (t) => {
        if (firstDeltaAt === null) firstDeltaAt = performance.now();
        if (sample.length < 40) sample += t;
      },
      onDone: () => { clearTimeout(timer); resolve(); },
      onError: (e) => { errored = e; clearTimeout(timer); resolve(); },
    });
  });

  const latencyMs = Math.round((firstDeltaAt ?? performance.now()) - start);

  if (errored) return { status: "error", error: errored, latencyMs };
  if (firstDeltaAt === null) return { status: "error", error: "No response", latencyMs };
  if (latencyMs <= OK_MS) return { status: "ok", latencyMs, sample };
  if (latencyMs <= DEGRADED_MS) return { status: "degraded", latencyMs, sample };
  return { status: "degraded", latencyMs, sample };
}
