# AthLink 2.0 — Claude Code context
_Last updated: 3 July 2026_

## ⛔ File-write policy — READ FIRST (non-negotiable)
- **All code and file writes happen in this repo (`~/Desktop/AthLink2.0`).**
- **Casey's Obsidian vault ("Casey's dome" / the `AIOS` folder at
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Casey's dome/AIOS`)
  is READ-ONLY.** It is attached for CONTEXT ONLY (me.md, Vault Map, Skill Map).
  NEVER create, edit, move, or delete anything there — not notes, not maps, not
  scratch files — unless Casey explicitly says to write to the vault in that
  request. Reading is fine; writing is not.
- If a task seems to need a vault write, do it in `AthLink2.0` (or the outputs
  scratchpad) instead, and tell Casey — don't touch the vault.

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
Primary driver is **Claude Code Desktop app** (Code tab) — same app as Cowork,
but with per-session git isolation, an app-preview pane for localhost, and PR
status inline. Terminal (`claude`) still works identically for anything the
Desktop app doesn't cover.
```bash
npm run dev          # frontend at localhost:5173; /api proxied to live Vercel parser
claude               # Claude Code session (terminal, if not using Desktop app)
```
To push: just say **"push"** (or run `/push`) inside a Claude Code session —
`.claude/commands/push.md` runs the full sync-and-test routine (see "Pre-push
test gate" below) and pushes itself. Don't hand-run a bare `git push`.
Parser changes are NOT testable locally — they require a git push to deploy,
then test at localhost:5173 (the Vite proxy hits the newly deployed parser).
Cowork (chat) is still the driver for anything outside this repo — other
ventures, the Obsidian vault, cross-cutting planning.

## Env vars (.env.local — never commit)
- VITE_SUPABASE_URL — base URL only, no trailing /rest/v1/
- VITE_SUPABASE_ANON_KEY
- ANTHROPIC_API_KEY
- GEMINI_API_KEY — vision + nat reads ("parser" key, Google AI Studio)
- GEMINI_VISION_MODEL / GEMINI_NAT_MODEL — optional overrides (default gemini-3.5-flash)
- KIMI_API_KEY — text-task router (llm.py)
- VERCEL_OIDC_TOKEN (pulled automatically via vercel env pull)

## Validation — run after every App.jsx edit
```bash
# esbuild syntax check (pnpm layout: binary lives under node_modules/.pnpm)
./node_modules/.pnpm/node_modules/.bin/esbuild sports/sailing/src/App.jsx \
  --loader:.jsx=jsx --bundle \
  --external:react --external:react-dom --external:lucide-react \
  --external:recharts --format=esm --outfile=/dev/null

# Python syntax check (after parse_pdf.py edits)
python3 -c "import ast; ast.parse(open('api/parse_pdf.py').read())"
# NOTE: the parser test harness needs a python3 with pdfplumber+openpyxl —
# on Casey's machine that is /opt/anaconda3/bin/python3:
# /opt/anaconda3/bin/python3 tools/test_parser.py --diff
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

### /push command — the standing sync rule
Casey runs several AthLink tasks in parallel, each often started from an older
base. `.claude/commands/push.md` codifies the standing rule: before ANY push,
fetch origin, rebase the current branch's changes onto the latest remote HEAD
(resolving conflicts in favor of the most recently pushed work), THEN run the
test gate above, THEN push — one task's branch at a time, never batched. Say
"push" in any Claude Code session (terminal or Desktop app) to trigger it.
Parser/risky changes push to their feature branch (Vercel preview) first, not
straight to `main`.

### Parallel tasks — git worktrees
Casey typically has several feature branches in flight at once (check
`git branch -a` for the current set). Running two Claude Code sessions against
the same working directory on different branches risks one session's checkout
clobbering another's uncommitted files. Give each actively-driven branch its
own worktree instead:
```bash
git worktree add ../AthLink2.0-<branch> <branch>   # one-time per branch
git worktree remove ../AthLink2.0-<branch>          # after it merges
```
Open each worktree folder as its own Desktop app session/tab. Combined with
the `/push` sync step above, this makes the parallel-task pattern safe by
construction instead of by remembering a rule.

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
- migrations/0007_usernames.sql — APPLIED 2026-07-01 — public URL identity: athlete_usernames table (name_key→username, default FirstnameLastname, owner-editable, ~1,854 backfilled) + hosts.slug (editable, backfilled PascalCase) + athlink_pascal() + ensure_athlete_username() trigger on entries insert. RLS: public read, owner/admin write.
- migrations/0008_host_logos.sql — APPLIED 2026-07-02, FEATURE PAUSED — hosts.logo_url column exists in the DB but the host-logo UI was removed from src/App.jsx on 2026-07-02 (circle back later). To resume: re-add logo state/uploader in HostEditModal (downscale to ≤256px data URL), pass logo_url through applyDbHosts + saveHost upsert + save patch, and render it in a circular frame above the portal title (keep the globe). Column is harmless meanwhile.
- migrations/0009_athlete_media.sql — APPLIED 2026-07-02 — athlete_profiles.media jsonb ('[]'). Athlete-owned photo+video gallery (array of {url,type,caption}); owner-write via existing 0004/0005 RLS. Managed in MediaModal (popup opened by a Media button between Calendar and Instagram under the profile photo), saved via saveAthleteMedia/upsertAthleteProfile.
- migrations/0010_athlete_media_bucket.sql — APPLIED 2026-07-02 — public `athlete-media` storage bucket (50MB, image+video MIME) + public-read/authenticated-write policies mirroring athlete-photos. REQUIRED for athlete video uploads (athlete-photos is images-only, 5MB). Uploaded to by uploadAthleteMedia.
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
- Unknown/unresolvable slugs silently fall to sailing home (by design).

## Public usernames (URL identity) — migration 0007
Two namespaces share the root path, so usernames are unique case-insensitively
across BOTH: athletes (`athlete_usernames.username`, keyed by name_key =
lower(btrim(name))) and hosts (`hosts.slug`; internal `hosts.id` is unchanged —
still the FK everywhere). Default athlete username = FirstnameLastname
(`athlink_pascal`), numbered on clash by first appearance; assigned to every new
athlete by the `ensure_athlete_username` trigger. This is DISTINCT from
`profiles.username` (the lowercase account/login handle).
- Frontend: `ATHLETE_USERNAMES` module registry (loaded from athlete_usernames
  before events); `usernameForName`/`nameForUsername`/`hostSlug`/`hostBySlug`
  drive stateToPath/pathToState. Falls back to PascalCase(name) if unloaded.
- Editing: verified owner/admin only. Athlete → AthleteEditModal "Profile link"
  field → `saveAthleteUsername`. Host → HostEditModal "Portal link" → `saveHostSlug`.
  Both validate [A-Za-z0-9]{3,30}, block reserved routes, check availability
  across athletes+hosts, show a "taken" message, then replaceState the new URL.
- Identical names stay ONE profile (product decision); numbering only breaks real
  clashes. Same-name-different-person separation is still unsolved (needs identity
  resolution) — the numbering is a safety net, not a person-splitter.

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
Load/persist path (2026-07-03 fix — no more grey nuggets):
- Load is PUBLIC: fetchCustomClasses runs for anon viewers too (RLS allows
  anon SELECT), so logged-out pages get real labels/colours. DB rows are
  authoritative — they replace same-canonical local entries on load.
- Writes are verified: addCustomClass → persistCustomClass checks the insert
  result (hostRest returns null on failure — a .catch alone NEVER fires).
  Failed/signed-out writes queue in localStorage
  ("athlink_pending_custom_classes") and re-try on next signed-in load; a
  toast tells the user when a class couldn't be written yet.
- Safety net: any event referencing a custom:<slug> id with no registry entry
  gets a synthesized in-memory entry (prettified label + palette colour), so
  a grey "unrecognized" nugget can never render even if a write was lost.

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

## Parser rules (api/parse_pdf.py) — v2, July 2026
- Pipeline: detect → route → parse → normalise. `detect_format()` +
  `FORMAT_REGISTRY` (ordered family list; signature fn + extractor per family).
  Every result carries a `detected_format` {family, input_type, confidence}
  diagnostic. Format inventory + signatures: **docs/parser-formats.md** (ground
  truth — update it when adding a family; new format = new registry entry).
- Input types: PDF-text (pdfplumber), PDF-scanned/photos (vision AI),
  xlsx/xls/csv (openpyxl grid, block-split, overall-blocks preferred),
  HTML (_TableHarvester; hidden display:none regions dropped), .blw (raw
  Sailwave source — richest fields).
- Rule families: sailwave(-text/-geometry/-html/-html-native), manage2sail,
  sailti, sailti-web, sailingresults, clubspot, overall-results,
  aspose-bilingual-cn, bornan, asiansailing-wordpress, topyacht,
  excel-print-pdf, club-custom-xlsx, pya-events. Deferred to AI/vision by
  design: worldsailing-resultscentre, hubsail + Dragon multi-crew (big boat,
  out of scope), cn-games-book, ioda-word-notice, all zero-text scans.
- AI routing (api/llm.py): vision/photos → Gemini (gemini-3.5-flash,
  GEMINI_VISION_MODEL override); text fallback → Kimi; Anthropic Haiku 4.5 is
  the universal fallback. Images now go Gemini-first — bake-off 2026-07-04:
  Gemini 30s vs Kimi 48s at equal accuracy, and Kimi silently truncates long
  tables + can't ingest PDFs. Gemini calls walk a model LADDER
  (3.5-flash → 3-flash-preview → 2.5-flash) on quota-429s because the free
  tier caps each model per day; consider paid billing on the Gemini key.
- Tall screenshots (h>2400 and h>1.8w, e.g. full-page web captures) are parsed
  in ~800px horizontal bands served through the SAME ?count=1 / ?page=N
  chunking the client already uses for PDFs (a dense band ≈ 1.4s/row of vision
  output + ~13s overhead — one 60s request can't fit more than ~15-20 rows).
  Client dedupes band overlap by sail|helm|crew and retries a failed page
  after an 8s backoff.
- norm_category truncates at 14 chars — use RAW cell value for fleet names
- Fleet-label routing runs AFTER _looks_like_class demotion block
- Discard count = mode of bracketed-cell counts; returns 0 if no evidence
- AI nationality reads keyed by sail number, never row order
- parse_sail_country handles no-space sails (HKG929), HK→HKG, mixed case
- detected_class and detected_host returned as top-level JSON fields
- Per-row "Class" column read for mixed-handicap/PY divisions
- validate.py: zero-sail formats with strong nat coverage (bornan) dock 0.1,
  not gate-fail
- api/enrich.py: POST {name, cls, year, host, missing} → web-searched
  {date, country} suggestion, always confidence "low", never blocks the parse;
  preview shows it as a confirm-strip, never auto-applied. Host club's home
  country is the default event country when the document is silent (HK club ⇒
  HKG), overridable in preview.
- Timeout: 50s. vercel.json sets maxDuration 60 (parse_pdf + enrich).
- Test loop: /opt/anaconda3/bin/python3 tools/test_parser.py --diff — one
  fixture per family in tools/fixtures/ (17 fixtures incl. xlsx/blw/html);
  regenerate baselines deliberately, never blind-accept.

## Known gotchas
- TDZ is the primary white-screen vector — mandatory check after every edit
- Trailing /rest/v1/ in VITE_SUPABASE_URL breaks the Supabase client
- Non-UUID IDs cause silent 400s (events.id = uuid; host ids = text)
- Dev view ALWAYS starts OFF on every page load — opt-in per session via
  Ctrl/Cmd+Shift+D only. No ?dev=1, no localStorage persistence (removed
  2026-07-02), so nobody lands in dev mode by accident. In dev mode: full
  (association) access, all auth/verification gates bypassed client-side
  (canEdit/canManage/canVouch forced true, verify warnings suppressed). DB
  writes still hit Supabase RLS, so persisting changes needs a signed-in
  session. To hard-disable the keyboard toggle at launch, set
  DEV_VIEW_ENABLED=false.
- Tab title: sports/sailing sets document.title per page (host/athlete/event
  name); the shell resets it to "AthLink" on the landing route.
- custom: prefix in stored class ids — always use classLabel() to display,
  never render a raw class id directly
- hostRest/sbGet return null on ANY failure (RLS, HTTP, network) without
  throwing — .catch on their callers never fires; always check for null
- Date recency: use dateKey(str) (module helper) for dd/mm/yyyy sort keys —
  it zero-pads 1-digit day/month and returns "" for missing dates. Never
  compare raw split("/").reverse().join("") keys: unpadded parts mis-sort and
  the "—" placeholder (dbToApp's null-date fallback) outranks all digits,
  which let one undated event hijack every athlete's recentCls
- useEffect hooks that reference importerHost/_orgHost/_orgMode must be
  placed AFTER those variables are declared (TDZ risk)
- Vercel CLI is logged in as personal account (casey-9955) but project is
  under team org — CLI can't list deployments, but deploys work fine
- NOTIFY pgrst, 'reload schema'; required after every Supabase migration
