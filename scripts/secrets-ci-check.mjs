#!/usr/bin/env node
// Jackie secrets safety CI check.
// Blocks deploys when frontend source contains hardcoded keys, VITE_* secret
// leaks, or risky token logging. Mirrors src/lib/jackie-secret-audit.ts but
// runs standalone in Node so it works in CI without a browser bundle.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const PATTERNS = [
  { re: /sk-(?:proj-|ant-|or-|live_|test_)?[A-Za-z0-9_-]{20,}/, severity: "critical", category: "hardcoded-key", detail: "OpenAI/Anthropic/OpenRouter/Stripe key literal" },
  { re: /\bgsk_[A-Za-z0-9]{20,}\b/, severity: "critical", category: "hardcoded-key", detail: "Groq API key literal" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, severity: "critical", category: "hardcoded-key", detail: "Slack token literal" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, severity: "critical", category: "hardcoded-key", detail: "AWS access key literal" },
  { re: /\bghp_[A-Za-z0-9]{20,}\b/, severity: "critical", category: "hardcoded-key", detail: "GitHub PAT literal" },
  { re: /import\.meta\.env\.VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|API_KEY)/i, severity: "critical", category: "vite-leak", detail: "Secret-shaped value pulled through VITE_* — ships to browser bundle" },
  { re: /console\.(log|info|warn|error|debug)\s*\([^)]*\b(token|api[_-]?key|secret|password|bearer)\b/i, severity: "warn", category: "risky-log", detail: "Logs a variable named token/key/secret/password/bearer" },
  { re: /process\.env\.[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE)/i, severity: "warn", category: "env-in-frontend", detail: "process.env secret referenced from frontend code" },
  { re: /localStorage\.(setItem|getItem)\s*\([^)]*\b(token|api[_-]?key|secret|password)\b/i, severity: "warn", category: "localstorage-secret", detail: "Storing token/key/secret in localStorage" },
];

// Allowed VITE_* names (publishable / project ref values that are meant to ship).
const VITE_ALLOWLIST = /VITE_SUPABASE_(URL|PUBLISHABLE_KEY|PROJECT_ID|ANON_KEY)\b/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else if (EXTS.has(full.slice(full.lastIndexOf(".")))) yield full;
  }
}

const findings = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    // Skip audit sources themselves — they reference the patterns as strings.
    if (/jackie-secret-audit|secrets-ci-check/.test(file)) continue;
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");
    const lines = src.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const p of PATTERNS) {
        if (!p.re.test(line)) continue;
        if (p.category === "vite-leak" && VITE_ALLOWLIST.test(line)) continue;
        findings.push({
          severity: p.severity,
          category: p.category,
          detail: p.detail,
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 200),
        });
      }
    });
  }
}

const critical = findings.filter((f) => f.severity === "critical");
const warn = findings.filter((f) => f.severity === "warn");

const bar = "─".repeat(60);
console.log(`\n${bar}\n Jackie · secrets safety CI check\n${bar}`);
console.log(`  scanned:  ${SCAN_DIRS.join(", ")}`);
console.log(`  critical: ${critical.length}`);
console.log(`  warnings: ${warn.length}\n`);

for (const f of findings) {
  const tag = f.severity === "critical" ? "✖ CRIT" : "⚠ WARN";
  console.log(`${tag}  ${f.category}  ${f.file}:${f.line}`);
  console.log(`        ${f.detail}`);
  console.log(`        │ ${f.snippet}`);
}

// Fail the build only on critical findings. Warnings are surfaced but
// non-blocking so the CI signal stays actionable.
const strict = process.env.JACKIE_SECRETS_STRICT === "1";
const shouldFail = critical.length > 0 || (strict && warn.length > 0);
if (shouldFail) {
  console.error(`\n✖ Deploy blocked — ${critical.length} critical${strict ? ` + ${warn.length} warn (strict)` : ""} finding(s).\n`);
  process.exit(1);
}
console.log("\n✔ Clean — no blocking secret leaks detected.\n");
