# AthLink — Model A Monorepo Setup Runbook
_How to restructure AthLink into a scalable, multi-sport monorepo (one shell, shared foundation, plug-in sports). Written for the I-edit / Casey-pushes loop. Last updated: 2026-06-28._

## What we're building
One repo, one deployable web app (the **shell**), a **shared foundation** every sport imports, a **contract** each sport implements, and **sport modules** that plug in by convention. Adding sport #N becomes a scaffold command, not a refactor.

```
AthLink2.0/
├─ apps/
│  └─ web/                # THE shell — the only Vite app + the /api functions
│     ├─ api/             # Vercel Python serverless (parse_pdf.py, ai_filter.py, llm.py)
│     └─ src/             # landing page + router that auto-discovers sports
├─ packages/
│  ├─ design-system/      # tokens.css + Button/Card/Panel/Seg/Chip/Table/PageHeader
│  ├─ core/               # supabase client, auth, AI wrappers, shared hooks/types
│  └─ sport-kit/          # the SportManifest contract (TS interface)
├─ sports/
│  ├─ _template/          # copy this to start a new sport
│  ├─ sailing/            # Casey  — implements sport-kit, imports design-system + core
│  └─ golf/               # Ben    — same
├─ pnpm-workspace.yaml
├─ turbo.json
└─ package.json
```

Key design decision: **`apps/web` is the only build.** Sports and packages are *library* packages that `apps/web` imports; sports are **lazy-loaded** so the landing page stays light no matter how many sports exist. (A separate Vercel project per sport is an optional later isolation — not needed now.)

