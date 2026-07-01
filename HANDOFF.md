# AthLink 2.0 — HANDOFF (Landing page + Athlete Web)

Resume in a new chat with: **"Read HANDOFF.md and continue."**
Last updated: **2026-07-01**. Repo: `~/Desktop/AthLink2.0` (CaseyATHLINK/AthLink2.0) · Live: athlink.win (Vercel) · Supabase ref: `ylzoburtpibbgqdggjty`.

## Landing page (front door) — IN PROGRESS, on `design-sync-setup`
The AthLink shell front door (`apps/web`) had only a stub `Landing()`. It's now a full one-page marketing/brand landing, built in **`apps/web/src/Landing.jsx`** (new) and wired into **`apps/web/src/Shell.jsx`** (renders `<Landing/>` for the no-sport route, **outside** `ThemeRoot` so the Fraunces serif accents survive the `.al-ds` font override). Fraunces font added to `apps/web/index.html`. Structure inspired by cartesia.ai, reskinned in AthLink tokens.
- **Sections:** floating sailing-style top bar (logo→top, hide-on-scroll, `ask me anything` search with local smart answers, no profile btn) → dark hero with interactive liquid balls + Sailing/Golf portal cards → mission (editorial, Fraunces serif gradient accents on "ultimate data centre") → vision ("LinkedIn for athletes and sponsors" + accent on "connecting athletes with brands through AI-driven matchmaking") → ecosystem (Hosts/Athletes/Sponsors tabs, 3 alternating feature rows each, "Solves:" pain pills) → traction (enlarged class nuggets 29er/ILCA/OPTI/49er + 47 comps / 1,775 athletes) → contact (modal w/ copy `casey@athlink.win`) → footer. Global moving-ball background across the whole page.
- **Images:** all 9 feature screenshots live in `apps/web/public/landing/` served at `/landing/*.png` (`host-1/2/3`, `athlete-1/2/3`, `sponsor-1/2/3`), each shown inside a browser-window chrome frame. `FeatureRow` falls back to a clean icon+title placeholder if an image 404s.
- **Follow-ups:** (1) wire the nav search to the app's real AI search (currently local canned answers — Casey asked re: Kimi vs the existing `claude-haiku-4-5`); (2) make hero portal stats live from data. Standalone HTML preview kept at `~/Claude/Projects/ATHLINK/landing-preview/`.
- **Validation:** esbuild PASS on `Landing.jsx` + `Shell.jsx`; TDZ reviewed. Note: `tools/pre_push_test.sh` matches `^src/`, so it no-ops on `apps/web` changes — esbuild is authoritative here.

## Where we are (previous work — Athlete Web, SHIPPED)
The **Athlete Web** (force-directed graph of co-competitors on the athlete profile) has been heavily iterated. All edits are in the monorepo app: **`sports/sailing/src/App.jsx`** (NOT the old `src/App.jsx`). Casey commits + pushes from his terminal; the Cowork sandbox edits + validates (esbuild/TDZ) but cannot push. Merges to `main` are done in the browser via the Chrome extension.

**Status: SHIPPED.** The whole Athlete Web + profile/menu polish body of work is **merged to `main` and live on athlink.win** — PR **#12** (`design-sync-setup` → `main`, commit `35d69d9`) merged 2026-07-01, all 4 checks green, Vercel production deploy triggered. Everything below is implemented, passing the esbuild/TDZ gate, and in production. `design-sync-setup` branch still exists (not deleted) and is Casey's working branch — start the next round of design tweaks on it (it's now level with `main` after the merge; `git pull` first).

⚠️ **Uncommitted:** this `HANDOFF.md` update is not yet committed — commit it with the next push.

