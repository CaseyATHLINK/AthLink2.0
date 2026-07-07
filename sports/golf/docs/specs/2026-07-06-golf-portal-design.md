# Golf Portal — Design Spec

_Date: 2026-07-06 · Branch: `golf-portal` · Owner: Ben (`/sports/golf`)_

## Goal

Build the AthLink Golf portal — a homepage (competitions list) and results UI
(stroke-play leaderboard) — visually identical to sailing, using only the shared
design system and core packages. Ben owns `/sports/golf`; this build touches
nothing else. Parser/ingestion is out of scope (handled separately by Ben).

## Scope (this build)

- **Competitions list** homepage: grid of competition cards → open a leaderboard.
- **Leaderboard**: stroke-play results table (Pos · Athlete · Club · Country ·
  R1…Rn · Total · To Par).
- **Athletes list** + **basic athlete profile** (competition history).
- Full navigation loop: competition ↔ leaderboard ↔ athlete profile.
- **Mock data in the real shape** — no live Supabase yet (`.env.local` absent,
  `sbConfigured` is false). Selectors are the single seam to swap in `sbGet`.

### Out of scope / deferred (YAGNI)

URL deep-links (sailing's `history.pushState`/`locationchange`), divisions/flights
(Men/Women, age groups), live `sbGet` wiring, athlete media/photos, auth-gated
editing. Divisions and URL routing are the most likely next steps.

## Constraints (non-negotiable, from BEN_GOLF_CLAUDE_BRIEFING.md + CLAUDE.md)

- Build **only** in `/sports/golf`. Never edit `/packages`, `/apps/web`, or other sports.
- Import all UI from `@athlink/design-system`; data/auth from `@athlink/core`. Do
  not rebuild a button, table, Supabase call, or auth flow.
- **No hardcoded colors or `font-family`** — design tokens / existing classes only.
  This build needs **zero custom CSS**: every class required already exists in
  `tokens.css`.
- Terminology: **"Athletes"** (not golfers/players), **"Competition"** (not
  tournament), **separate first + last name** fields, **no back buttons in the top bar**.
- **Results are ground truth** — display what's uploaded; never re-rank or recompute
  (To Par and round columns are displayed from stored fields, not derived).
- The shell wraps every sport `Portal` in `<ThemeRoot>` + `<Suspense>`
  (`apps/web/src/Shell.jsx`), so golf's `Portal` must **not** re-wrap in `ThemeRoot`.

## Architecture — Approach A (modular views + local-state nav)

All files under `sports/golf/src/`:

```
sports/golf/
  manifest.jsx              exists — defineSport({ id:"golf", name:"Golf", Portal, accentToken:"--accent", icon:Trophy })
  src/
    Portal.jsx              orchestrator: nav state + PageHeader + Seg + view switch
    data/
      shape.js              JSDoc typedefs — the data contract
      mock.js               mock data in that shape + selector fns (the sbGet seam)
    views/
      CompetitionsList.jsx  grid of hoverable Cards → open leaderboard
      Leaderboard.jsx       ResultsTable (stroke-play columns) + breadcrumb
      AthletesList.jsx      list → open profile
      AthleteProfile.jsx    profile panel + competition history + breadcrumb
    util/
      score.js             formatToPar (E / -3 / +5), buildRoundColumns(rows)
```

Each view is a focused, independently reviewable unit — keeps files small (lower
TDZ risk, the #1 white-screen vector) and easy to hold in context.

## Data shape (the "real shape")

```js
/** @typedef {Object} Competition
 *  @property {string} id
 *  @property {string} name
 *  @property {string} date        ISO yyyy-mm-dd
 *  @property {string} venue
 *  @property {number} rounds      number of rounds played
 *  @property {number} athleteCount
 */

/** @typedef {Object} Result   // one leaderboard row
 *  @property {string} id
 *  @property {string} competitionId
 *  @property {number} position
 *  @property {string} athleteId
 *  @property {string} firstName
 *  @property {string} lastName
 *  @property {string} club
 *  @property {string} country     ISO-ish code, e.g. "HKG"
 *  @property {number[]} roundScores  e.g. [71,69,72]
 *  @property {number} total
 *  @property {number} toPar        stored, displayed as-is (E / -3 / +5)
 */

/** @typedef {Object} Athlete
 *  @property {string} id
 *  @property {string} firstName
 *  @property {string} lastName
 *  @property {string} club
 *  @property {string} country
 *  @property {{competitionId:string, position:number, total:number, toPar:number}[]} history
 */
```

`mock.js` exposes selector functions — the ONLY place that changes when live data
lands: `getCompetitions()`, `getCompetition(id)`, `getResults(competitionId)`,
`getAthletes()`, `getAthlete(id)`. Each currently returns mock data; later each
becomes an `sbGet(...)` call (async — views already treat them as the data source).

## Navigation & data flow

`Portal.jsx` holds `const [nav, setNav] = useState({ view: "competitions" })` where
`view ∈ {"competitions","athletes","leaderboard","profile"}` plus optional
`competitionId` / `athleteId`.

- **Top bar** (all views): `PageHeader title="Golf"` + `Seg [Results | Athletes]`.
  The Seg is visible on every view and reflects the active section: on
  `competitions`/`leaderboard` the "Results" pill is active; on
  `athletes`/`profile` the "Athletes" pill is active. Clicking a Seg pill always
  navigates to that section's **list** view (resets any selected id).
- **Detail views** (leaderboard, profile): additionally show an in-content
  **breadcrumb link** ("← Competitions" / "← Athletes") that returns to the list.
  This is in the body, NOT a top-bar back button — honors the no-top-bar-back rule.
- Flows:
  - CompetitionsList → click card → `leaderboard(competitionId)`
  - Leaderboard → click athlete `.namelink` → `profile(athleteId)`
  - AthletesList → click athlete → `profile(athleteId)`
  - AthleteProfile history row → click competition → `leaderboard(competitionId)`

## Leaderboard columns (ground-truth display)

Built for `ResultsTable` (`columns=[{key,label,align?,render?}]`, `rows` with `id`):

| Column | Class / render |
|--------|----------------|
| `#` (position) | `.rk` + `.p1/.p2/.p3` for top 3 (gold/silver/bronze) |
| Athlete | left, `.namelink`, `"{firstName} {lastName}"`, onClick → profile |
| Club | left |
| Country | `Chip` (the `.cls` badge is reserved for boat classes in sailing; golf uses `Chip` for country) |
| R1…Rn | one column per round, built from `roundScores` length via `buildRoundColumns` — displayed, never computed |
| Total | `<b>` |
| To Par | `formatToPar(toPar)` → "E" / "-3" / "+5" — from stored field, not derived |

## Validation gate (before any push — Ben pushes)

- esbuild syntax check on every new/changed `.jsx`
  (`node_modules/.pnpm/@esbuild+darwin-arm64@0.21.5/node_modules/@esbuild/darwin-arm64/bin/esbuild`,
  `--loader:.jsx=jsx --bundle --external:react ... --format=esm --outdir=/tmp/...`).
- Manual TDZ review (const/let-before-declaration, useEffect ordering).
- Visual confirm at http://localhost:5173 → Golf card → portal renders, nav loop works.
- No Python touched, so no `ast.parse` / parser harness needed.

## Success criteria

1. Golf card on the landing renders the portal with the shared liquid-glass theme.
2. Competitions list shows cards; clicking one opens its leaderboard.
3. Leaderboard shows stroke-play columns with adaptive round columns and medal-colored top 3.
4. Athlete names (leaderboard + list) open a profile with competition history.
5. Breadcrumb navigation returns to lists; no top-bar back button anywhere.
6. Zero raw hex / font-family; only design-system components + existing classes.
7. esbuild passes; no TDZ; visually indistinguishable from sailing's material.
