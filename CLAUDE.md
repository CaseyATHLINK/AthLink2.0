# AthLink 2.0 — Claude Code context
_Last updated: 23 June 2026_

## Product
B2B sailing results + athlete-data platform. Hosts (clubs, associations,
federations) upload competition PDFs → athlete profiles auto-built as a
byproduct. PDF is always ground truth — never re-rank or recalculate results.
Beachhead: Hong Kong class associations (29er, ILCA, Optimist, 49er).

## Stack
- Frontend: React 18, single-file `src/App.jsx` (~7,100+ lines), Vite
- Backend: Python serverless `api/parse_pdf.py` + `api/ai_filter.py`
- DB/Auth: Supabase (Postgres + GoTrue), project ref `ylzoburtpibbgqdggjty`
- AI: Anthropic `claude-haiku-4-5` — PDF parsing, flag-nationality reading,
  athlete overviews, hover summaries, smart filters
- Hosting: Vercel Hobby (60s function ceiling — never exceed in parse_pdf.py)
- Repo: CaseyATHLINK/AthLink2.0

## Local dev workflow
```bash
npm run dev          # frontend at localhost:5173; /api proxied to live Vercel parser
claude               # Claude Code session
git add . && git commit -m "description" && git push   # deploys to athlink.win
```
Parser changes are NOT testable locally — they require a git push to deploy,
then test at localhost:5173 (the Vite proxy hits the newly deployed parser).

## Env vars (.env.local — never commit)
- VITE_SUPABASE_URL — base URL only, no trailing /rest/v1/
- VITE_SUPABASE_ANON_KEY
- ANTHROPIC_API_KEY
- VERCEL_OIDC_TOKEN (pulled automatically via vercel env pull)

## Validation — run after every App.jsx edit
```bash
# esbuild syntax check
./node_modules/.bin/esbuild src/App.jsx --loader:.jsx=jsx --bundle \
  --external:react --external:react-dom --external:lucide-react \
  --external:recharts --format=esm --outfile=/dev/null

# Python syntax check (after parse_pdf.py edits)
python3 -c "import ast; ast.parse(open('api/parse_pdf.py').read())"
```
Both must pass before committing. TDZ is the primary white-screen crash
vector — esbuild won't catch const/let used before declaration. Manual
review required after every JSX edit, especially new useEffect hooks.

## Pre-push test gate — run before EVERY push to Vercel
Push = production (athlink.win), so test on localhost first. Use the
`athlink-tester` subagent (`.claude/agents/athlink-tester.md`) before any push;
it auto-detects frontend vs backend changes and runs:
- Frontend (`src/App.jsx`): esbuild check + TDZ review + localhost:5173 render.
- Backend (`api/parse_pdf.py`, `api/validate.py`): `python3 -c "import ast..."`
  syntax check + `python3 tools/test_parser.py --diff` vs `tools/baseline/`.
Reports a single PASS/FAIL. Note: the dev proxy sends `/api` to the LIVE Vercel
parser, so parser changes are NOT visible on localhost until pushed — the
harness is the authoritative local backend test.

### Automatic gate (any session)
A **Stop hook** in `.claude/settings.json` runs `tools/pre_push_test.sh`
automatically whenever a session finishes with `src/` or `api/*.py` changes in
the working tree. It detects what changed, runs the relevant checks, and makes
the assistant report the PASS/FAIL verdict before you push — no need to ask. The
script is the single source of truth (the `athlink-tester` agent calls it too);
it's a silent no-op when nothing testable changed, and self-guards against
re-running in a loop. First run in a new session, Claude Code will ask you to
approve the hook. Manual run any time: `bash tools/pre_push_test.sh`.

## Design tokens — never change
--navy:  #163a63   --navy2: #1f4e80   --accent: #0d8ecf

--sky:   #dcecf8   --paper: #f3f7fb   --ink:    #14213a

--mut:   #5b6b80   --line:  #d9e3ef   --gold:   #c8920b
Class colours: 29er #E84855 · ILCA #2E78C8 · 49er #5FAF4E · Optimist #3D3D3D
Custom classes: muted navy-palette tones only (--navy2, --mut, --accent).
No aggressive highlight colours.
Typography: SF Pro — Apple's system font — everywhere: headings, body, AND the
  AthLink wordmark. Use the system stack: -apple-system, BlinkMacSystemFont,
  'SF Pro Display', 'SF Pro Text', system-ui, sans-serif. Wordmark = SF Pro
  Display, weight 800, letter-spacing -.04em. (Any legacy Barlow / DM Sans refs
  are overridden to SF Pro on purpose — see packages/design-system tokens.css.)
Logo: ONE mark only — the rounded "A + chain-link" icon. Word logo = "AthLink"
  set in SF Pro (icon + live text on site). Never use any other logo style.
  Assets: apps/web/public/brand/ (site) + LOGOS folder (full brand kit).
No Tailwind. All CSS in the <style> block inside App.jsx using var(--*).

## Locked terminology — never change
- "Athletes" not sailors · "Competition" not regatta
- Separate first + last name fields everywhere
- No back buttons in the top bar
- Navy palette + liquid-glass material

## Key Supabase tables
events, entries, athletes, host_members, host_invites, host_audit,
event_claims, athlete_claims
Provenance columns on events: owner, owner_confirmed, imported_by,
organizer_name, fingerprint, sources

