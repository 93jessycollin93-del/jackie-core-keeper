
# Plan: Hydra Coder Agent + full app line-wrapping

Build a single "Coder" agent inside Jackie that fans out one prompt to **8 free LLM providers in parallel**, runs a Gemini Flash judge to pick the best answer, and returns the winner plus metadata. Also finish the i18n wrap and make code blocks word-wrap instead of scrolling.

## Part 1 — Hydra Coder Agent (edge function)

New Lovable Cloud edge function `hydra-coder` at `supabase/functions/hydra-coder/index.ts`.

Fan-out targets (all free tiers, all coder-tuned or code-capable):

```text
┌─ Groq            → llama-3.3-70b-versatile   (fast, strong general coder)
├─ Groq            → qwen-2.5-coder-32b        (code-specialist)
├─ Gemini direct   → gemini-2.0-flash          (free tier, fast)
├─ Together        → Qwen/Qwen2.5-Coder-32B-Instruct
├─ OpenRouter      → deepseek/deepseek-chat-v3.1:free
├─ OpenRouter      → qwen/qwen-2.5-coder-32b-instruct:free
├─ Cloudflare WAI  → @cf/qwen/qwen2.5-coder-32b-instruct
├─ Cohere          → command-r-08-2024
└─ HuggingFace     → mistralai/Mixtral-8x7B-Instruct-v0.1
```

Flow per request:
1. Read `{ prompt, system? }` from POST body. Validate.
2. `Promise.allSettled` all 8 provider calls with a 15s per-call timeout.
3. Collect `{ model, provider, answer, latency_ms, ok, error? }` per branch.
4. Judge step: send all successful answers to `google/gemini-2.5-flash` via the built-in **Lovable AI Gateway** (uses `LOVABLE_API_KEY`, no extra secret) with a system prompt: *"You are the judge. Read the candidate answers and return the single best one, rewritten for clarity. Respond with JSON `{winner_index, final_answer, reasoning}`."*
5. Return JSON: `{ agent: "coder", final_answer, winner: {provider, model}, candidates: [...], judge_latency_ms, total_latency_ms }`.

Resilience:
- Any branch that errors, times out, or returns non-2xx is captured in `candidates` with `ok: false` and does not break the run.
- If **all 8** fail, fall back to a direct Lovable AI Gateway call so the agent never returns empty.
- CORS headers on every response (including errors).

Secrets required (requested via `add_secret` in a secure form — user pastes each):
- `GROQ_API_KEY`
- `GEMINI_API_KEY` (Google AI Studio, direct — separate from gateway)
- `TOGETHER_API_KEY`
- `OPENROUTER_API_KEY`
- `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
- `COHERE_API_KEY`
- `HUGGINGFACE_API_KEY`

Missing keys are handled gracefully — the corresponding branch is skipped rather than crashing, so the agent still runs on whatever subset is configured (start with just Groq + OpenRouter if you want to test before pasting all 7).

## Part 2 — Coder Agent UI in Jackie

- New button in the chat composer area: **"Coder Agent"** toggle (small pill next to the model selector). When active, the next message routes to `hydra-coder` instead of `jackie-chat`.
- Assistant reply renders `final_answer` as normal markdown, with a collapsible **"8 models · winner: Groq/qwen-coder · 2.7s"** meta line under it that expands to show each candidate answer + latency.
- New file `src/lib/hydra-client.ts` — thin fetch wrapper matching `jackie-stream.ts` conventions.
- New component `src/components/HydraMeta.tsx` for the expandable candidates panel.
- Add i18n strings: `nav.coder`, `hydra.title`, `hydra.winner`, `hydra.candidates`, `hydra.judgeFailed`, etc. in all 4 locales.

## Part 3 — Wrap all the lines

**A) Finish i18n wrapping** — audit `src/pages/Index.tsx`, `Auth.tsx`, `Tasks.tsx`, `TaskBoard.tsx`, `TaskCalendar.tsx`, `BottomNav.tsx`, `TaskDialog.tsx`, `TaskCard.tsx`, `LanguageSelector.tsx` and replace every remaining hardcoded English string with `t('...')`. Add the missing keys to `en.json`, `uk.json`, `ru.json`, `zh.json` (mirrored translations for all four).

**B) Code-block word wrap** — update the markdown renderer in `Index.tsx` (and Hydra reply renderer) so `<pre>` / `<code>` blocks use `whitespace-pre-wrap break-words overflow-x-hidden` instead of horizontal scroll. Applies to both chat and Hydra outputs so long lines wrap on mobile.

## Files touched

**New**
- `supabase/functions/hydra-coder/index.ts`
- `src/lib/hydra-client.ts`
- `src/components/HydraMeta.tsx`

**Modified**
- `src/pages/Index.tsx` (Coder toggle, Hydra routing, code-block wrap, i18n wrap)
- `src/pages/Auth.tsx`, `Tasks.tsx`, `TaskBoard.tsx`, `TaskCalendar.tsx` (i18n wrap)
- `src/components/BottomNav.tsx`, `TaskDialog.tsx`, `TaskCard.tsx`, `LanguageSelector.tsx` (i18n wrap)
- `src/i18n/en.json`, `uk.json`, `ru.json`, `zh.json` (new keys)

## Order of build
1. Request the 7 provider secrets (secure form — you paste; missing ones don't block deploy).
2. Ship `hydra-coder` edge function + judge fallback.
3. Wire Coder toggle + Hydra meta panel into chat UI.
4. Sweep the app for hardcoded strings → `t()`, add keys to all 4 locale files.
5. Fix code-block CSS to wrap.
6. Smoke test: send `"write a debounce hook in TS"` through Coder mode, verify at least one candidate returns and the judge produces a `final_answer`.

## Notes / trade-offs
- Uses your **existing Lovable Cloud edge function runtime** instead of a separate Vercel deploy — one less thing to host, same $0.
- Judge uses Lovable AI Gateway (Gemini Flash) which sips your workspace AI credit (~fractions of a cent per judge call). If you'd rather judge with a free provider too, swap the judge to Groq `llama-3.3-70b-versatile` — say the word and I'll flip it.
- Phone-side llama.cpp router and GCP L4 auto-start scripts from your bigger vision are **out of scope** for this turn — this plan lands the cloud brain (Agent #1). Once it's live and you love it, next turn we clone to Researcher/Planner/etc. and add the phone router.
