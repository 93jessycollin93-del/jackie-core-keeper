// Client-side format validation for API keys.
// Runs entirely in the browser; the raw value NEVER leaves this module
// (no network calls, no logging). It only checks shape/prefix/length so we
// can warn before wasting a health-check round-trip.

export type KeyValidationSeverity = "ok" | "warn" | "error";

export interface KeyValidationResult {
  severity: KeyValidationSeverity;
  message: string;
  expected?: string;
}

export interface KeyValidator {
  secretName: string;
  label: string;
  expected: string;
  validate: (raw: string) => KeyValidationResult;
}

function jwtLooking(raw: string): boolean {
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p) && p.length > 4);
}

export const KEY_VALIDATORS: Record<string, KeyValidator> = {
  GROQ_API_KEY: {
    secretName: "GROQ_API_KEY",
    label: "Groq",
    expected: "gsk_… (56 chars, alphanumerics)",
    validate: (raw) => {
      const v = raw.trim();
      if (!v) return { severity: "error", message: "Empty value" };
      if (v.includes(" ")) return { severity: "error", message: "Contains whitespace — likely a paste artifact" };
      if (!v.startsWith("gsk_")) return { severity: "warn", message: "Missing standard `gsk_` prefix — Groq may reject it", expected: "gsk_…" };
      if (v.length < 40) return { severity: "warn", message: `Short (${v.length} chars) — expected ~56` };
      if (!/^gsk_[A-Za-z0-9]+$/.test(v)) return { severity: "warn", message: "Non-alphanumeric characters after prefix" };
      return { severity: "ok", message: "Looks valid" };
    },
  },
  OPENROUTER_API_KEY: {
    secretName: "OPENROUTER_API_KEY",
    label: "OpenRouter",
    expected: "sk-or-v1-… (73 chars)",
    validate: (raw) => {
      const v = raw.trim();
      if (!v) return { severity: "error", message: "Empty value" };
      if (v.includes(" ")) return { severity: "error", message: "Contains whitespace" };
      if (!v.startsWith("sk-or-")) return { severity: "warn", message: "Missing standard `sk-or-` prefix", expected: "sk-or-v1-…" };
      if (v.length < 40) return { severity: "warn", message: `Short (${v.length} chars)` };
      return { severity: "ok", message: "Looks valid" };
    },
  },
  OLLAMA_BASE_URL: {
    secretName: "OLLAMA_BASE_URL",
    label: "Ollama base URL",
    expected: "http(s)://host:11434",
    validate: (raw) => {
      const v = raw.trim();
      if (!v) return { severity: "error", message: "Empty value" };
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) return { severity: "error", message: "Must be http:// or https://" };
        if (u.pathname !== "/" && u.pathname !== "") return { severity: "warn", message: "Trailing path — Ollama expects host root" };
        return { severity: "ok", message: "Looks valid" };
      } catch {
        return { severity: "error", message: "Not a valid URL" };
      }
    },
  },
  SUPABASE_ANON_KEY: {
    secretName: "SUPABASE_ANON_KEY",
    label: "Supabase anon / publishable JWT",
    expected: "eyJ… (JWT, 3 dot-separated segments)",
    validate: (raw) => {
      const v = raw.trim();
      if (!v) return { severity: "error", message: "Empty value" };
      if (!v.startsWith("eyJ")) return { severity: "warn", message: "Not a JWT header (missing `eyJ` prefix)" };
      if (!jwtLooking(v)) return { severity: "error", message: "Not a valid JWT shape (need 3 base64url segments)" };
      return { severity: "ok", message: "JWT shape looks valid" };
    },
  },
  OPENAI_API_KEY: {
    secretName: "OPENAI_API_KEY",
    label: "OpenAI",
    expected: "sk-… or sk-proj-…",
    validate: (raw) => {
      const v = raw.trim();
      if (!v) return { severity: "error", message: "Empty value" };
      if (!/^sk-[A-Za-z0-9_-]+$/.test(v)) return { severity: "warn", message: "Missing `sk-` prefix or invalid characters" };
      if (v.length < 40) return { severity: "warn", message: `Short (${v.length} chars)` };
      return { severity: "ok", message: "Looks valid" };
    },
  },
  ANTHROPIC_API_KEY: {
    secretName: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    expected: "sk-ant-…",
    validate: (raw) => {
      const v = raw.trim();
      if (!v) return { severity: "error", message: "Empty value" };
      if (!v.startsWith("sk-ant-")) return { severity: "warn", message: "Missing `sk-ant-` prefix" };
      return { severity: "ok", message: "Looks valid" };
    },
  },
};

export function validateKey(secretName: string, raw: string): KeyValidationResult | null {
  const v = KEY_VALIDATORS[secretName];
  return v ? v.validate(raw) : null;
}

export function getValidator(secretName: string): KeyValidator | undefined {
  return KEY_VALIDATORS[secretName];
}
