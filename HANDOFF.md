# AthLink 2.0 — HANDOFF

Resume in a new chat with: **"Read HANDOFF.md and continue."**
Last updated: **2026-07-03**. Repo: `~/Desktop/AthLink2.0` (CaseyATHLINK/AthLink2.0) · Live: **athlink.win** (Vercel) · Supabase ref: `ylzoburtpibbgqdggjty`.

> ⚠️ **Branch state:** on `design-sync-setup`, with real **uncommitted work** — see the MOST RECENT entry below before touching anything. Prior merged work: **PR #18** (`950bad2` — clean flat URLs + persistent usernames + editable host slugs) is on `main`.
> 🔴 **Read the MOST RECENT entry below first** — the pre-push test gate has a live gap discovered today (2026-07-03) that means frontend changes have NOT been validated by the Stop hook during the whole monorepo migration.

## How we work (the loop)
**Primary driver is now Claude Code Desktop app** (Code tab, `~/Desktop/AthLink2.0`) — it runs on Casey's own machine with real git/SSH access, so unlike the old Cowork-sandbox loop it can commit **and** push itself. Casey braindumps → assistant shows a short plan → implements directly → shows it live (localhost app-preview or a standalone HTML preview) → Casey says **"push"** → `.claude/commands/push.md` syncs with origin, runs the test gate, and pushes — no more handing Casey a push command. Parser/risky changes go to a feature branch (Vercel preview) first, not straight to `main`. Cowork (chat) is still the driver for anything outside this repo. Never push/merge without Casey's go-ahead. Full setup: `CLAUDE_CODE_DESKTOP_SETUP.md`.

---

## MOST RECENT: Cowork → Claude Code Desktop transition + critical pre-push gate gap found — 2026-07-03

**What shipped:** `.claude/commands/push.md` (codifies the standing "sync before push" rule — fetch → rebase onto latest origin → resolve toward remote → run `tools/pre_push_test.sh` → push, feature-branch-first for parser changes), `CLAUDE_CODE_DESKTOP_SETUP.md` (full transition guide: worktree-per-branch for the 7 parallel feature branches, Desktop app as primary driver), and `CLAUDE.md` updates pointing at both.

