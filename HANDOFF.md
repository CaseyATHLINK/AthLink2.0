# AthLink 2.0 — HANDOFF (monorepo restructure)
_Resume in a new chat with: "Read HANDOFF.md and continue." Last updated: 2026-06-28._
_Repo: `~/Desktop/AthLink2.0` (CaseyATHLINK/AthLink2.0) · Live: athlink.win (Vercel) · Supabase ref: `ylzoburtpibbgqdggjty`_

## Where we are
The app was restructured from a single Vite app into a **pnpm + Turborepo monorepo** so Casey (sailing) and Ben (golf) can build different sports in parallel without colliding, scaling to many sports. **All work lives on the branch `monorepo-migration` — NOT yet merged to `main`.** Until the PR merges, **athlink.win still serves the old single-app version** (this is expected). Everything is verified working on `localhost:5173`.

## What was built (on `monorepo-migration`)
- **Workspace:** `pnpm-workspace.yaml`, `turbo.json`, root `package.json` (workspaces), `.nvmrc`, `vercel.json` (build config: installs pnpm, builds `apps/web`, output `apps/web/dist`).
- **`packages/design-system`** — `tokens.css` (real theme, extracted verbatim) + primitives (`ThemeRoot`, `Button`, `Card`, `Panel`, `Seg`, `Chip`, `ResultsTable`, `PageHeader`).
- **`packages/core`** — Supabase REST + GoTrue auth wrappers (no SDK) + `aiComplete()` for `/api/ai_filter`.
- **`packages/sport-kit`** — `SportManifest` contract + `defineSport()`.
- **`apps/web`** — the shell: AthLink landing (lists sports) + hash router that lazy-loads each sport. Reads root `.env.local`; proxies `/api` to the live Vercel parser.
- **`sports/sailing`** — the existing `App.jsx` wrapped unchanged as the Sailing portal. Brand pill split into TWO buttons: **logo → AthLink landing**, **"Sailing" label → sailing home** (centered divider between them).
- **`sports/_template`** + **`tools/create-sport.mjs`** — generator that scaffolds a sport AND auto-registers it in the shell.
- **Governance:** `.github/CODEOWNERS` (Casey owns shared + sailing; `@bennyben10wong` owns golf) + `.github/workflows/ci.yml`.
- **Python API kept at repo root `api/`** (so `tools/test_parser.py` + `vercel.json` still work).

## Dev loop & environment quirks
- Cowork sandbox **edits** `~/Desktop/AthLink2.0`; **Casey runs/validates/pushes** (sandbox can't run git, push, or delete files).
- Always `cd ~/Desktop/AthLink2.0` before pnpm commands. Don't paste `# comments` after commands (zsh passes them as args).
- Run locally: `pnpm dev` → http://localhost:5173.
- **Validation gates before push:** `pnpm --filter @athlink/web build` · `for f in api/*.py; do python3 -c "import ast; ast.parse(open('$f').read())"; done` · `python3 tools/test_parser.py --diff`.

## Next steps (in order)
1. **Commit + push the latest UI tweaks** (brand-pill split + centered divider) if not already pushed.
2. **Cut over to main:** confirm the Vercel preview for `monorepo-migration` is green → open it, sign in, parse one PDF → merge the PR → `main`. athlink.win then serves the new shell.
3. **Protect `main`** (GitHub → Settings → Branches: require PR + checks). Confirm `@CaseyATHLINK` is Casey's real handle in `.github/CODEOWNERS`.
4. **Onboard Ben:** send Supabase URL + anon key (password manager / one-time link) + point him at `BEN_GOLF_CLAUDE_BRIEFING.md`. He clones, adds `.env.local`, `pnpm install`, `pnpm create-sport golf`, `pnpm dev`, builds in `sports/golf`, opens PRs to main.
5. **Add Ben as a Supabase project member** (for schema work, instead of sharing service_role).

## Follow-ups (not blocking)
- Refactor sailing to import `@athlink/design-system` + `@athlink/core` and drop its embedded `<style>` block (removes the temporary theme duplication).
- Point `tools/pre_push_test.sh` at the new layout; switch CI to Turborepo affected-only builds as sports grow.

## Key references
`MONOREPO_SETUP.md` (architecture + phases) · `MONOREPO_STATUS.md` (what shipped + cutover commands) · `BEN_GOLF_CLAUDE_BRIEFING.md` (Ben's Claude setup) · `CLAUDE.md` (codebase context, tokens, parser rules, gotchas).
