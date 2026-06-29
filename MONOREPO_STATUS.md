# Monorepo restructure — build status & your next steps
_Built 2026-06-28. The scaffold is in your working tree. It has NOT been committed or pushed — that's your part (I can't run git or push)._

## What I built (all syntax-validated)
- **Workspace:** `pnpm-workspace.yaml`, `turbo.json`, new root `package.json` (workspace root), `.nvmrc`.
- **`packages/design-system`** — `tokens.css` (your real theme, extracted verbatim) + React primitives: `ThemeRoot`, `Button`, `Card`, `Panel`, `Seg`, `Chip`, `ClassBadge`, `PageHeader`, `ResultsTable`.
- **`packages/core`** — Supabase REST + GoTrue auth wrappers (lifted from App.jsx, no SDK) and an `aiComplete()` client for `/api/ai_filter`.
- **`packages/sport-kit`** — the `SportManifest` contract + `defineSport()`.
- **`apps/web`** — the shell: AthLink landing page (lists sports) + hash router that lazy-loads each sport. `vite.config.js` reads your root `.env.local` and proxies `/api` to the live Vercel parser.
- **`sports/sailing`** — your existing `App.jsx` (unchanged) wrapped as the Sailing portal via `manifest.jsx`.
- **`sports/_template`** + **`tools/create-sport.mjs`** — scaffold generator (also auto-registers the sport in the shell).
- **Governance:** `.github/CODEOWNERS` (you own shared + sailing, `@bennyben10wong` owns golf) and `.github/workflows/ci.yml` (frontend build + Python syntax + parser regression).

## ⚠️ Two things to know
1. **My sandbox couldn't delete files**, so old/duplicate files are still present and YOU must remove them (step 2 below): old root `src/`, `index.html`, `vite.config.js`, `package-lock.json`, and a duplicate `apps/web/api/`. The Python API was kept at the repo **root** `api/` on purpose (so `tools/test_parser.py` and `vercel.json` keep working).
2. **Confirm your GitHub handle in `.github/CODEOWNERS`.** I used `@CaseyATHLINK` as a guess — if that's not your exact username, edit it or CODEOWNERS won't work.

## Your steps

```bash
cd ~/Desktop/AthLink2.0
rm -f .git/*.lock
git checkout -b monorepo-migration        # all the new files land on this branch

# 1. Remove the old/duplicate files I couldn't delete (keep root api/ and vercel.json)
rm -rf src index.html vite.config.js package-lock.json apps/web/api

# 2. Clear old npm installs, then install the workspace with pnpm
rm -rf node_modules
pnpm install

# 3. Run it — landing should show a "Sailing" card; click it → your app loads as today
pnpm dev                                   # http://localhost:5173

# 4. Validation gates (must pass before pushing)
pnpm --filter @athlink/web build           # frontend build (catches JSX/TDZ)
for f in api/*.py; do python3 -c "import ast; ast.parse(open('$f').read())"; done
python3 tools/test_parser.py --diff        # expect "No changes" (parser untouched)
```

If `pnpm dev` shows errors, paste them to me — workspace wiring (React dedupe, import paths) is the likely first-run snag and we'll fix it on the branch. **main is untouched until you merge, so this is safe to iterate on.**

```bash
# 5. Commit + push (confirm the file count looks right)
rm -f .git/*.lock
git add -A
git commit -m "Restructure into pnpm monorepo: shell + shared foundation + sailing/golf sports"
git push -u origin monorepo-migration
```

## Vercel (after the branch is pushed)
- Project → Settings → **Root Directory:** repo root (leave blank / `.`).
- **Build Command:** `pnpm install && pnpm --filter @athlink/web build`
- **Output Directory:** `apps/web/dist`
- Env vars unchanged (already set). `vercel.json` still points at `api/parse_pdf.py` — no change needed.
- Push builds a **preview**; verify it in-browser (sign in, parse a PDF). When green → PR `monorepo-migration → main` → athlink.win.

## GitHub guardrails
- Settings → Branches → protect `main`: require PR + passing checks.
- CODEOWNERS auto-routes review (you for shared, Ben for `sports/golf`).

## Then Ben starts
Once `main` is cut over, Ben follows `BEN_GOLF_CLAUDE_BRIEFING.md`: `git pull`, `pnpm create-sport golf`, `pnpm dev`, build in `sports/golf`.

## Follow-ups (not blocking)
- Refactor sailing to consume `@athlink/design-system` + `@athlink/core` and drop its embedded `<style>` block (removes the temporary theme duplication between sailing and the design system).
- Point `tools/pre_push_test.sh` at the new layout.
- Switch CI to Turborepo affected-only builds once there are several sports.