**🔴 Critical gap found while wiring this up — fix before trusting the gate again:**
`tools/pre_push_test.sh` detects frontend changes with `grep -qE '^src/'` and then hardcodes `esbuild src/App.jsx` as the file it checks. **`src/App.jsx` no longer exists** — confirmed via `ls` (not present). The monorepo migration moved the real frontend to `sports/sailing/src/App.jsx` (704KB, the file actually being edited today) plus `apps/web/src/{Shell,Landing,main}.jsx`, with real internal workspace deps (`@athlink/core`, `@athlink/design-system`, `@athlink/sport-kit`, `@athlink/sport-sailing` — not stubs, per each package's `package.json`). Net effect: **`^src/` never matches anything anymore, so `FRONT` never gets set to 1, so the Stop hook's frontend esbuild/TDZ check has been silently no-op-ing for the entire monorepo migration** — only the backend Python check (`^api/.*\.py$`) has actually been firing. This has been true for a while, not something today's changes caused, but it means any frontend work since the monorepo migration went out without the automated gate actually running.
- **Correct fix** (documented, not yet applied — needs Casey's Mac to test since this Linux sandbox only has Mac-incompatible `node_modules`): (a) extend the detection glob to also match `^apps/[^/]+/src/`, `^sports/[^/]+/src/`, `^packages/[^/]+/src/`; (b) replace the hardcoded single-file `esbuild src/App.jsx` step with the real build — `pnpm --filter @athlink/web build` (turbo-orchestrated, resolves the workspace packages for real instead of stubbing them as esbuild externals). HANDOFF already flagged `pnpm --filter @athlink/web build` as "the authoritative check" (see Validation gates section below) — `pre_push_test.sh` was just never updated to actually run it.
- Don't just patch the glob without also fixing the esbuild target — that would make FRONT=1 fire against a file that doesn't exist and hard-fail every push instead of silently skipping. Fix both together.

**Current uncommitted state on `design-sync-setup`** (none of it has been through a working frontend gate):
- `api/parse_pdf.py` — modified (53 insertions, 1 deletion)
- `sports/sailing/src/App.jsx` — modified (162-line diff)
- `CLAUDE.md` — modified (today's Desktop-app/push-command docs)
- Untracked: `CLAUDE_CODE_DESKTOP_SETUP.md`, `STRUCTURE_PROPOSAL.md`

**Minor:** saw a `.git/index.lock` "unable to unlink" permission warning in the sandbox mount — likely a sandbox quirk, not necessarily present on the actual Mac, but worth a quick `ls -la .git/index.lock` sanity check first thing. (`settings.local.json` already has an allowlisted cleanup command for this from a prior incident, so it's happened before.)

### Detailed instructions to get started coding (do these in order, in the new Claude Code Desktop session)
1. Open Claude Code Desktop app → **Code** tab → AthLink2.0 project, on branch `design-sync-setup`.
2. `git status` — confirm the four items above are still there; nothing should be lost between this handoff and the new session.
3. Fix the pre-push gate (see the two-part fix above) in `tools/pre_push_test.sh`, then deliberately break something trivial in `sports/sailing/src/App.jsx` (e.g. an unclosed brace) and confirm the gate now actually catches it — don't trust it again until it's proven to fail on a real error.
4. Revert the deliberate break, then run the fixed gate for real against the current uncommitted changes (`api/parse_pdf.py` + `sports/sailing/src/App.jsx`) before doing anything else with them.
5. Once clean, resume the **Active development focus** list in `CLAUDE.md`: parser `detected_host`/`detected_class` frontend wiring, `custom_classes` + host-country migrations (mostly done, check migrations/README), association/federation signup flows, publish flow.
6. When ready to save progress: say **"push"** — `/push` now runs the full sync + (fixed) test gate + push in one step.

---

## MOST RECENT: Dev-mode hardening + logo + tab titles + member usernames — IN PROGRESS (uncommitted, 2026-07-02)
Five changes, all validated (esbuild PASS on `sports/sailing/src/App.jsx` + `apps/web/src/Shell.jsx`; TDZ reviewed — new hooks reference only already-declared state). Awaiting Casey's localhost eyeball + **"push"**. Files touched: `sports/sailing/src/App.jsx`, `apps/web/src/Shell.jsx`, `CLAUDE.md`.

1. **Dev view never auto-on.** `devMode` now inits to `false` unconditionally; removed the `?dev=1` URL trigger, the localStorage read/write, and the post-launch admin-restore effect. Only **Ctrl/Cmd+Shift+D** toggles it, per session. Nobody lands in dev by accident or via a stale `?dev=1` link. (`~4418–4436`; "turn off" button no longer writes localStorage.)
2. **Dev overrides auth fully (client-side).** In dev mode `canVouch` is forced true at both `HostMembersModal` call sites (standalone `~6983` + embedded via `HostEditModal` membersProps `~7054`), killing the "Your account must be verified before you can vouch/approve" warnings. The "pending AthLink verification" banner (`~3545`) is suppressed when `canManage`. `canEdit`/`canManageMembers`/claim-nudge already respected dev mode. ⚠️ DB writes still hit Supabase RLS — persisting needs a signed-in session.
3. **Member usernames.** `fetchProfileNames` now returns `{names,usernames}` (was a bare name map — **both** callers updated: members modal `~3436` + DevApprovals `~3754`). Members tab renders the account `@username` in grey (`var(--mut)`) after the first/last name, on both active + pending rows.
4. **Logo → canonical brand mark.** Sailing top-bar logo swapped from the lucide `<Link2>` chain-link to `<img src="/brand/icon-app-circle.png">` (the navy "A + chain-link" circle, matching Landing's `.tb-mark`). `.tb-logo` CSS now transparent + `overflow:hidden`. This bar shows on every sailing page. (Landing + favicons already used the brand assets.)
5. **Dynamic tab title.** New effect (`~4` in the Clean-URL sync block) sets `document.title` to the current page's entity name — host portal → host name (e.g. "Hong Kong Sailing Federation"), athlete → name, event → event name, `/ranking` → "Ranking", `/athletes` → "Athletes", sailing home → "AthLink". Shell resets title to "AthLink" on the landing route.

6. **Blank event page on Back/deep-link — FIXED.** The event detail view was gated `{portal&&view.name==="event"}`, but `pathToState` resolves `/event/<id>` with `portal:null`, so any deep link, refresh, or Back-from-athlete-profile rendered a blank page (only top bar + footer). Dropped the `portal&&` — event view now renders on `view.name==="event"` alone (`~7656`). Guards stay mutually exclusive by `view.name`, so no double-render.

**Console 403 on `host_invites` (`code 42501`, "new row violates row-level security policy") is NOT a bug** — it's Supabase RLS correctly rejecting an invite-creation write from a session that isn't a verified owner/admin. Harmless (the app keeps running); it just means the UI let an unauthorized create be attempted. Same class as the dev-mode caveat: UI open, DB enforces RLS.

**Open follow-ups:** none blocking. Optional: also surface usernames in the Audit-log rows; consider a subtle " · AthLink" title suffix if Casey wants branding on deep pages (currently bare page name by his request). Optional: gate the "Create invite link" button behind real authorization so it doesn't attempt RLS-blocked writes.

---

## MOST RECENT: Clean flat URLs + native back/forward + persistent usernames — SHIPPED (PR #18, `950bad2`, 2026-07-01)
Two linked changes, both live on `main` → athlink.win. DB migration applied to prod Supabase (`ylzoburtpibbgqdggjty`).

### A. Path-based routing (replaced the hash router)
- URLs are now real paths, not `#/…`. Scheme: `/` (landing, shell) · `/sailing` (sailing home) · `/<Host>` (portal) · `/<Host>/athletes` · `/<Athlete>` (profile) · `/athletes` · `/ranking` · `/event/<id>` · `/class/<clsId>`.
- State⇄URL sync lives in **`sports/sailing/src/App.jsx`**: module-scope `stateToPath`/`pathToState` + the **"Clean-URL sync"** effect block (deep-link resolve on load, `pushState` on nav, `popstate` handler restores state). Guard `path !== location.pathname` prevents feedback loops; `urlReady` gates forward-sync until the initial deep-link resolves. Deep-link waits for `events` to load before resolving an athlete slug.
- **Shell** (`apps/web/src/Shell.jsx`): `usePathRoute` routes by first path segment; a bare entity slug that isn't a sport id falls to `DEFAULT_SPORT` (sailing), which resolves it internally. Sports broadcast nav via `dispatchEvent(new Event("locationchange"))`; shell listens to that **+ popstate**. Landing `goSailing` + the in-app logo use path nav.
- **`vercel.json`**: SPA rewrite `/((?!api/).*) → /index.html` so deep links don't 404 on refresh. Never let it swallow `/api`.
- In-app **Back** button now calls `history.back()`; `navStack` only feeds the Back *label* now.

### B. Persistent usernames (athletes) + editable slugs (hosts) — migration `0007_usernames.sql`
- **`athlete_usernames`** table: `name_key` PK (= `lower(btrim(name))`, same key as `athlete_profiles`), `username` unique-ci, `display_name`, `is_custom`, `created_at`. Backfilled **~1,854** — default `FirstnameLastname` via `athlink_pascal()`, numbered by first appearance on clash, avoiding host slugs + reserved words. **`ensure_athlete_username` trigger** on `entries` insert covers all future imports. RLS: public read, verified-owner (approved `athlete_claims`) / admin write.
- **`hosts.slug`** — editable public slug, unique-ci, backfilled to PascalCase(name). Internal **`hosts.id` UNCHANGED** (still the FK everywhere).
- Uniqueness spans **both** namespaces (athlete usernames + host slugs) case-insensitively, since both live at the root path.
- Frontend: **`ATHLETE_USERNAMES`** module registry (loaded from `athlete_usernames` **before** events); `usernameForName`/`nameForUsername`/`hostSlug`/`hostBySlug` drive the routing. `applyDbHosts` now carries `slug`. Falls back to `PascalCase(name)` if the map isn't loaded.
- Editing UI: `AthleteEditModal` **"Profile link"** → `saveAthleteUsername`; `HostEditModal` **"Portal link"** → `saveHostSlug`. Both: case preserved (`[A-Za-z0-9]{3,30}`), reserved-word block, live availability check across athletes+hosts, "taken" message, then `replaceState` the new URL. DISTINCT from `profiles.username` (lowercase account/login handle — unchanged).

**Product decisions locked (asked + answered):** fully-flat scheme (over prefixed); backfill-everyone-now; case-preserved usernames; identical athlete names stay **ONE** profile (numbering only breaks real clashes — same-name-different-person separation is still unsolved, needs identity resolution).

**Validation:** esbuild PASS (App.jsx / Shell.jsx / Landing.jsx via `/tmp` Linux esbuild); TDZ reviewed (new handlers reference `view`/`portal` only inside closures — safe; all setters declared above use). Full `vite build` can't run in the sandbox (macOS `node_modules`), but the **Vercel CI frontend build PASSED on PR #18** — that's the authoritative full-build check.

**Open follow-ups (this work):**
1. **Non-ASCII usernames are cosmetically rough** — `Martina Díaz-Salguero` → `MartinaDAzSalguero` (accents stripped, letters split). Fix = transliterate (í→i) in `athlink_pascal` + re-backfill, or just let owners edit. Functional + unique today.
2. **🔴 `is_athlink_admin()` still returns true for ANY logged-in user** (placeholder, see CLAUDE.md action items). That makes the username/slug write RLS effectively open to any signed-in user. Replace with real admin UUID(s) — HIGH priority before public launch.
3. Default host slug is the full name (e.g. `HongKongSailingFederation`); Casey/hosts shorten to `HKSF` in **Edit portal → Portal link**.
4. Optional: sync `profiles.username` (account handle) with the roster username on edit so they don't diverge.

---

## RECENT (prior session): Landing polish — SHIPPED (PR #15, `7c9edf2`, 2026-07-01)
Follow-up tweaks to the landing (`apps/web/src/Landing.jsx`), all CSS/copy — no logic changes:
- **Hero spacing fix.** The hero heading was cut off under the fixed nav. Root cause: the hero container is `class="wrap hero-inner"`, and `.al-landing .wrap` (2 classes, sets `padding:0 24px`) **out-specificities** `.hero-inner` (1 class), forcing vertical padding to `0`. Neither the old `150px` nor an interim `190px` ever applied. **Fix:** selector is now `.al-landing .hero-inner` → `padding:200px 24px 150px` (200 top clears the 78px nav with ~130px gap; 150 bottom gives room under the portal cards). ⚠️ **Gotcha:** any landing element that also carries `.wrap` needs a **2-class** selector to override padding/margins.
- **Serif accents → Newsreader, upright.** Swapped `--serif` from **Fraunces** to **Newsreader**. (Cartesia — the design inspiration — actually uses the *commercial* **PP Kyoto** headings + **ABC Diatype** body; Newsreader is the closest free match. If Casey licenses PP Kyoto, self-host the `.woff2` in `apps/web/public/fonts/` for an exact match.) Font now loads via a self-contained `@import` **inside the component `<style>`** (no longer depends on `index.html`), plus `font-optical-sizing:auto`. Accents (`.hero .sub`, `.em`) changed `font-style:italic` → **normal** to mirror Cartesia. ⚠️ The Fraunces `<link>` in `apps/web/index.html` is now **unused** — safe to delete (cleanup).
- **Traction copy:** label "Verified athletes" → **"100% real data"**; heading "Built with Hong Kong's class associations" → **"Every profile is verified by top organizations"**.

Verified live via Chrome DevTools on localhost before merge (computed `padding-top:200px`, nav-to-h1 gap 130px, `font-style:normal`, family `Newsreader`). esbuild PASS; TDZ n/a (CSS/text only).

---

## EARLIER: Landing page — front-door build — SHIPPED (PR #14, `74ad598`, 2026-07-01)
> Fonts + hero spacing have since changed — see **PR #15** above for current state (Newsreader/upright serif, `.al-landing .hero-inner` padding). Notes below describe the original build.

The AthLink shell front door (`apps/web`) previously had only a stub `Landing()`. It is now a full one-page marketing/brand landing. Structure inspired by cartesia.ai, reskinned entirely in AthLink tokens (navy + liquid glass + SF Pro).

**Files:**
- **`apps/web/src/Landing.jsx`** (NEW) — the whole landing. Self-styled via an injected `<style>` block; renders **outside** `ThemeRoot` on purpose so the Fraunces serif accents survive the `.al-ds *{font-family…!important}` override. Design tokens (`--navy`, `--accent`, `--mat-*`, etc.) come from `@athlink/design-system` `tokens.css` (`:root`); class colours (`--c29/--cilca/--c49/--copt`) + `--serif` are defined locally on `.al-landing`.
- **`apps/web/src/Shell.jsx`** — no-sport route now returns `<Landing sports={sports} />` (no `ThemeRoot`). Old stub `Landing()` + unused `Card/PageHeader/ChevronRight` imports removed.
- **`apps/web/index.html`** — added the Fraunces Google Font link.
- **`apps/web/public/landing/*.png`** — all 9 feature screenshots, served at `/landing/*.png` (`host-1/2/3`, `athlete-1/2/3`, `sponsor-1/2/3`).

**Sections (top → bottom):** floating sailing-style top bar (logo→scroll-top, hide-on-scroll-down, `ask me anything` search, **no profile button**) → dark hero with interactive liquid balls + **Sailing (Live) / Golf (Soon)** portal cards → **mission** (editorial, light body, Fraunces italic-gradient accent on "ultimate data centre") → **vision** ("LinkedIn for athletes and sponsors" + accent on "connecting athletes with brands through AI-driven matchmaking") → **ecosystem** ("Built by elite athletes" / "Making data actually interesting"; Hosts/Athletes/Sponsors tabs, 3 alternating feature rows each, "Solves:" red pain-pills, each screenshot in a **browser-window chrome frame**) → **traction** ("Verified athletes"; enlarged class nuggets 29er/ILCA/OPTI/49er + stats 47 competitions / 1,775 athletes) → **contact** (modal with copy-to-clipboard `casey@athlink.win`) → footer. **Global moving-ball background** across the whole page (`.al-liquid`, opacity .42); hero has its own brighter dark-tuned ball canvas.

**Behaviours:** `FeatureRow` shows a clean icon+title placeholder if an image 404s. Search (`searchAnswer`) is **local canned answers** for now (contact, sports, athletes, competitions, classes). Liquid ball logic (`useLiquid`) is ported from the sailing app's `LiquidBackground`.

**Validation:** esbuild PASS on `Landing.jsx` + `Shell.jsx`; TDZ reviewed; fixed a CSS stacking bug (`isolation:isolate` + `z-index:-1` on `.al-liquid`, matching the sailing `.al-ds` trick) so the fixed nav/modal aren't overridden. Standalone HTML preview kept at **`~/Claude/Projects/ATHLINK/landing-preview/`** (mirror of the React version; images in its `shots/`).

**Open follow-ups (landing):**
1. **Wire the nav search to real AI** — currently local canned answers. Casey to decide: keep the app's existing `claude-haiku-4-5`, or switch to **Kimi** (he mentioned "same API key it already has"). Needs a backend endpoint.
2. **Live hero portal stats** — the `47 competitions / 1,775 athletes` are hardcoded; wire to live counts from app/Supabase data.
3. Golf portal is a placeholder ("Soon") — no golf sport in the registry yet.

---

## PRIOR: Athlete Web + profile/menu polish — SHIPPED (PR #12, `35d69d9`, 2026-07-01)
All in the monorepo app **`sports/sailing/src/App.jsx`** (NOT the old `src/App.jsx`). Merged and live. Reference below for the co-competitor graph on the athlete profile.

### What shipped in PR #12
- **Portal class nuggets** (`HostClassPills`): >3 classes fan into an overlapping one-row stack, most-popular at back, `+N` opaque (`#2c3444`) on top; separator ring uses `var(--mat-reg)`. `OVER=-12`.
- **Menu pill open/close** (`.menupill`): seamless, no bounce — constant `border-radius:25px`, only the body elongates; one ease `cubic-bezier(.33,0,.2,1)`.
- **Profile filter chips** (`.filter-chip`): content-width, wrap inline.
- **Athlete web**: top rivals 10 → 15 (`slice(0,15)`); mini caption "Top 15 Rivals".
- **Competition footprint caption** moved below the globe (`marginTop:10`).

### What the Athlete Web is
A tab beside the competition-footprint globe on the athlete profile. Each node = an athlete the focal has raced. Two render modes from the same `AthleteWeb` component: **Mini-web** (small card on profile, Globe/Web toggle) and **Enlarged web** (in the globe popup, 70% canvas + 30% sidebar).

### Key code locations (all in `sports/sailing/src/App.jsx`; long lines — grep, don't read whole)
- `function WebIcon(` — custom spider-web SVG icon. Used by the Globe/Web toggles.
- `function AthleteWeb(` — props: `name, events, height, dark, enlarged`; `onPick(name)`, `onOpen()`, `onOpenEvent(id)`, `onSelectionChange(node|null)`, `deselectKey`.
- `graph` useMemo — builds nodes/links from `events`; per rival computes `nat` (mode) and `cls` (dominant shared boat class → node colour).
- The d3-force `useEffect` — sizing, scatter, forces, canvas draw, pointer/zoom/pan. `st.draw` stashed on the state ref for external-deselect repaint.
- `function FootprintModal(` — the popup; renders the web itself so it owns selection/deselect. Tabs Globe / Web; default `titleSuffix="Globe"`.
- Profile wiring: grep `profileTab` and `webProps={{`.

### Current tuning values (dials Casey keeps adjusting)
- **Node sizing**: focal `F = enlarged?12.6:7.65`; rivals `F*0.8*ratio` (`ratio = shared/maxShared`), floored `enlarged?3.3:1.95`. Top rival = 80% of focal; none bigger than focal.
- **Colour**: focal gold `#ffcf2e`; rivals `classColor(n.cls)`.
- **Count**: `.slice(0,15)`.
- **Physics** (`forceSimulation`): `velocityDecay(enlarged?.62:.58)`; link `.distance` focal-incident `(enlarged?126:47)+(1-ratio)*(enlarged?414:104)`, rival-rival `enlarged?270:91`; `.strength` focal `enlarged?.5:.45`, rival-rival `.04`; `charge enlarged?-270:-60`, `distanceMax enlarged?1100:390`; `collide rad(d)+(enlarged?10:7)` str `.6`; `forceX/Y` center `enlarged?.04:.05`; custom `bounds` soft walls (`a*0.6`); `endDrag` → `sim.alpha(.55).restart()`; radial size-seeded initial scatter.
- **Labels**: enlarged = all nodes, screen-space constant size; mini = hovered node only.
- **Interactions**: mini → click node opens popup, no pan; enlarged → click select / empty deselect / scroll zoom / drag pan / dbl-click profile.
- **Sidebar** (enlarged 30%): name as plain title (flag after name, clickable), shared competitions grouped by country (sticky pills, blur inside pill), rows clickable → results.

### Athlete-web eyeball items
- Enlarged spread is aggressive — dial `charge`/link `distance`/center strength if too edge-packed.
- Calendar vertical alignment (`marginTop:14`) approximate vs "Athlete overview".
- Smallest rival nodes have a visibility floor — Casey may want full shrink.
- Possible refactor: extract `AthleteWeb` to its own module during the design-system extraction.

---

## Validation gates (before push)
- **JSX/TDZ**: esbuild syntax check. Sandbox is Linux → install esbuild in `/tmp` (`cd /tmp && npm i esbuild`), run with externals `react,react-dom,lucide-react,recharts,d3-force`. On Casey's Mac: `pnpm --filter @athlink/web build`. **TDZ is the #1 white-screen vector** — manually review any new hook/useEffect for use-before-declare.
- Parser: if `api/*.py` changes, run `python3 -c "import ast..."` + `python3 tools/test_parser.py --diff`.
- ⚠️ **`tools/pre_push_test.sh` matches `^src/` only** — it **no-ops on `apps/web` and `sports/*/src/`** changes. esbuild is the authoritative gate for those. Fix the glob when convenient (add `apps/*/src/` and `sports/*/src/`).

## Dev loop & environment quirks
- Always `cd ~/Desktop/AthLink2.0` first. `pnpm dev` (often lands on http://localhost:5174). Routing is now **path-based** (not hash): `/` = landing, `/sailing` = sailing home, `/<Host>`, `/<Athlete>`, `/<Host>/athletes`, `/ranking`, `/event/<id>` — see the MOST RECENT section. HMR — just refresh; test deep-link + browser back/forward.
- ⚠️ **Watch the port `pnpm dev` prints.** Stale/zombie servers hold 5173/5174, so a new `pnpm dev` silently jumps to **5175** etc. — editing source while viewing an old port looks like "nothing changed." Kill zombies: `lsof -ti:5173,5174,5175 | xargs kill`. Also: the built `apps/web/dist/` is stale; `pnpm dev` runs `vite` (live HMR), not `vite preview`, so don't serve `dist/`.
- Sandbox can't auth git/push or run pnpm; Casey runs/validates/pushes. `d3-force` installed on `@athlink/sport-sailing`.

## Key references
`CLAUDE.md` (tokens, parser rules, gotchas) · `migrations/README.md` · `MONOREPO_SETUP.md` / `MONOREPO_STATUS.md` (historical).
