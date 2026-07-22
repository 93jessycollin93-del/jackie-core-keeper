# Plan — Replace current Jackie with Jacchaos1 build `88df4a24`

## ⚠️ Destructive warning (read first)

You picked **Replace current Jackie with old build**. This wipes everything built in this project over the last month, including:

- Hydra Router + 5-provider fallback (Ollama → Groq → OpenRouter → Lovable)
- INDEX-01 AI Finder (floating pill, model dashboard, WASM/WebGPU probes)
- Compression Pods (nested) + 100-tool registry + Agent Frameworks page
- Secrets Audit suite + CI guard
- Task Board / Calendar / i18n (EN/UK/RU/ZH)
- Sentinel, Sphere Command, Vault, G-Unit, Marvels Race, Telegram shell
- All security fixes (RLS on chats, private storage bucket, HIBP, NOT NULLs)
- Jackie identity docs, sigil `8-_0_-8`, resting-state memory
- 12+ Cloud tables + 15 edge functions specific to this build

Once files are overwritten, restore is only possible via **History tab** (revert to a pre-swap version). Cloud tables and secrets are **not** rolled back by history — they persist.

Confirm you accept this before I execute step 3.

---

## Step 1 — You remix `88df4a24` into Zhao Eru (manual, ~30 seconds)

I cannot do this for you; remix runs from the source project's UI.

1. In your phone browser, open `lovable.dev/projects/88df4a24-a1e1-4a72-82ae-2a5e03749c08` while signed into **Jacchaos1**.
2. Tap the project name (top-left) → **Settings** → **Remix this project**.
3. When it asks for a destination workspace, pick **Zhao Eru (Pro)**.
4. Wait for it to finish and give you a new project URL like `lovable.dev/projects/<new-id>`.
5. Paste that new URL / ID back into this chat.

If the remix button is missing or disabled, the alternate path is: dashboard → long-press the Jacchaos1 project card → Remix → destination Zhao Eru.

## Step 2 — I verify I can read the remixed project

Once the remixed copy sits in Zhao Eru, I'll:

- Run `cross_project--search_project` on the new ID to confirm reachability.
- Run `cross_project--list_project_dir` on `/`, `src/`, `supabase/`, and `Jackie/` to enumerate everything.
- Diff the file list against current Jackie so you see exactly what's being wiped and what's being added.
- Report back with counts (files/pages/functions/tables) and any red flags (hardcoded secrets, missing migrations, framework mismatches).

**Stop point** — I will not proceed to step 3 without your explicit "go swap it" after seeing the diff.

## Step 3 — Wholesale replace

After you approve the diff:

- Delete everything under `src/`, `supabase/functions/`, `Jackie/`, `public/` (except Lovable-managed files: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml`, `src/integrations/lovable/`).
- Copy every file from the remixed project into the same paths here using `cross_project--read_project_file` + writes, and `cross_project--copy_project_asset` for binaries.
- Rewrite `package.json`, `vite.config.ts`, `tailwind.config.ts`, `index.html` from the source.
- Recreate any Cloud tables the old build needs via new migrations (the remixed project's Cloud is separate from this one's — its tables don't auto-copy).
- Reapply any secrets by name (values you'll need to paste — Lovable never lets me read secret values).

## Step 4 — Boot verification

- Confirm `bun install` resolves.
- Confirm the build compiles with no TS errors.
- Confirm the app loads at `/` without console errors.
- List which routes work and which still need Cloud tables or secrets wired.

---

## Technical notes

- **Cloud data does not cross workspaces.** Even if the old build's UI comes over, its database rows, storage buckets, and edge-function secrets stay in Jacchaos1. If you need the actual data, that's a separate export/import job (Cloud → Advanced settings → Export data on the old project, then re-insert here).
- **Custom domains** (`corejackie.life`, `www.corejackie.life`) stay pointed at *this* project. Replacing the code keeps them live on the new content automatically.
- **History revert** — if the swap goes wrong, open the History tab and revert to the message right before step 3. That restores files only, not Cloud state.

<presentation-actions>
  <presentation-open-history>View History (safety net)</presentation-open-history>
</presentation-actions>

## What I need from you now

1. Confirm the destructive replace is really what you want (vs. a merge — last chance to switch).
2. Do the remix in Jacchaos1 and paste the new Zhao Eru project ID here.
