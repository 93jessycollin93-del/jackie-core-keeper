// Static audit that scans the frontend source (src/**) for accidental
// secret exposure, and maps every configured secret to the edge functions
// that consume it. Everything runs at build/runtime in the browser using
// Vite's `import.meta.glob(..., { as: "raw" })` — no network calls.

// -- Frontend sources (may contain leaks). --
const FRONT_SOURCES = import.meta.glob("/src/**/*.{ts,tsx,js,jsx}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

// -- Edge function sources (server-side; safe place for secrets). --
const FN_SOURCES = import.meta.glob("/supabase/functions/**/*.{ts,js}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export type LeakSeverity = "critical" | "warn" | "info";

export interface LeakFinding {
  severity: LeakSeverity;
  category: string;
  file: string;
  line: number;
  snippet: string;
  detail: string;
}

// Patterns run against every source line. We stay conservative: hardcoded
// literals + risky logging of anything named "token" / "key" / "secret".
const PATTERNS: Array<{
  re: RegExp;
  severity: LeakSeverity;
  category: string;
  detail: string;
}> = [
  { re: /sk-(?:proj-|ant-|or-|live_|test_)?[A-Za-z0-9_-]{20,}/, severity: "critical", category: "hardcoded-key", detail: "Looks like an OpenAI/Anthropic/OpenRouter/Stripe key literal" },
  { re: /\bgsk_[A-Za-z0-9]{20,}\b/, severity: "critical", category: "hardcoded-key", detail: "Looks like a Groq API key literal" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, severity: "warn", category: "jwt-literal", detail: "JWT literal in source (anon/publishable is OK; service_role is NOT)" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, severity: "critical", category: "hardcoded-key", detail: "Looks like a Slack token literal" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, severity: "critical", category: "hardcoded-key", detail: "AWS access key literal" },
  { re: /\bghp_[A-Za-z0-9]{20,}\b/, severity: "critical", category: "hardcoded-key", detail: "GitHub personal access token" },
  { re: /console\.(log|info|warn|error|debug)\s*\([^)]*\b(token|api[_-]?key|secret|password|bearer)\b/i, severity: "warn", category: "risky-log", detail: "Logs a variable named token/key/secret/password/bearer" },
  { re: /import\.meta\.env\.VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|API_KEY)/i, severity: "critical", category: "vite-leak", detail: "Secret-shaped value pulled through VITE_* — ships to the browser bundle" },
  { re: /process\.env\.[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE)/i, severity: "warn", category: "env-in-frontend", detail: "process.env secret referenced from frontend code" },
  { re: /localStorage\.(setItem|getItem)\s*\([^)]*\b(token|api[_-]?key|secret|password)\b/i, severity: "warn", category: "localstorage-secret", detail: "Storing a token/key/secret in localStorage" },
];

// Skip our own audit module + validators — they legitimately contain the strings.
const IGNORE_FILES = /jackie-secret-audit\.ts$|jackie-key-validation\.ts$|SecretsAudit\.tsx$/;

export function scanFrontendLeaks(): LeakFinding[] {
  const out: LeakFinding[] = [];
  for (const [path, raw] of Object.entries(FRONT_SOURCES)) {
    if (IGNORE_FILES.test(path)) continue;
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of PATTERNS) {
        if (p.re.test(line)) {
          out.push({
            severity: p.severity,
            category: p.category,
            file: path.replace(/^\//, ""),
            line: i + 1,
            snippet: line.trim().slice(0, 200),
            detail: p.detail,
          });
        }
      }
    }
  }
  return out;
}

// -- Secret → edge function usage graph. --

export interface SecretUsage {
  secret: string;
  functions: Array<{
    name: string;
    file: string;
    lines: number[];
  }>;
}

const ENV_READ = /Deno\.env\.get\(\s*["'`]([A-Z0-9_]+)["'`]\s*\)/g;

export function buildSecretUsageGraph(configuredSecrets: string[]): SecretUsage[] {
  const perSecret = new Map<string, Map<string, { file: string; lines: number[] }>>();

  for (const [path, raw] of Object.entries(FN_SOURCES)) {
    const match = path.match(/\/supabase\/functions\/([^/]+)\//);
    const fn = match?.[1] ?? path;
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      ENV_READ.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ENV_READ.exec(lines[i])) !== null) {
        const name = m[1];
        if (!perSecret.has(name)) perSecret.set(name, new Map());
        const perFn = perSecret.get(name)!;
        if (!perFn.has(fn)) perFn.set(fn, { file: path.replace(/^\//, ""), lines: [] });
        perFn.get(fn)!.lines.push(i + 1);
      }
    }
  }

  const names = new Set<string>([...configuredSecrets, ...perSecret.keys()]);
  return [...names].sort().map((secret) => ({
    secret,
    functions: [...(perSecret.get(secret)?.entries() ?? [])].map(([name, v]) => ({
      name,
      file: v.file,
      lines: v.lines,
    })),
  }));
}
