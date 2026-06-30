# design-sync notes — @athlink/design-system

Package shape (no Storybook). The package ships **raw JSX** from a single
`packages/design-system/src/index.jsx` with **no build step and no `.d.ts`**.

## How this repo is wired (re-sync must reproduce)

- **No dist / no types** → `.d.ts`-based discovery finds 0 components. We pin all
  9 explicitly via `cfg.componentSrcMap` (each → `src/index.jsx`) and hand-write
  the prop contracts via `cfg.dtsPropsFor`. The build entry is the source file:
  `--entry ./packages/design-system/src/index.jsx`.
- **Scratch node_modules** (gitignored, recreate on fresh clone): the package's
  own `node_modules` is sparse (only `react`, `lucide-react`) and has no
  `react-dom`. The converter needs `react-dom` **UMD**, and the repo is on
  **React 18** (React 19 dropped UMD), so we assemble
  `.design-sync/.cache/scratch-nm/` with symlinks into the pnpm store:
  ```sh
  NM=.design-sync/.cache/scratch-nm; rm -rf "$NM"; mkdir -p "$NM/@types"
  ln -s "$PWD/node_modules/.pnpm/react@18.3.1/node_modules/react" "$NM/react"
  ln -s "$PWD/node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom" "$NM/react-dom"
  ln -s "$PWD/node_modules/.pnpm/lucide-react@0.400.0_react@18.3.1/node_modules/lucide-react" "$NM/lucide-react"
  ln -sfn "$PWD/.ds-sync/node_modules/@types/react" "$NM/@types/react"
  ```
  Then pass `--node-modules .design-sync/.cache/scratch-nm`. (Bump the pnpm-store
  version hashes if deps change.)
- Converter deps live in `.ds-sync` (`npm i esbuild ts-morph @types/react react-dom`).
- Playwright/chromium for the render check: cache at
  `~/Library/Caches/ms-playwright`; export `PLAYWRIGHT_BROWSERS_PATH` to it.

## Provider is mandatory

`cfg.provider = { component: "ThemeRoot" }`. Component CSS is scoped under
`.al-ds`, which `ThemeRoot` supplies — without the wrap, every preview renders
unstyled. Don't remove it.

## Known render warns (treat as clean on re-sync)

- `[FONT_REMOTE] "SF Pro Text", "SF Pro Display"` — the DS uses the Apple
  `-apple-system` system-font stack plus a remote Barlow `@import` (Google
  Fonts). SF Pro is served by the OS at runtime; nothing to ship. Expected,
  non-blocking.
- `[DTS_REACT] @types/react not found` — harmless here: the components have no
  TS prop types, so `cfg.dtsPropsFor` supplies the contracts regardless.

## Layout / cosmetic

- Cards/Panels/Seg etc. stretch to the capture viewport height (sole flex child
  on the 100vh `.al-ds` surface), so authored sheets show a tall gradient area
  under small components. This is the authentic app surface — not a defect. The
  content anchors top-left and is correct.
- `ResultsTable` is wide (many columns) → `cfg.overrides.ResultsTable.cardMode:
  "column"` so it renders full card width.

## Re-sync risks

- **`cfg.dtsPropsFor` is hand-maintained.** If `src/index.jsx` changes a prop
  (e.g. Button gains a `variant`, ResultsTable changes column shape), the
  emitted `.d.ts` will silently lag — re-derive `dtsPropsFor` from the source
  signatures when the source changes.
- **New components** must be added to BOTH `cfg.componentSrcMap` and
  `cfg.dtsPropsFor` — synth discovery is bypassed, so a new export won't appear
  automatically.
- **scratch-nm is gitignored** and pins exact pnpm-store paths — recreate it on
  a fresh clone / after a dep bump (versions above will drift).
- If the package ever gains a real build + `.d.ts`, drop `componentSrcMap`/
  `dtsPropsFor` and point `--entry` at the built dist for stronger contracts.
