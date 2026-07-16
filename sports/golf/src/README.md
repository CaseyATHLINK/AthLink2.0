# `sports/golf/src/` — module map & change rules

Golf is a **relabeled clone of the sailing portal**, decomposed into the same
`util/` + `data/` + `views/` + `App.jsx` structure. The canonical module map and
the change rules (the "views never import App.jsx" rule, mutable-registry live
bindings, the two silent bug classes) live in **`sports/sailing/src/README.md`** —
read that first; everything there applies here identically.

## What differs from sailing (the golf relabel)

The relabel is **display-only** — structure, logic, imports, and component names
are byte-identical to sailing. The golf-specific deltas:

- **`util/class.js`** — seed `CLASSES` are golf **divisions** (Men's / Women's /
  Amateur / Senior) with muted navy-palette `CLASS_COLOR`; `SUBCLASSES` is empty
  (sailing used it for ILCA rigs / Optimist fleets / 49er FX); `classFromFleetName`
  infers a division from a field label.
- **`App.jsx`** — `const SPORT_BASE="/golf"` prefixes every route (the flat root
  namespace belongs to the default sport, sailing); `const SINGLE_ATHLETE=true`
  forces the single-competitor path and keeps the helm/crew (pair) UI dormant;
  the home sport-explainer (`HomeShowcaseRotator`, sailing 3D boats) is gated off;
  identity/title strings say "Golf".
- **wording** — fleet→field, boats→players, races→rounds, regatta→competition,
  Sail#→ID, sailor→player across the views + AI prompt strings.

## Still sailing-shaped (deferred to the golf-specific pass)

- **`views/scout.jsx`** metric hints + rubric ("Course management", penalty/DQ
  rate) and **`data/scoutMetrics.js`** are wired for sailing race mechanics; the
  golf semantics (strokes / Stableford, no OCS/UFD) come with the results+parser
  rewrite.
- The **host seed registry** in `data/hosts.js` still lists sailing associations
  (e.g. "Hong Kong 29er Class Association") — placeholder data; golf shares
  sailing's live Supabase DB until golf gets its own `golf_*` tables.
- **`views/models.jsx`** (sport explainer geometry) is dormant — no golf entries
  in `SPORT_MODELS`.

## Verifying a change

`node tools/check-modules.mjs` is currently hardcoded to sailing — validate golf
via `pnpm --filter @athlink/web build` + a dev-server render of `/golf`, a
profile, `/golf/rankings`, and `/golf/scout` (watch the browser console).
Extending the checker to golf is a worthwhile shared-tooling follow-up.
