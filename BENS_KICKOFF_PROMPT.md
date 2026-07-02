# Ben — getting started on AthLink Golf

## Before you paste the prompt (one-time setup)
1. **Clone the repo** to your machine:
   `git clone https://github.com/CaseyATHLINK/AthLink2.0.git`
2. **Connect that `AthLink2.0` folder** to your Claude Cowork session (so Claude can read/edit it).
3. **Get the Supabase keys:** log in to supabase.com, open project `ylzoburtpibbgqdggjty` → Project Settings → API. You'll need `Project URL` and the `anon` `public` key for your local `.env.local`.

## Then paste this into your Claude Cowork session
---
You're helping me build the **Golf portal** for AthLink, a multi-sport competition-results platform. The repo (already connected to this session) is a **pnpm monorepo**, and I own **`/sports/golf`**. Casey owns sailing and the shared packages.

**Step 1 — read these files in the repo, in order, before doing anything:**
- `BEN_GOLF_CLAUDE_BRIEFING.md` (your primary instructions)
- `CLAUDE.md` (codebase context, design tokens, gotchas)
- `MONOREPO_SETUP.md` (architecture overview)

**Step 2 — verify the structure exists:**
`ls packages/design-system packages/core packages/sport-kit sports/_template`
If anything is missing, stop and tell me.

**Step 3 — get me set up:**
- Make sure there's a `.env.local` at the repo root with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (I'll paste these in — they're from the Supabase dashboard).
- Run: `git checkout main && git pull`, then `git checkout -b golf-portal`, then `pnpm install`, then `pnpm create-sport golf`, then `pnpm dev`.
- Open http://localhost:5173 and confirm a **Golf** card appears on the landing page.

**Rules you must follow (from the briefing):**
- Build **only** in `/sports/golf`. Never edit `/packages`, `/apps/web`, or other sports.
- Import all UI from `@athlink/design-system`; import data/auth from `@athlink/core`. **Never hardcode colors or fonts** — match sailing's theme exactly via the shared tokens.
- Platform terminology: "Athletes" (not players/golfers), "Competition" (not tournament). Results are ground truth — never recompute them.
- Before every push: run the esbuild build and check for TDZ errors. Open **small PRs into `main`** (CI runs your checks automatically).

**Step 4 —** once I'm set up and the Golf card renders, **stop and ask me** which part of the golf homepage / results UI I want to build first. Don't start building features until I tell you.
---