## Migrations — see migrations/ (canonical, numbered, idempotent)
Audited against live DB 2026-06-25 — see migrations/README.md for full notes.
- migrations/0001_baseline_schema.sql — full live schema (ALREADY APPLIED, no-op to re-run)
- migrations/0002_custom_classes.sql — custom_classes table — APPLIED 2026-07-01 (custom classes now persist to DB; grey-nugget bug fixed)
- migrations/0099_cleanup_duplicate_policies.sql — OPTIONAL dedupe of redundant RLS policies
Already applied (CLAUDE.md previously mislabelled these "pending"):
profiles.username, host_invites.short_code, event provenance columns,
country column on hosts AND events — all live.
ACTION: is_athlink_admin() is still a placeholder that grants admin to ANY
logged-in user — replace with real admin UUID(s). See README "Action items".

## URL routing — clean flat paths (added 2026-07-01)
Path-based, not hash. State ⇄ URL sync lives in `sports/sailing/src/App.jsx`
(`stateToPath`/`pathToState` at module scope + the "Clean-URL sync" effect
block). Scheme: `/sailing` (home), `/<Host>` (portal), `/<Host>/athletes`,
`/<Athlete>`, `/athletes`, `/ranking`, `/event/<id>`, `/class/<clsId>`.
Slugs = PascalCase, punctuation-stripped, case-insensitive. Single-segment
resolution priority: reserved word > host > athlete.
- Shell (`apps/web/src/Shell.jsx`) routes by first path segment; a bare entity
  slug that isn't a sport id falls to the default sport (sailing), which
  resolves it internally. Sports push paths via `history.pushState` +
  `dispatchEvent(new Event("locationchange"))`; shell listens to that + popstate.
- `vercel.json` has an SPA rewrite `/((?!api/).*) → /index.html` so deep links
  don't 404 on refresh. Never let it swallow `/api`.
- Back/forward buttons are driven by real browser history; the in-app Back
  button calls `history.back()`. `navStack` now only feeds the Back label.
- KNOWN LIMIT: PDF-derived athletes are keyed by name (not the profiles.username
  slug), so duplicate names collide (first match wins) and an athlete slug equal
  to a host slug loses to the host. Wire athlete URLs to a unique slug column
  before scaling beyond the HK beachhead.
- Unknown/unresolvable slugs silently fall to sailing home (by design).

## Auth architecture
Multi-step SignInModal: credentials → role pick → details.
Google OAuth via Supabase redirect; new users route into onboarding.
Under-16: guardian-email approval only, never ID verification.

## Host trust
Roles: Owner + Editor. Editor can do everything except remove/demote Owner.
Last Owner never removable. First claimant = Owner but write/import gated
until Casey flips verified=true in Supabase.
Invite links: 7-day expiry, single-use.
Tables: host_members, host_invites, host_audit.

## Custom boat classes
Global runtime registry: CUSTOM_CLASSES (let, module-level).
Any verified host can create a custom class via the "+ Other class" dropdown
in the import preview and in Add-a-host.
Dedup via canonical key (normalised lowercase, strip punctuation).
classLabel(clsId) helper resolves display name for any id — strips "custom:"
prefix from legacy-stored ids, never displays the raw id.
DB persistence: custom_classes table — migration 0002 applied 2026-07-01.

## Event provenance
Source (contributor) ≠ organizer. External imports stay out of importer's
portal. Dedup via fingerprint (normalised name + date + class + sorted sail
set). Event claims approvable by any verified admin of the attributed host.
Tables: event_claims + provenance columns on events.

## Athlete claims — PAUSED
Approvable by any verified admin of any host whose events the athlete appears
in. Resume only after all host signup flows are complete.
Table: athlete_claims.

## Active development focus
1. Frontend wiring: consume detected_host + detected_class from parser to
   pre-fill the preview; sync Date/HostCountry/Organizer across fleet tabs
   from the same PDF (see Batch C instruction in handoff doc).
2. DB migrations: custom_classes table + country column on hosts.
3. Association + federation signup flows (club flow is done).
4. Publish flow → then return to athlete side.

## Parser rules (api/parse_pdf.py)
- norm_category truncates at 14 chars — use RAW cell value for fleet names
- Fleet-label routing runs AFTER _looks_like_class demotion block
- Discard count = mode of bracketed-cell counts; returns 0 if no evidence
- AI nationality reads keyed by sail number, never row order
- parse_sail_country handles no-space sails (HKG929), HK→HKG, mixed case
- detected_class and detected_host returned as top-level JSON fields
- Per-row "Class" column read for mixed-handicap/PY divisions
- Sailti/Palma format intentionally has no rule parser — falls back to AI
- Timeout: 50s. vercel.json sets maxDuration 60.

## Known gotchas
- TDZ is the primary white-screen vector — mandatory check after every edit
- Trailing /rest/v1/ in VITE_SUPABASE_URL breaks the Supabase client
- Non-UUID IDs cause silent 400s (events.id = uuid; host ids = text)
- DEV_VIEW_ENABLED must be flipped to false before going public
- custom: prefix in stored class ids — always use classLabel() to display,
  never render a raw class id directly
- useEffect hooks that reference importerHost/_orgHost/_orgMode must be
  placed AFTER those variables are declared (TDZ risk)
- Vercel CLI is logged in as personal account (casey-9955) but project is
  under team org — CLI can't list deployments, but deploys work fine
- NOTIFY pgrst, 'reload schema'; required after every Supabase migration