## Ground rules (carry over from CLAUDE.md / handoffs)
- **Casey pushes** (sandbox has no SSH). Before every commit: `rm -f .git/*.lock`, then `git add <explicit paths>`, commit, push, and **confirm the file count**.
- **Do the whole migration on a branch** (`monorepo-migration`). `main` keeps serving athlink.win untouched until the final cutover.
- **Validate after every edit** — esbuild syntax check + manual TDZ review (the #1 white-screen vector). Don't skip during the extraction in Phase 2/4.
- Convert relative dates to absolute in any notes.

---

## Prerequisites (one-time, Casey local)
1. Node 20 LTS. Add `.nvmrc` with `20` and `"packageManager": "pnpm@9"` to root `package.json`.
2. Install pnpm: `npm i -g pnpm` (pnpm chosen for proper workspace handling; npm workspaces is a lower-friction fallback if you'd rather not add a tool).
3. Install Turborepo as a dev dep at the root (Phase 1).
4. Confirm access: GitHub repo admin (for branch protection + CODEOWNERS), Vercel project settings, Supabase project `ylzoburtpibbgqdggjty`.

---

## Phase 0 — Branch & safety
1. `cd ~/Desktop/AthLink2.0 && rm -f .git/*.lock`
2. `git checkout main && git pull`
3. `git checkout -b monorepo-migration`
4. Record current Vercel build settings (build command, output dir, root dir, env vars) — you'll re-point them in Phase 7.

**Gate:** athlink.win still served from `main`; nothing live changes in Phases 0–6.

---

## Phase 1 — Workspace skeleton
1. Create folders: `apps/`, `packages/`, `sports/`.
2. Root `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
     - "sports/*"
   ```
3. Root `package.json`: `"private": true`, `"packageManager": "pnpm@9"`, scripts that call turbo (`dev`, `build`, `lint`, `test`).
4. Add `turbo.json` with a pipeline:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "tasks": {
       "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
       "dev":   { "cache": false, "persistent": true },
       "lint":  {},
       "test":  {}
     }
   }
   ```
5. Root tooling shared by all packages: a base `tsconfig.json`, eslint config, **stylelint config** (used in Phase 2 to ban raw colors), `.gitignore`.

**Gate:** `pnpm install` resolves cleanly with empty packages.

---

## Phase 2 — Extract the shared foundation
This is the one bounded-but-real refactor. Do it carefully (TDZ). Pull from the *real* values in `src/App.jsx`, not the stale tokens in CLAUDE.md.

1. **`packages/design-system`:**
   - `tokens.css` — the real `:root`/`.al-root` variables: `--navy:#13314e; --navy2:#1f4e80; --accent:#0a84ff; --accent2:#409cff; --sky:#e8f1fc; --paper:#eef3fb; --ink:#1d1d1f; --mut; --line; --gold:#c8920b; --link:#0a4fb0;` plus material tokens (`--mat-*`, `--halo`, `--grouped`) and `--radius:16px`. Include the system-font rule (the app effectively renders in SF Pro / `-apple-system`, not Barlow).
   - Component primitives lifted from App.jsx classes: `Button` (variants cta/ghost/sky/amber/green, pill `980px`), `Card`/`Panel`, `Seg` (segmented control), `Chip`/badges, `Table` (navy gradient header, tabular-nums), `PageHeader`. Export all.
2. **`packages/core`:**
   - Supabase client init (guard the `VITE_SUPABASE_URL` trailing-slash gotcha).
   - Auth helpers (SignInModal flow, role logic, under-16 guardian path).
   - AI wrappers from `api/llm.py` usage (the `complete_text` task routing) as a typed client.
   - Shared hooks/types (athlete, event, entry).
3. **Standardization enforcement:** add a stylelint/eslint rule scoped to `sports/**` that **bans raw hex colors and hardcoded `font-family`** — they must use design tokens. This is what stops sport #14 from inventing a slightly-different blue.

**Gate:** esbuild check passes on the extracted packages; TDZ review done.

---

## Phase 3 — Contract + shell
1. **`packages/sport-kit`** — define the manifest interface *from sailing's real shape*:
   ```ts
   export interface SportManifest {
     id: string;                 // "golf"
     name: string;               // "Golf"
     icon: ComponentType;
     accentToken: string;        // must reference a design-system token
     routes: RouteDef[];         // portal pages (lazy)
     ResultsView: ComponentType<ResultsProps>;
     ProfileView: ComponentType<ProfileProps>;
     parser?: ParserConfig;      // how this sport's results are ingested
   }
   ```
2. **`apps/web`** (the shell):
   - Landing page listing all sports (rendered from discovered manifests).
   - Router that **auto-discovers** manifests (Vite `import.meta.glob('../../sports/*/manifest.ts')`) and **lazy-loads** each sport's bundle.
   - Move `api/` (parse_pdf.py, ai_filter.py, llm.py, validate.py) under `apps/web/api/` so Vercel detects the functions at the deploy root. (See Gotchas.)

**Gate:** shell builds and shows an (empty) landing page.

---

## Phase 4 — Migrate sailing into a sport module
1. Create `sports/sailing`. Move the sailing-specific UI/logic from `src/App.jsx` in, refactoring it to **import from `design-system` + `core`** instead of inline styles/clients.
2. Export `sports/sailing/manifest.ts` implementing `SportManifest`.
3. Keep the parser rules intact (`api/parse_pdf.py` behavior unchanged — it now lives under `apps/web/api/`).
4. Run sailing inside the shell locally: `pnpm --filter web dev` (or `turbo dev --filter=web`).

**Gate (mandatory before any push):**
- esbuild bundle of the shell + sailing — no TDZ.
- `python3 -c "import ast; ast.parse(open('apps/web/api/parse_pdf.py').read())"`
- `python3 tools/test_parser.py --diff` → "No changes" vs baseline (parser logic untouched).

---

## Phase 5 — Scaffold golf (Ben's start)
1. Create `sports/_template/` — a minimal sport implementing `sport-kit` against the shared packages.
2. Add a generator: either `turbo gen` or a tiny script `pnpm create-sport <name>` that copies `_template` → `sports/<name>`, renames, and appends the CODEOWNERS line.
3. Ben: `git checkout main && git pull`, branch `golf-*`, `pnpm create-sport golf`, then `turbo dev --filter=web` shows his Golf portal inside the real shell with the real theme immediately.

**Gate:** golf renders in the shell; Ben's edits live only under `sports/golf`.

---

## Phase 6 — Governance & CI
1. **`CODEOWNERS`** at repo root:
   ```
   /packages/**      @CaseyATHLINK
   /apps/web/**       @CaseyATHLINK
   /sports/sailing/** @CaseyATHLINK
   /sports/golf/**    @ben-handle
   ```
   GitHub then *requires* your review on any PR touching shared code; sport PRs need only that sport's owner.
2. **Branch protection** on `main`: require PR + passing checks; no direct pushes.
3. **GitHub Actions**: run `turbo run lint test build --filter=...[origin/main]` so CI only checks **affected** packages. Each sport's gate (esbuild/TDZ for frontend, `ast.parse` + `test_parser.py --diff` for parser) runs scoped. This is what neutralizes "one broken sport blocks everyone" — broken code never merges, so `main` stays green.
4. **Migrations convention** (the real serialization point at scale):
   - Switch to **timestamp filenames** (`20260628_<desc>.sql`) so two devs never collide on `0007`.
   - Shared tables (athletes, auth) owned by platform; sport tables **prefixed** (`golf_*`, `sailing_*`) and owned by that sport's dev.
   - Always `NOTIFY pgrst, 'reload schema';` after applying.

---

## Phase 7 — Deploy cutover
1. In Vercel, point the project at the monorepo:
   - **Root directory:** `apps/web` (or repo root with a turbo build command).
   - **Build command:** `cd ../.. && pnpm install && pnpm turbo build --filter=web` (or Vercel's monorepo/turbo preset).
   - **Output:** `apps/web/dist`.
   - Re-add env vars (same as today): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `KIMI_API_KEY`, `GEMINI_API_KEY`.
2. Push `monorepo-migration` → test the **Vercel preview URL** (preview has a login wall, so verify in-browser, not curl).
3. When the preview is green: open a PR `monorepo-migration → main`, merge → athlink.win now serves the new shell.
4. **Optional later:** for true production isolation of a sport, add a second Vercel project with root `sports/<sport>` — no architecture change required.

**Gate:** preview renders sailing + golf, sign-in works, a real PDF parses + nationality reads (verify on preview/production, check provider dashboards).

---

## AthLink-specific gotchas
- **Vercel `/api` location:** Vercel discovers serverless functions in `/api` at the **project root**. With root = `apps/web`, keep functions in `apps/web/api/`. If you set root = repo root, keep `/api` there. Don't split them across packages.
- **50s/60s function ceiling** still applies to `parse_pdf.py` — unchanged by the move.
- **TDZ** during extraction (Phase 2/4) is the highest-risk moment — useEffect/const ordering. Manual review after every JSX edit.
- **`.git/*.lock`** swallows files silently — clear before every commit, confirm file count after push.
- **Don't fork the design system** — sports import it live; a token change in `packages/design-system` propagates to all sports on next build (this is the universal-feature superpower).

---

## New-sport onboarding checklist (the repeatable step)
1. `git checkout main && git pull` → branch `sportname-*`.
2. `pnpm create-sport <name>` (scaffolds `sports/<name>` + CODEOWNERS line).
3. `turbo dev --filter=web` → portal appears in the shell with the shared theme.
4. Build only in `sports/<name>`; use prefixed migrations (`<name>_*`).
5. Open PR → scoped CI runs → that sport's owner (and platform owner only if shared changed) reviews → merge → deploy.

A new dev cannot break another sport, cannot diverge the theme (lint blocks it), cannot collide on routes (auto-discovery) or migration numbers (timestamps).

---

## Effort map
Phases 0–4 (skeleton + extract shared + migrate sailing) are the real investment — do them yourself on the branch. Phases 5–7 are fast. After cutover, each new sport is Phase 5 + the onboarding checklist only.