### What shipped in PR #12 (commit 35d69d9, 2026-07-01)
- **Portal class nuggets** (`HostClassPills`): when >3 classes the pills now **fan into an overlapping stack on one row** (in line with the host-type pill), most-popular at the back, `+N` opaque (`#2c3444`) on top at the right. Separator ring uses `var(--mat-reg)` (the card background token) so it reads as the card surface and tracks the background colour. `OVER=-12` overlap dial.
- **Menu pill open/close** (`.menupill`): now **seamless, no bounce**. Root cause was `border-radius:980px` (height-capped) reflowing as the panel grew + animating to 24px = stretch-and-snap. Fixed to a constant `border-radius:25px` (≈ half closed bar height → still a capsule when closed, height-independent), so only the body elongates; top half never moves. Only `background` transitions now. Panel uses one unified ease `cubic-bezier(.33,0,.2,1)`.
- **Profile filter chips** (`.filter-chip`): now **content-width and wrap inline** in their own flex-wrap row (were stretching full-width in a column). Dropped the chip `margin-bottom` (row gap handles it).
- **Athlete web**: top rivals **10 → 15** (`slice(0,15)`); mini caption **"Top rivals" → "Top 15 Rivals"** (enlarged still dynamic `Top {count} rivals · …`).
- **Competition footprint caption** moved **below** the globe container (`marginTop:10`, only on footprint tab) so it clears the sphere + glow (was pinned `bottom:4` over it).

## What the Athlete Web is
A tab beside the competition-footprint globe on the athlete profile. Each node = an athlete the focal has raced. There are two render modes from the same `AthleteWeb` component:
- **Mini-web** — the small card on the profile (tab toggle: **Globe / Web**).
- **Enlarged web** — opens in the same popup as the globe (tabbed **Globe / Web**), with a 70% canvas + 30% sidebar.

## Key code locations (all in `sports/sailing/src/App.jsx`; long lines — grep, don't read whole)
- `function WebIcon(` — custom spider-web SVG icon (lucide has none). Used by the Globe/Web toggles.
- `function AthleteWeb(` — the component. Props:
  - `name, events, height, dark, enlarged`
  - `onPick(name)` — open an athlete profile (name pill / double-click node)
  - `onOpen()` — mini-web: a node click fires this to open the popup
  - `onOpenEvent(id)` — enlarged sidebar: clicking a competition opens its results (`go({name:"event",id})`)
  - `onSelectionChange(node|null)` — reports the selected athlete up to the popup (drives the header Deselect button)
  - `deselectKey` (number) — bump it to clear the web's selection from outside (the popup's Deselect)
- `graph` useMemo — builds nodes/links from `events`. Per rival it also computes `nat` (mode of entry `nat`) and `cls` (the boat class they shared the **most** competitions with the focal in — drives node color).
- The d3-force `useEffect` — sizing, scatter, forces, canvas draw, pointer/zoom/pan handlers. `st.draw` is stashed on the state ref so the external-deselect effect can repaint.
- `function FootprintModal(` — the popup. Now renders the web **itself** (`<AthleteWeb {...webProps} enlarged .../>`) so it can own selection/deselect. Tabs are **Globe / Web**; default `titleSuffix="Globe"`.
- Profile wiring: grep `profileTab` and `webProps={{`. Mini globe/web swap + the captions live there.

## Current tuning values (the dials Casey keeps adjusting)
- **Node sizing** (`const F=...; const rad=...`): focal radius `F = enlarged?12.6:7.65`. Rivals = `F*0.8*ratio` where `ratio = shared/maxShared` (linear), floored at `enlarged?3.3:1.95`. So: top rival = **80% of focal**, everyone else scales linearly off the top rival, **no rival bigger than focal**. (History this session: focal 50% smaller → +20% → +50%; rival ratio 0.6 → 0.8.)
- **Color**: focal = gold `#ffcf2e`; rivals = `classColor(n.cls)` (dominant shared boat class).
- **Node count**: `.slice(0,15)` in the graph memo (top 15 rivals).
- **Spread / physics** (in the `forceSimulation` chain):
  - `velocityDecay(enlarged?.62:.58)` — damping (raised for relaxed, non-bouncy motion).
  - link `.distance`: focal-incident = `(enlarged?126:47)+(1-ratio)*(enlarged?414:104)` → **big nodes sit closer to focal, small ones further**; rival-rival = `enlarged?270:91`. `.strength`: focal-edge `enlarged?.5:.45`, rival-rival `.04`.
  - `charge` = `enlarged?-270:-60`, `distanceMax enlarged?1100:390`.
  - `collide` = `rad(d)+(enlarged?10:7)`, strength `.6`.
  - `forceX/forceY` center strength `enlarged?.04:.05`.
  - **`bounds` custom force** — soft walls: any non-pinned node outside `[m, w-m]` gets nudged back (`a*0.6`). This brings dragged-off nodes back into frame; `endDrag` also does `sim.alpha(.55).restart()`.
  - Initial **scatter**: rivals seeded radially by size with random jitter (bigger nearer) so layout looks organic.
