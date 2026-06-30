# AthLink Design System — how to build with it

B2B sailing-results platform. Apple-platform feel: navy palette, frosted
"liquid-glass" material, SF-system type. Build screens by composing the
components below — don't hand-roll buttons, cards, tables, or pills.

## Wrapping (required)

Every screen MUST be wrapped in `ThemeRoot`. It renders `<div class="al-ds">`,
which is where all design tokens AND every component style live — the component
CSS is scoped `.al-ds .btn`, `.al-ds .card`, etc. **Outside a `ThemeRoot`,
components render completely unstyled.** `ThemeRoot` also paints the app's
light-blue gradient background and sets the base type.

```jsx
const { ThemeRoot, PageHeader, Panel, ResultsTable, Button, Seg, Chip, ClassBadge, Card } = window.AthLinkDS;

<ThemeRoot>
  <div className="wrap">                {/* 1000px max-width centered column */}
    <PageHeader title="Hong Kong Optimist Championship"
                sub="29 boats · RHKYC · March 2026" />
    <Seg options={[{value:'results',label:'Results'},{value:'athletes',label:'Athletes'}]}
         value={tab} onChange={setTab} />
    <ResultsTable
      columns={[
        { key:'rk', label:'Rank' },
        { key:'name', label:'Athlete', align:'left' },
        { key:'net', label:'Net' },
      ]}
      rows={[{ id:1, rk:1, name:'Chan Ka Lok', net:8 }]} />
  </div>
</ThemeRoot>
```

## Components (full API in each `<Name>.d.ts` / `<Name>.prompt.md`)

- **ThemeRoot** — the surface wrapper. Always the outermost element.
- **Button** — `variant`: `"cta"` (solid blue, primary action) · `"ghost"`
  (frosted, default) · `"sky"` · `"amber"` (caution) · `"green"` (success).
  Supports `disabled`, `onClick`.
- **Card** — frosted content card; `hoverable` adds lift-on-hover (use for
  clickable list items).
- **Panel** — frosted-glass container for tables and grouped sections.
- **Seg** — segmented control. `options:[{value,label}]`, controlled via
  `value` + `onChange`.
- **Chip** — small sky-tinted pill for tags/metadata (label in children).
- **ClassBadge** — navy badge for a boat class (`29er`, `ILCA 6`, `Optimist`,
  `49er`); label in children.
- **PageHeader** — `title` + optional muted `sub`.
- **ResultsTable** — `columns:[{key,label,align?,render?}]` + `rows` (each row
  needs a unique `id`). `align:"left"` left-aligns a column; `render(row)`
  customizes a cell. PDF results are ground truth — never re-rank or recompute.

## Styling idiom

No Tailwind, no utility-class framework. Style your own layout glue with
**inline styles referencing the CSS variables** (all defined on `.al-ds`):

`--navy` #13314e · `--navy2` #1f4e80 · `--accent` #0a84ff · `--sky` · `--paper`
· `--ink` (text) · `--mut` (muted text) · `--line` (hairlines) · `--gold`
· `--link` · `--radius` 16px · material tints `--mat-thin/-reg/-thick/-dark`
· `--halo` (focus ring).

```jsx
<div style={{ color:'var(--mut)', fontSize:13, padding:'var(--radius)' }}>…</div>
```

A few DS layout helpers exist as classes (all under `.al-ds`): `wrap`
(centered 1000px column), `disp` (display heading), `seclabel` (uppercase
section label), `phead` (navy hero panel), `srch` (search field), `av`
(avatar). Prefer the components above for anything they cover.

## Where the truth lives

- `_ds/<folder>/styles.css` → `@import "./_ds_bundle.css"` — the full compiled
  component + token stylesheet. Read it before inventing any style.
- `<Name>.d.ts` — the prop contract. `<Name>.prompt.md` — usage notes.

## Terminology (locked)

"Athletes" not sailors · "Competition" not regatta · separate first/last name
fields · navy palette only, no aggressive highlight colours.
