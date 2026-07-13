# AthLink 2.0 — Claude Code context
_Last updated: 9 July 2026_

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
- Frontend: React 18, Vite. The sailing app was decomposed (reorg step 4, done
  2026-07-09) from one ~13k-line file into `sports/sailing/src/{util,data,views}/`
  + shared `packages/features/*`; `App.jsx` (~6.3k lines) is now imports + the
  app-shell helpers (URL routing, form scaffolding) + the stateful `AthLinkMVP`
  component. **See `sports/sailing/src/README.md` for the module map and the rules
  for changing this code — read it before editing sailing frontend, especially the
  "views never import App.jsx" rule.** Run `node tools/check-modules.mjs` after any
  cross-module move (the build does not catch undefined refs / bad named imports).
- Backend: Python serverless `api/sailing/parse_pdf.py` + `api/ai_filter.py`
- DB/Auth: Supabase (Postgres + GoTrue), project ref `ylzoburtpibbgqdggjty`
- AI (parser v3, 2026-07): **Gemini is the universal primary** for EVERY AI task
  (search suggestions, overviews, hover blurbs, flag/nat reads, photo/scan vision,
  date/country enrichment) via ONE paid key `Gemini_API_Key_Universal`. **Anthropic
  Sonnet 5 (`claude-sonnet-5`) is the ONE fallback** — fires only on a Gemini
  error. No Haiku anywhere; Kimi/DeepSeek/Cerebras retired from default routes.
  Per-task model map + key resolution live in `api/_shared/llm.py` (see below).
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
- **`Gemini_API_Key_Universal`** — the ONE paid Gemini key for EVERY AI task
  (exact mixed-case name; set in Vercel Production + Preview). Resolved centrally
  via `llm._gemini_key()`, which falls back to the legacy **`GEMINI_API_KEY`** so
  local `.env.local` keeps working. Every Gemini call in api/*.py resolves through
  that one helper.
- **`ANTHROPIC_API_KEY`** — universal FALLBACK only (Sonnet 5). Fires when Gemini
  errors/rate-limits. AI mode works with just the Gemini key; Anthropic isn't
  required for a deploy.
- Model overrides (env, no code change): `FILTER_MODEL`, `OVERVIEW_MODEL`,
  `HOVER_MODEL`, `NAT_MODEL` (legacy `GEMINI_NAT_MODEL`), `VISION_MODEL` (legacy
  `GEMINI_VISION_MODEL`), `ENRICH_MODEL`, and `ANTHROPIC_FALLBACK_MODEL`
  (default `claude-sonnet-5`).
- RETIRED (deactivated / no longer routed to): the old free Gemini keys
  (`parser` …7qyQ, `flag-reading` …18vw, `athlink2.0` …Etaw), `KIMI_API_KEY`,
  DeepSeek and Cerebras. The `openai`-compatible caller stays in llm.py so a
  provider can be re-added purely via env, but no task routes to them by default.
- VERCEL_OIDC_TOKEN (pulled automatically via vercel env pull)

## Validation — run after every frontend edit
```bash
# 1. Build = the authoritative syntax/bundle check (App.jsx now imports util/data/
#    views + @athlink/* workspace pkgs, so bundle the whole app, not one file):
pnpm --filter @athlink/web build

# 2. Static safety net — REQUIRED after moving code between modules. The build does
#    NOT error on a free identifier (→ runtime ReferenceError) or an import of a
#    non-exported name (→ silently undefined). This @babel-based checker does:
node tools/check-modules.mjs        # no-undef + import-resolution over every sailing module

# Python syntax check (after parse_pdf.py edits)
python3 -c "import ast; ast.parse(open('api/sailing/parse_pdf.py').read())"
# NOTE: the parser test harness needs a python3 with pdfplumber+openpyxl —
# on Casey's machine that is /opt/anaconda3/bin/python3:
# /opt/anaconda3/bin/python3 tools/test_parser.py --diff
```
All must pass before committing. TDZ is the primary white-screen crash vector —
the build won't catch const/let used before declaration. Manual review required
after every JSX edit, especially new useEffect hooks. (A single-file esbuild check
still works for a quick App.jsx-only syntax pass but no longer covers the imports.)

## Pre-push test gate — run before EVERY push to Vercel
Push = production (athlink.win), so test on localhost first. Use the
`athlink-tester` subagent (`.claude/agents/athlink-tester.md`) before any push;
it auto-detects frontend vs backend changes and runs:
- Frontend (`src/App.jsx`): esbuild check + TDZ review + localhost:5173 render.
- Backend (`api/sailing/parse_pdf.py`, `api/sailing/validate.py`): `python3 -c "import ast..."`
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
Class colours: 29er #E62A22 (logo red) · ILCA #2E78C8 (blue) · 49er #5FAF4E · Optimist #000000
Sub-classes: ILCA 7/6/4 #1F5490/#2E78C8/#86B4E4 · Optimist/Inter/Green #000000/#6b6b6b/#a3a3a3 · 49er (men) #5FAF4E / 49er FX (women) #1B87C9
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
- migrations/0008_host_logos.sql — APPLIED 2026-07-02, SUPERSEDED by 0011 — see below. Added the hosts.logo_url column (still used). The original paused data-URL UI was never resumed; 0011 replaces that approach with a real storage bucket. (Old full-colour data-URLs from this era were cleared from the DB 2026-07-07.)
- migrations/0009_athlete_media.sql — APPLIED 2026-07-02 — athlete_profiles.media jsonb ('[]'). Athlete-owned photo+video gallery (array of {url,type,caption}); owner-write via existing 0004/0005 RLS. Managed in MediaModal (popup opened by a Media button between Calendar and Instagram under the profile photo), saved via saveAthleteMedia/upsertAthleteProfile.
- migrations/0010_athlete_media_bucket.sql — APPLIED 2026-07-02 — public `athlete-media` storage bucket (50MB, image+video MIME) + public-read/authenticated-write policies mirroring athlete-photos. REQUIRED for athlete video uploads (athlete-photos is images-only, 5MB). Uploaded to by uploadAthleteMedia.
- migrations/0011_host_logos_bucket.sql — APPLIED 2026-07-07 — public `host-logos` storage bucket (5MB, PNG/webp) + public-read/authenticated-write policies mirroring athlete-media. Backs the host/association self-logo feature: HostEditModal lets the user square-crop/centre the logo (LogoCropper), then removeLogoBackground strips the background ONCE at save time (KEEPING original colours — corner-sampled bg → transparent, feathered edge), uploadHostLogo stores the PNG here, and writes its public URL to hosts.logo_url. Reuses the existing hosts.logo_url column (from 0008) — no new column.
- migrations/0012_host_dossier.sql — APPLIED 2026-07-08 — adds `hosts.dossier jsonb` for the Host auto-grab feature (see "Host auto-grab" below). Stores the confirmed web-research dossier `{identity, competitions[], pending_import[], needs_review[], fetched_at, confirmed}`. Written by the signing-up owner via the normal host save path (saveHost); no new RLS (host write policies already cover it). Schema reloaded via `NOTIFY pgrst, 'reload schema';`. (createHostFromSignup also has a resilient fallback — it retries the hosts insert without the dossier if the column is ever missing — so host creation never depends on this migration.)
- migrations/0013_devmode_anon_writes.sql — APPLIED 2026-07-13 — dev-mode admin editing WITHOUT a signed-in session: anon write policies on athlete_profiles + athlete_usernames (anon rows carry updated_by null), anon insert/update on the athlete-photos / athlete-media / host-logos buckets, and the new `site_content` table (public read, open write) backing the landing-page dev copy editor. ⚠ Extends the "app-gated, not RLS-gated" stance of hosts_write; drop the *_anon policies together with fixing is_athlink_admin().
- migrations/0099_cleanup_duplicate_policies.sql — OPTIONAL dedupe of redundant RLS policies

### Host logos (crop + background-removal at upload)
A host — federation, club, OR class association (an association is just a class-locked host, so its logo IS its "class logo"; no separate subsystem) — can upload a logo in the Edit page. The uploader lets the user square-crop/centre the image (pan + zoom, `LogoCropper`), then the background is removed ONCE at save time KEEPING the logo's original colours (`removeLogoBackground`: samples the 4 corners for the bg colour, drops pixels within tolerance to transparent with a feathered edge — never a render-time CSS filter), and the transparent PNG is stored in `host-logos` with its URL saved to `hosts.logo_url`. Renders in two places: the directory card + fed→association sub-cards (bottom-right, 60px, full colour) and the portal header (right of the title, close to it, 128px, vertically aligned to the globe; globe left, title middle, action buttons far right). Synthetic `class:*` portals have no host row → no logo. Helpers `removeLogoBackground` + `uploadHostLogo` (in `sports/sailing/src/data/hosts.js`); `LogoCropper` + UI in `HostEditModal` (both in `sports/sailing/src/views/host.jsx`; onUploadLogo prop = uploads a processed Blob, gated to canManage); threaded through applyDbHosts + saveHost.
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

## Rating engine (Glicko-lite, client-side) — added 2026-07-08
One global skill rating per athlete (NOT per-class) — R (start 1200) + uncertainty
RD (∈ [60,350]). **Now lives in the universal package `@athlink/rating`**
(`packages/features/rating/src/index.js`); sailing binds it in
`sports/sailing/src/views/charts.jsx` via
`makeRatingEngine({scoreEvent,canonName,dateKey,monthsBetween})`, and `AthleteWeb`/
`ProgressChart` (same file) are its only consumers. Constants block: `RATING_START/RD_START/RD_MIN/RD_MAX/
RATING_SCALE/K_BASE/RD_DECAY_C/RD_EVENT_SHRINK/CLS_SWITCH_RD_BUMP`. One update per
event, chronological dateKey order (stable tie-break on event id); undated/Draft/
unscoreable events are never rated. Each event is multiplayer Elo from a
pre-event snapshot (simultaneous deltas): pairwise `S` vs `E=1/(1+10^((Rj−Ri)/400))`,
`ΔR_i=K_i·Σ(S−E)/(N−1)`, `K_i=32·(RD_i/60)` clamped [32,128]; same-boat partners
are never compared against each other. RD grows on idle time
(`√(RD²+18²·monthsIdle)`), bumps +60 the first time an athlete rates in a new
class (capped 350), and shrinks ×0.97 per rated event (floored 60).
- **Cache**: module-level `RATINGS_CACHE=new WeakMap()` keyed by the `events`
  array's identity; accessor is `getAthleteRatings(events)`. A NEW filtered/sliced
  events array (different identity, same contents) misses the cache and
  recomputes — this is expected, not a bug. Dev-only `console.time("athlink
  ratings")` behind `import.meta.env.DEV` (~65ms on the 59-event dataset).
- **HARD BOUNDARY**: the PDF is ground truth. Ratings are a derived metric layered
  on top — ranks are always READ from `scoreEvent(ev).rows` (tie-aware);
  finishing order is never re-ranked, recalculated, or displayed altered by the
  rating engine.
- **Rival score** (in `computeRivalCohort`): `rivalScore = decayedJaccard^ALPHA ×
  prox^BETA × ratingProx^GAMMA × activity`, where `ratingProx=exp(-|ΔR|/200)`
  comes straight from this engine (neutral 0.5 if either athlete is unrated).
- **Consumers**: `AthleteWeb` (node distance from focal via d3 `forceRadial`) and
  `ProgressChart` (the skill-rating curve + uncertainty band) — both in
  `views/charts.jsx` — read through `getAthleteRatings`/`computeRivalCohort` (the
  engine returned by `makeRatingEngine`); no separate rating logic lives there.

## Public usernames (URL identity) — migration 0007
Two namespaces share the root path, so usernames are unique case-insensitively
across BOTH: athletes (`athlete_usernames.username`, keyed by name_key =
lower(btrim(name))) and hosts (`hosts.slug`; internal `hosts.id` is unchanged —
still the FK everywhere). Default athlete username = FirstnameLastname
(`athlink_pascal`), numbered on clash by first appearance; assigned to every new
athlete by the `ensure_athlete_username` trigger. This is DISTINCT from
`profiles.username` (the lowercase account/login handle).
- Frontend: `ATHLETE_USERNAMES` module registry + `applyAthleteUsernames`/
  `usernameForName`/`nameForUsername` now live in `sports/sailing/src/data/athletes.js`
  (loaded from athlete_usernames before events); `hostSlug`/`hostBySlug` (in App.jsx)
  + those drive stateToPath/pathToState. Falls back to PascalCase(name) if unloaded.
  App.jsx mutates `ATHLETE_USERNAMES.byKey`/`.byUser` in place (live binding) on edit.
- Editing: verified owner/admin only. Athlete → AthleteEditModal "Profile link"
  field → `saveAthleteUsername`. Host → HostEditModal "Portal link" → `saveHostSlug`.
  Both validate [A-Za-z0-9]{3,30}, block reserved routes, check availability
  across athletes+hosts, show a "taken" message, then replaceState the new URL.
- Identical names stay ONE profile (product decision); numbering only breaks real
  clashes. Same-name-different-person separation is still unsolved (needs identity
  resolution) — the numbering is a safety net, not a person-splitter.

## Athlete profile — division badges + progress chart (added 2026-07-07)
- **Outstanding Achievement badge**: gold liquid-glass **pill** on profile
  result rows when the athlete podiums (top-3) within an age-category or gender
  division AND that division rank beats the overall rank chip. Derived by
  filtering the official overall order (scoreEvent rows) — never re-ranked.
  Shows just an Award icon + the achievement (e.g. "1st Under-18"); the full
  "Outstanding Achievement: …" text lives only in the `title` tooltip.
  Helpers in `data/scoring.js`: `outstandingAchievementFor(h, athleteName)`
  (pure, reusable), `divisionDisplayName()`, `MIN_DIVISION_SIZE=4` (tunable);
  `ordinalOf()` is in `util/name.js`. One badge per row — best division rank wins,
  tie prefers category; runner-up axis lives in the tooltip. CSS: `.oab`/`.oabv`
  pill (radius 980); collapses to icon-only ≤430px (the .ev row is nowrap — a
  wide badge crushes the middle column on mobile).
- **Progress vs Rivals chart**: third profile tab (Globe/Web/**Progress**, same
  260×220 dark-card swap pattern). Per-event score = share of the athlete's top
  rivals finished ahead of (ties 0.5), 0–100%, with a rolling-mean trend
  (`SMOOTH_WINDOW=5`) and Career/By-year toggle. The cohort comes from
  `computeRivalCohort(name, events, N=15)` — mechanically extracted from
  AthleteWeb's graph memo and now the SINGLE source of truth for "real rivals"
  (AthleteWeb consumes it too; cohort verified byte-identical after the
  extraction). Undated, Draft, and `<MIN_RIVALS_PRESENT=2` -rival events are
  excluded; <3 scored events shows an empty state. Hand-rolled inline SVG in
  `ProgressChart` (no recharts import — keeps the bundle lean).

## Auth architecture
Multi-step SignInModal: credentials → role pick → details.
Google OAuth via Supabase redirect; new users route into onboarding.
Under-16: guardian-email approval only, never ID verification.
**Extracted to `@athlink/auth`** (`packages/features/auth`, reorg step 3, done
2026-07-09): `makeSignInModal(deps)` factory + `fetchProfile`/`upsertProfile`/
`authGoogleOAuth`. Sailing binds it in `sports/sailing/src/views/auth.jsx`
(`export const SignInModal = makeSignInModal({…13 sailing deps}))`); to add auth to
another sport, provide that sport's pickers/host-helpers to the same factory.

## Host trust
Roles: Owner + Editor. Editor can do everything except remove/demote Owner.
Last Owner never removable. First claimant = Owner but write/import gated
until Casey flips verified=true in Supabase. Host auto-grab bulk import honours
this same gate (verified owner membership; dev view bypasses) — see "Host
auto-grab".
Invite links: 7-day expiry, single-use.
Tables: host_members, host_invites, host_audit.

## Custom boat classes
Global runtime registry: CUSTOM_CLASSES (`export let`, in
`sports/sailing/src/util/class.js`; set via `setCustomClassRegistry`, read via live
binding — `classLabel`/`classColor`/`customClassById` also there).
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
5. Rating engine + rating-aware rival score (`feature/rival-rating-engine`,
   2026-07-08) — built and validated on its branch, not yet merged to main;
   see the "Rating engine" section above.

## Parser rules (api/sailing/parse_pdf.py) — v2, July 2026
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
- AI routing (api/_shared/llm.py) — parser v3, 2026-07: **Gemini-primary / Sonnet-5
  fallback for ALL tasks.** `ROUTES` per-task map (provider always `gemini`, key
  via `_gemini_key()`):
    · `filter` (search suggestions) → `gemini-3.1-flash-lite` (benchmarked 0.92s)
    · `overview` / `hover` → `gemini-3.1-flash-lite`
    · `nat` (flag/nat vision) → `gemini-3-flash`
    · `vision` (photo/scan parse) → `gemini-3-flash`
    · `enrich` (date/country) → `gemini-3-flash` + Google Search grounding
    · fallback (all) → `claude-sonnet-5` via ANTHROPIC_API_KEY (never Haiku)
  Each model is env-overridable (see env matrix). `parse_pdf.py` prefers a direct
  Gemini `_gemini_parse` when rules fail (faster/cheaper than the Anthropic agent
  loop); the agent loop is Anthropic-only fallback when there's no Gemini key.
  `_gemini_parse` itself falls back to Sonnet on a Gemini error. `enrich.py` uses
  Gemini + `google_search` grounding, Sonnet web_search as fallback.
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
- Probe mode: POST `{probe:true, url}` → fetch+sniff+detect_format only (no
  parse/AI, ~10s bound), returns `{ok, reachable, family, parseable, ...}`. Backs
  the Host auto-grab discovery view — see "Host auto-grab".
- Timeout: 50s. vercel.json sets maxDuration 60 (parse_pdf + enrich + research_host).
- Test loop: /opt/anaconda3/bin/python3 tools/test_parser.py --diff — one
  fixture per family in tools/fixtures/ (17 fixtures incl. xlsx/blw/html);
  regenerate baselines deliberately, never blind-accept.
- WHOLE-CORPUS regression harness (parser v3): /opt/anaconda3/bin/python3
  tools/corpus_test.py [--update|--diff] — runs the rule parser over EVERY file
  in "Results to parse" + the extracted Email 7/8/9 zips, recording family,
  per-fleet counts, confidence, wall-time and correctness smells (suspicious dup
  ranks, ragged races, missing sails, name pollution). Snapshots in
  tools/corpus_baseline/ are the regression contract. Current: 77 rule / 21
  vision-by-design / 4 images / 3 deferred-to-vision (Palma+SOF Sailti glyph,
  Hebe clubspot). Scoreboard + limitations: docs/parser-v3-results.md.

## Host auto-grab (AI onboarding) — added 2026-07-08
When a new host (club / class association / federation) signs up, AthLink
researches them on the web and offers to pre-fill their profile + bulk-import
their past competitions. Three phases, all sharing the enrich.py contract (never
hard-fail: HTTP 200 + `{ok:false}` on any provider error; nulls over guesses;
never auto-apply; keys server-side; 45s provider bound under the 60s ceiling).
- **api/research_host.py** (NEW endpoint) — host-agnostic web research. POST
  `{name, type, country_hint?, mode}`; `mode` ∈ `identity` (signup "Is this you?"
  card: official_name/acronym/website/country/classes/blurb + up to 5 recent
  competitions) | `competitions` (discovery: up to 20 events with a `kind`
  pdf/html/unknown guess). Gemini-primary + Google Search grounding → Sonnet-5
  web_search fallback (routed as task `research` in llm.py, model `gemini-3-flash`,
  env `RESEARCH_MODEL`). Registered in vercel.json (maxDuration 60). Pure
  name+type → dossier out — no DB access, so an admin "run for any host" UI can
  call it later unchanged.
- **Probe mode** (in api/sailing/parse_pdf.py) — POST `{probe:true, url}` → fetch (bounded
  ~10s) + sniff + `detect_format` ONLY (NO parse, NO AI). Returns `{ok, reachable,
  family, parseable, content_type, bytes}`; unreachable → `{ok:true,
  reachable:false}` (never hard-fails). `parseable` = matched family OR input type
  the parser accepts (pdf/image/html/xlsx/csv). `fetch_url_bytes(url, timeout=45)`
  gained the optional timeout (default preserves behavior).
- **Frontend** (src/App.jsx) — Phase A: best-effort research during host signup
  (800ms debounce + blur, `researchedNameRef` refire guard, AbortController for
  stale responses) → liquid-glass "Is this you?" card; confirm stashes the dossier
  into the `createHostFromSignup` hosts insert. Phase B: `HostDiscoveryModal`
  extends the dossier via competitions-mode research, probes each URL (3-concurrent
  pool), fuzzy-dedups vs `events` (name + year via dateKey + class) — matches →
  "Already on AthLink" + Claim it (event_claims). **Two entries:** (1) a
  dismissible "We found your organisation on the web" banner on every host page
  (managers/members only) — clicking "See what we found" opens discovery (research
  by host name) AND sets `dossier.grab_dismissed` (persisted) so it disappears; a
  "×" dismisses without opening. `dismissHostGrab()` persists the flag. (2) a
  **"Scrape website" tab** inside the "Import a competition" modal — paste multiple
  site URLs (one per line) → "Find results" opens discovery seeded with those sites
  (`seedSites` prop → competitions-mode research per site). (The old portal-header
  "Import past results" pill and the Edit-page "Host website" field were removed.)
  Phase C: **"Import N selected" does NOT auto-commit** — it parses each selected
  competition (2-concurrent pool, live per-row status) via the URL path, then routes
  ALL parseable results into the STANDARD import preview/publish modal
  (`openPreviewsInImport` → `pending` tabs) so the host reviews + publishes each,
  exactly like drag-drop. Publish-time `eventFingerprint` dedup prevents duplicates;
  the source URL rides on `previewEv.sources`. (Earlier auto-commit +
  confidence-gate + needs_review path was removed — it caused silent imports,
  a frozen modal, and duplicate rows on repeat clicks.)
- **Verified gate**: bulk import is gated on the host being verified — realized via
  the owner's verified `host_members` row (`hosts` has no verified column). Unverified
  hosts see a disabled "Ready to import — pending verification" button (selection
  still saves); dev view (Ctrl/Cmd+Shift+D) bypasses it like every other gate.
- **MOCK_RESEARCH** (const in `sports/sailing/src/data/hosts.js`, DEFAULT false;
  `mockResearchIdentity`/`mockResearchCompetitions`/`mockParse`/`mockProbe` live
  there too) — stubs research/probe/parse for localhost smoke tests (the
  research_host + probe endpoints are NEW, so they 404 on localhost until pushed to a
  Vercel preview). Must stay false in commits.

## Known gotchas
- TDZ is the primary white-screen vector — mandatory check after every edit
- Host auto-grab endpoints (api/research_host.py, the parse_pdf probe) are NEW —
  NOT testable on localhost (404 until deployed); use MOCK_RESEARCH for the UI and
  test live calls on the branch's Vercel preview. Migration 0012 is APPLIED
  (2026-07-08) so dossier persistence works; createHostFromSignup also retries the
  hosts insert without the dossier as a belt-and-suspenders fallback.
- Trailing /rest/v1/ in VITE_SUPABASE_URL breaks the Supabase client
- Non-UUID IDs cause silent 400s (events.id = uuid; host ids = text)
- Dev view ALWAYS starts OFF on every page load — opt-in per session via
  Ctrl/Cmd+Shift+D only. No ?dev=1, no localStorage persistence (removed
  2026-07-02), so nobody lands in dev mode by accident. In dev mode: full
  (association) access, all auth/verification gates bypassed client-side
  (canEdit/canManage/canVouch forced true, verify warnings suppressed), host
  delete buttons on the directory cards + the dev strip, and — since migration
  0013 (2026-07-13) — host/athlete settings SAVES persist signed-out too (anon
  RLS policies; anon rows carry updated_by null). Member/invite management
  still needs a signed-in session (needs a real actor user id). The landing
  page has its own Ctrl/Cmd+Shift+D copy editor (click-to-edit, saves to
  site_content id='landing', merged over the coded defaults at load; "Reset
  all" clears). To hard-disable the keyboard toggle at launch, set
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
