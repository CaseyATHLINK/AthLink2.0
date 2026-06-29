# Briefing for Ben's Claude — Build the AthLink Golf portal
_Paste this into your Cowork/Claude session. Last updated: 2026-06-28._

## Context
AthLink is a multi-sport athlete-data platform — hosts upload competition results, athlete profiles build as a byproduct. It's now a **monorepo**: one shell app, a shared foundation every sport imports, and each sport is a plug-in module. **You own `/sports/golf`.** Casey owns sailing and the shared layer. Your job: build the **Golf homepage + results UI**, visually identical to sailing.

## STEP 0 — Prerequisite check (do this first, every time)
Confirm the restructure exists before doing anything else:
```bash
ls packages/design-system packages/core packages/sport-kit sports/_template
```
If any are missing, **STOP** — the monorepo isn't merged yet. Tell Ben to wait for Casey's restructure to land on `main`.

## STEP 1 — Setup
```bash
git checkout main && git pull
git checkout -b golf-portal
pnpm install
pnpm create-sport golf          # scaffolds /sports/golf from the template
pnpm turbo dev --filter=web     # your Golf portal renders inside the real shell
```

## STEP 2 — Golden rules (non-negotiable — this is how all sports stay standardized)
- **Build ONLY in `/sports/golf`.** Never edit `/packages/**`, `/apps/web`, or another sport. CODEOWNERS will block it anyway.
- **Import everything shared.** UI from `packages/design-system` (`Button`, `Card`, `Panel`, `Seg`, `Chip`, `Table`, `PageHeader`); data/auth/AI from `packages/core`. Do not reinvent a button, a Supabase call, or an auth flow.
- **No hardcoded colors or `font-family`.** Use design tokens only — CI lint rejects raw hex.
- **Platform terminology (same as sailing):** "Athletes" (not golfers/players); "Competition" (not tournament); separate **first + last name** fields everywhere; **no back buttons** in the top bar.
- **Results are ground truth** — never re-rank or recompute a result; display what was uploaded.

## STEP 3 — Match the design system (this is the standard)
The platform look is Apple "liquid glass": translucent frosted panels (`backdrop-filter: blur(28–44px) saturate(~195%)`), inset white highlights, soft shadows, hover-lift motion, on a fixed diagonal blue-grey gradient background.

**Font:** the Apple system stack (`-apple-system, 'SF Pro'...`) — applied globally. (Barlow appears in the code but is overridden; don't rely on it.)

**Color tokens (use these, never raw hex):**
`--navy:#13314e` · `--navy2:#1f4e80` · `--accent:#0a84ff` · `--accent2:#409cff` · `--sky:#e8f1fc` · `--paper:#eef3fb` · `--ink:#1d1d1f` · `--mut` · `--line` · `--gold:#c8920b` · `--link:#0a4fb0` · material tokens `--mat-*`, `--halo`, `--grouped` · `--radius:16px`.

**Components to reuse (don't rebuild):**
- **Buttons** are pills (`border-radius:980px`), weight 600, hover-lift; variants `cta`/`ghost`/`sky`/`amber`/`green`.
- **Cards/panels** are frosted white (55–85% opacity), 16px radius, inset highlight + soft shadow, hover-lift.
- **Segmented controls** and **chips/badges** are pills.
- **Tables**: navy gradient header, centered `tabular-nums` cells, hairline row borders, row-hover tint.

If golf and sailing don't look like the same product, something's wrong — fix it toward the shared components.

## STEP 4 — Implement the contract
Export `/sports/golf/manifest.ts` satisfying `SportManifest` from `packages/sport-kit`:
```ts
{
  id: "golf",
  name: "Golf",
  icon: GolfIcon,
  accentToken: "--accent",       // a design-system token, not a hex
  routes: [...],                  // your portal pages (lazy-loaded)
  ResultsView,                    // golf results UI
  ProfileView,                    // athlete profile for golf
  parser?: { ... }                // how golf results get ingested (ask Casey if unsure)
}
```
The shell auto-discovers this manifest — you don't edit any central router file.

## STEP 5 — What to build first
1. **Golf homepage** (the portal landing): `PageHeader` + `Card`s, on the shared theme.
2. **Results UI**: a `Table` of competition results following sailing's pattern — ranked rows, athlete name as a link, numeric columns tabular. Ground-truth display only.

## STEP 6 — Validate before EVERY push (mandatory gate)
- esbuild syntax check on the shell bundle — **no TDZ** (const/let used before declaration is the #1 white-screen vector; esbuild won't always catch it, so review new `useEffect`/const ordering manually).
- If you touched any Python under `apps/web/api/`: `python3 -c "import ast; ast.parse(open('<file>').read())"`.
Both must pass before committing.

## STEP 7 — Git workflow (Ben pushes)
```bash
rm -f .git/*.lock               # stale locks silently swallow files — always clear first
git add <explicit golf paths>
git commit -m "..."
git push                        # then CONFIRM the expected file count changed
```
- Open **small PRs into `main`**; CI runs only golf's checks; merge → Vercel deploys.
- **Pull `main` at the start of every session** so you're always on the latest shared foundation.
- Migrations: timestamp filenames (`20260628_*.sql`), prefix golf tables `golf_*`, then `NOTIFY pgrst, 'reload schema';`.

## Also read
`MONOREPO_SETUP.md` and `CLAUDE.md` at the repo root for full architecture, design tokens, and gotchas.
