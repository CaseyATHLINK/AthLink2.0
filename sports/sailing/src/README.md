# `sports/sailing/src/` — module map & change rules

_Last updated: 9 July 2026 (reorg step 4 complete)._

The sailing app used to be one ~13k-line `App.jsx`. It is now decomposed into
`util/` + `data/` + `views/` (mirroring `sports/golf/src/`), plus shared feature
packages under `packages/`. `App.jsx` (~6.8k lines) is now **imports + a few
module-scope helpers + the stateful `AthLinkMVP` shell** (`export default`, starts
~line 656). Everything above `AthLinkMVP` that was a standalone module-level
component or pure helper has been extracted.

## Where things live

| Layer | File | Holds |
|---|---|---|
| **util/** (pure, no app state) | `date.js` | `MON`, `formatDate`, `dateKey`, `monthsBetween` |
| | `name.js` | `canonName`, `eventKey`, `ordinalOf`, `initials`, `pascalSlug`, `avatarColor` |
| | `flag.js` | `IOC_ISO`, `isoFlag`, `iocFlag` |
| | `class.js` | boat-class registry (`CLASSES`, `CLASS_COLOR`, `CUSTOM_CLASSES`…), `SUBCLASSES`, `nuggetFor`, `classLabel`/`classColor`/`classColorA`, `classFromFleetName` |
| | `gender.js` | division/gender parsing (`parseDiv`, `normGender`, `genderCatOf`, `DIV_COLOR`…) |
| **data/** (Supabase access + registries) | `hosts.js` | host registries + REST (`ASSOCIATIONS`/`CLUBS`/`FEDERATIONS`, `hostById`, `assocName`, `hostRest`, invites/audit, logo upload, custom-class fetch, **host-research mocks** `MOCK_RESEARCH`/`mockResearch*`) |
| | `profiles.js` | athlete/dev profile + claims REST (`fetchAllProfiles`, `upsertAthleteProfile`, `uploadAthletePhoto`…) |
| | `athletes.js` | athlete-derived registries: `ATHLETE_ATTRS` (+`buildAthleteAttrs`) and the **username registry** (`ATHLETE_USERNAMES`, `applyAthleteUsernames`, `usernameForName`, `nameForUsername`) |
| | `scoring.js` | net/discard engine (`scoreEvent`, `scorePreview`, `isCode`) + `aggregate` (career history) |
| **views/** (presentational; `../util`, `../data`, sibling views only) | `atoms.jsx` | leaf components (`CountryTag`, `ConfirmModal`, `VerifyBadge`, `ErrorBoundary`, `WebIcon`, `LiquidBackground`…) |
| | `forms.jsx` | inputs/pickers (`NatInput`, `DateField`, `CustomClassPicker`, `CollabPicker`, `CountrySelect`, `SubclassHover`, `HostPicker`) + `COUNTRIES` |
| | `calendar.jsx` | `CalendarBody` |
| | `globe.jsx` | `WorldSVGMap`, `SailingGlobe`, `FootprintLegend` + country geometry (`GLOBE_COUNTRIES`/`GLOBE_CENT`/`GLOBE_NAMES`) + tier shading |
| | `charts.jsx` | `AthleteWeb` (d3-force), `ProgressChart` (rating curve) + the bound rating engine (`makeRatingEngine` ← `@athlink/rating`) |
| | `models.jsx` | sport-explainer (`SPORT_MODELS`, `SpmDuo`, `HomeShowcaseRotator` + all `spm*` geometry) |
| | `footprint.jsx` | `FootprintModal`, `RegattaFootprintModal` (compose globe + charts + atoms) |
| | `profile.jsx` | athlete/dev modals (`ClaimProfileModal`, `AthleteEditModal`, `MediaModal`, `DevApprovalsModal`, `DevProfilesModal`) |
| | `host.jsx` | host admin modals (`HostMembersModal`, `HostEditModal`, `HostDiscoveryModal`) + `hgRunPool`/`hgCompKey` |
| | `auth.jsx` | sailing binding of `@athlink/auth` — `export const SignInModal = makeSignInModal({…deps})` |
| **packages/** (universal, sport-agnostic) | `@athlink/core` | Supabase/GoTrue primitives (`SB_URL`, `sbGet`, `authHeaders`, `authSignIn`…) |
| | `@athlink/rating` | `makeRatingEngine({scoreEvent,canonName,dateKey,monthsBetween})` (Glicko-lite) |
| | `@athlink/auth` | `makeSignInModal(deps)` + `fetchProfile`/`upsertProfile`/`authGoogleOAuth` |

`App.jsx` re-exports `{ SailingGlobe, AthleteWeb, ProgressChart, aggregate, dbToApp, IOC_ISO }` at the bottom — **consumed by `apps/web/src/Landing.jsx`; keep it.**

## Rules for changing this code

1. **`views/*` must NEVER import from `App.jsx`.** That's a cycle (App.jsx imports
   the views). If a moved component needs a helper that still lives in App.jsx,
   **relocate that helper to `util/` or `data/`** and import it into both the view
   and back into App.jsx. This is how `avatarColor`→util/name, `assocName`→data/hosts,
   the username registry→data/athletes were resolved.
2. **Mutable module-state registries** (`CUSTOM_CLASSES`, `ATHLETE_ATTRS`,
   `ATHLETE_USERNAMES`, host registries) use `export let X` + an internal
   reassigner; readers get the ESM **live binding** (reflects reassignment with no
   call-site change), and callers may mutate the object **in place** (e.g.
   `ATHLETE_USERNAMES.byKey.set(...)`) — you cannot reassign an import, but you can
   mutate what it points to. App.jsx keeps a `useState` mirror only to trigger
   re-renders; reactivity is unchanged.
3. **The build does NOT catch two bug classes.** esbuild/Vite bundles a free
   identifier as a global (→ runtime `ReferenceError`) and imports a non-exported
   name as `undefined` — neither errors at build time. After moving code, run the
   static checkers below, not just the build.

## Verifying a change (do all three)

```bash
# 1. import-resolution + no-undef static analysis (catches the two silent classes)
node tools/check-modules.mjs                 # see that script; uses @babel/parser
# 2. bundle/build
pnpm --filter @athlink/web build
# 3. runtime smoke (dev server) — load the app, open a profile + the footprint modal,
#    check the browser console for errors
```

The extraction recipe that has held for every slice: pull the exact bytes from
`origin/main`, `export`-prefix the defs, import them back, then verify with a
**sorted-nonblank parity diff vs the origin span** (proves byte-identity) **plus the
build plus the static checkers**. A dropped `}` passes the parity diff but fails the
build; a missing import passes the build but fails the static checkers — you need all.