- **Labels**: enlarged = label **all** nodes, drawn in **screen space** (constant size, do NOT scale with zoom). Mini = label **only the hovered node** (no resting labels). See `labelFor` + the screen-space label pass in `draw`.
- **Interactions**:
  - Mini: drag nodes; **click a node → opens popup** (`onOpen`); empty space does nothing; no pan.
  - Enlarged: drag nodes; click node → select (sidebar); **click empty → deselect**; scroll = zoom (labels don't grow); drag background = pan; double-click node → profile. Edges/connectors are non-interactive.
- **Sidebar** (enlarged, 30%): athlete name as a plain **title** (same size as popup title, flag **after** the name, clickable → profile, no button chrome). Below: shared competitions **grouped by country** (sticky country pills, blur lives **inside** the pill not across the row), each competition row **clickable → results page**.

## Other changes this session (outside the web)
- **Globe popup country pills**: blur moved inside the pill (no full-row banner). Deselect button moved **left of the Globe/Web tabs**, works for both tabs.
- **Profile**: "Footprint" renamed to **"Globe"** (toggle + popup tab + title). Web toggle uses the spider `WebIcon`. **Calendar** + **Instagram** buttons restyled to the translucent unselected pill (match Globe/Web; dropped `portal-pill` to kill the blue tint). Calendar nudged down (`marginTop:14`) to line up with "Athlete overview" — **approximate, may need a px nudge**. Mini-globe caption **"Competition footprint"** now sits **below** the globe (`marginTop:10`); mini-web caption is **"Top 15 Rivals"**.
- **Home portal thumbnails**: class nuggets now **fan into an overlapping single-row stack** when >3 (see Latest push above). (Superseded the earlier `flex:1 1 0` second-row wrap approach.)
- **Menu pill open animation**: **seamless, no bounce** — constant `border-radius:25px`, only the body elongates (see Latest push above). (Superseded the earlier top-ease/bottom-spring approach.)

## Validation gates (before push)
- **JSX/TDZ**: esbuild syntax check. Sandbox is Linux, so install esbuild in `/tmp` (`cd /tmp && npm i esbuild`) and run with externals `react,react-dom,lucide-react,recharts,d3-force`. On Casey's Mac use `pnpm --filter @athlink/web build`. **TDZ is the #1 white-screen vector** — manually review any new hook/useEffect for use-before-declare.
- Parser untouched this work; if `api/*.py` changes, run `python3 -c "import ast..."` + `python3 tools/test_parser.py --diff`.
- ⚠️ `tools/pre_push_test.sh` (Stop-hook gate) still matches `^src/`, NOT the monorepo `sports/*/src/`, so it **silently no-ops on these frontend changes**. Fix it to match `sports/*/src/` when convenient.

## Dev loop & environment quirks
- Always `cd ~/Desktop/AthLink2.0` first. Run `pnpm dev` (often lands on http://localhost:5174). HMR picks up edits — just refresh.
- Sandbox can't auth git/push or run pnpm; Casey runs/validates/pushes. `d3-force` is installed (`pnpm --filter @athlink/sport-sailing add d3-force`).

## Push workflow ("push" trigger)
Casey says **"push"** → run the pre-push gate, then on PASS Casey commits + pushes from his terminal; Vercel preview builds; once green + CI passes, merge the PR to `main` in the browser → athlink.win. Never push without Casey's go-ahead.

## Open follow-ups / things to eyeball
- **+80% enlarged spread** is aggressive — nodes may pack toward the frame edges (soft walls hold them). Dial `charge` / link `distance` / center strength if Casey wants it tighter.
- **Calendar vertical alignment** (`marginTop:14`) is approximate — confirm against "Athlete overview".
- Smallest rival nodes have a visibility **floor** (so 2%-of-top nodes don't vanish) — Casey may want them to shrink fully instead.
- Possible refactor: extract `AthleteWeb` to its own module when the monorepo design-system extraction happens.
- Fix `tools/pre_push_test.sh` path glob (see Validation gates).

## Key references
`CLAUDE.md` (tokens, parser rules, gotchas) · `migrations/README.md` · `MONOREPO_SETUP.md` / `MONOREPO_STATUS.md` (historical).
