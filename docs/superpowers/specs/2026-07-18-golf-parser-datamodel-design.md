# Golf parser + data model — design spec

_Date: 2026-07-18 (resolved 2026-07-19) · Status: **PLAN-READY — all 3 open questions resolved (see §7).** · Branch: `golf-parser`_

## 1. Goal

Build the golf **results parser + data model** so real golf data flows into the
platform — the prerequisite for the golf scout/agent stats (see
`2026-07-18-golf-scout-stats-design.md`). Today the golf portal runs on **sailing
placeholder data**; there are no golf scorecards in the database. This project reads
golf results into a golf-shaped model so every downstream stat has true data to
compute from.

**Sequencing:** parser first, then the full stat set — decided so no stat is built
against placeholder data (no throwaway work). This spec is upstream of the stats
spec and must capture what the stats spec requires.

## 2. Relationship to the stats spec — the capture ladder

The stats spec defines a **capture ladder**; this parser is what fills each rung:

- **Tier 0** — finishing position + field size → rank stats (rating, tier rank, top-10, win rate).
- **Tier 1** — + round **scores** & **counts** → scoring average, **cuts-made** (inferred from round count vs cut structure), Sunday/closing, sub-par rounds.
- **Tier 2** — + hole-by-hole scores & a **course par database** → birdie / bogey / eagle rates, par-3/4/5 scoring.

## 3. Locked decisions

### 3.1 Input sources (what the parser ingests)
- **Tournament-software leaderboards** — Golf Genius, BlueGolf, GolfBox, Clubspot (structured HTML and/or PDF, round-by-round columns).
- **Federation / association PDFs** — varied layouts (position + round scores + total).
- **Excel / CSV** — cleanest; rows of players with round columns.
- **NOT photos/scans.** Everything ingested is **text-extractable**, so the golf
  parser **skips the vision-AI path** the sailing parser uses for images. Simpler,
  faster, more reliable.

### 3.2 Scoring formats — all, phased, on a format-agnostic core
**Key insight: finishing position is format-agnostic.** Every format (stroke play,
Stableford, match play) yields a finishing position in a field — and all the
rank-based stats (rating, tier rank, win/top-10 rate, cohort) need *only* position.
Only the stroke-specific stats (scoring average, cuts, sub-par, Sunday) require
stroke play. So we phase by **what data each format can feed**, not by format:

- **Phase 1 — Stroke play (backbone).** Full model: round strokes, counts, cut
  structure, position. Unlocks Tier 0 **and** Tier 1. WAGR spine; ~80–90% of
  championship junior/amateur golf. Build first, completely.
- **Phase 2 — Stableford (cheap add).** Capture position + per-round **points**, tag
  `scoring_format: stableford`. Rank stats light up immediately; stroke stats hide
  for these events. Low marginal cost.
- **Phase 3 — Match play (deferred).** Capture **bracket finishing position**
  (champion→1, runner-up→2, semis→T3…) so the player earns a result + rating
  contribution; tag `scoring_format: match_play`; skip stroke stats. Real work =
  teaching the (already pairwise-Elo) rating engine to map a bracket to a field.

### 3.3 Pipeline reuse
Reuse the sailing parser skeleton — **detect → route → parse → normalise** with a
per-family signature+extractor registry (`FORMAT_REGISTRY` in
`api/sailing/parse_pdf.py`; input handlers: pdfplumber for PDF text, openpyxl for
xlsx/csv, an HTML table harvester). The golf parser adds **golf format families** and
targets the **golf data model**; it **omits the vision path** (§3.1). Likely lives at
`api/golf/parse_pdf.py` mirroring `api/sailing/` (exact layout = implementation
detail).

### 3.4 Data-model principle — format-agnostic core + optional stroke fields
Extend, don't rewrite. The app model already stores `entries[].races[]` (per-round
values) + `rank` (finishing position, read as ground truth, never recomputed).
Golf adds:

- **Core (all formats):** finishing position · field size · per-round value array ·
  `scoring_format` tag.
  - per-round value = **strokes** (medal) · **points** (Stableford) · **derived
    bracket position** (match play).
- **Optional (stroke-play only):** course par · cut structure (rounds, cut-after) ·
  hole-by-hole scores. **Scope note:** this project builds cut structure + a
  document-read `course_par`; **hole-by-hole is deferred** (Tier 2) — see the
  resolved schema in §7.1/§7.2.

This keeps every format flowing into the **same** profile and the **same** rank
stats, with stroke stats lighting up per format — the capture-ladder philosophy
extended across formats. Net: **ingest every event, exclude nothing**; every player
gets a rating + rank stats regardless of format.

## 4. Ground-truth rule (unchanged, load-bearing)
The PDF/sheet is ground truth. The parser records finishing position exactly as
published; the app **never re-ranks or recomputes** a result. Derived stats
(rating, scoring average, cuts) are layered *on top* and never alter the recorded
finish. (Same hard boundary as sailing.)

## 5. Sequencing / dependencies
1. **This (golf parser + data model)** → real golf data in.
2. Then **golf scout/agent stats** (its spec is the requirements target).
3. The golf module decomposition (PR #129) is the structural base both sit on.

## 6. What does NOT change / is reused
- The **rating engine** (`@athlink/rating`) — sport-agnostic, pairwise-Elo, rank-based.
- The sailing parser pipeline **shape** (detect→route→parse→normalise) and its
  non-vision input handlers (pdfplumber / openpyxl / HTML harvester).
- The app's event/entry model — extended (§3.4), not replaced.
- Sailing — untouched.

## 7. RESOLVED DESIGN (was open questions — resolved 2026-07-19)

Grounding: re-read `api/sailing/parse_pdf.py` (pipeline + `FORMAT_REGISTRY` +
`detect_format`) and `sports/sailing/src/data/events.js` (the read/write payloads
that mirror the live `events`/`entries` columns — the Supabase MCP was timing out,
so column facts were taken from those payloads + CLAUDE.md, not a live introspection;
verify against the DB when writing the migration).

**Project scope (decided): stroke-play core only — Tier 0 + Tier 1.** The
course→par database and hole-by-hole capture (Tier 2: birdie/bogey/par-3-4-5) are
**deferred** to when those stats are built. Smallest shippable slice; matches
"parser first, no throwaway work."

### 7.1 Data model / schema — RESOLVED
**Key finding: the `entries` table needs ZERO new columns.** The existing
position + per-round shape already IS golf — a golf *round* maps onto a sailing
*race*:

| Golf concept | Existing `entries` column | Reinterpretation |
|---|---|---|
| Finishing position | `pdf_rank` (int) | ground truth, as-is; ties → same int (published "T4" is a display concern) |
| Total score | `pdf_net` | gross stroke total |
| Per-round scores | `races[]` (jsonb) | each element = that round's gross strokes |
| Per-round status | `race_codes[]` (jsonb) | `"MC"` missed cut · `"WD"` · `"DQ"` · `"DNS"` (parallel to sailing's DNF/BFD codes) |
| Golfer / partner | `helm_name` / `crew_name` | golfer / (unused in singles; foursomes partner later) |

All sport-specific data is **per-event**, added as **flat columns on the shared
`events` table** — consistent with how sailing already stores its own sport-specific
fields (`doublehanded`, `subclass`) flat on that table (chosen over a `golf jsonb`
blob for queryability + pattern-consistency):

```sql
ALTER TABLE events
  ADD COLUMN scoring_format  text,   -- 'stroke' (this project); later 'stableford' | 'match_play'
  ADD COLUMN rounds          int,    -- scheduled/played rounds → cut inference + "Sunday" = last round
  ADD COLUMN cut_after_round int,     -- round the cut fell after; NULL = no cut
  ADD COLUMN course_par       int;    -- par as PRINTED on the document (e.g. 72); NULL if the doc is silent
```
- Existing sailing rows have `scoring_format` NULL → unaffected (treated as sailing).
  Golf events written by this parser stamp `scoring_format='stroke'`.
- `dbToApp`/`saveEventToDb` in a **golf** `data/events.js` thread these four fields
  through (sailing's copy is left untouched).
- Migration `migrations/00NN_golf_stroke_core.sql` (next free number), idempotent,
  followed by `NOTIFY pgrst, 'reload schema';`.

**`course_par` is a single integer read straight off the document — NOT a
course→par subsystem.** Leaderboards almost always print "Par 72" and/or a to-par
column. So sub-par / to-par stats (nominally Tier 1) work whenever the document
states par or to-par, and simply **hide** for events where it's silent — without
building the deferred par database. `to-par` is derived at display time
(`pdf_net − course_par`); the parser stores gross. If a source publishes *only*
to-par, the extractor reconstructs gross when par is known, else stores what's given
(ground-truth rule). **Cuts-made needs no par at all** — inferred from
`races[].length` vs `rounds` / `cut_after_round`.

### 7.2 Course / par database — RESOLVED: DEFERRED
Not built in this project (follows from the scope decision). The only par signal
captured now is the per-event `course_par` integer above (§7.1). A keyed
course→par(+per-hole) store with seeding + course-matching is a **Tier-2
prerequisite**, designed when birdie/bogey/par-N stats are built. Nothing here
blocks adding it later.

### 7.3 Parser format families + detection — RESOLVED
Golf gets its **own** `api/golf/parse_pdf.py` mirroring `api/sailing/` — its own
`FORMAT_REGISTRY`, the same `detect → route → parse → normalise` skeleton, sharing
the generic input handlers (pdfplumber text, openpyxl grid, HTML harvester).
**No vision path** — `detect_format` only ever emits `pdf-text` / `html` / `xlsx` /
`csv`; the sailing image/`pdf-scanned` branches are dropped. Every extractor emits
the **same** entry dicts as sailing (`helm`, `pdf_rank`, `pdf_net`, `races[]`,
`race_codes[]`, plus event-level `scoring_format='stroke'`, `rounds`,
`cut_after_round`, `course_par`) and a `detected_format` diagnostic rides along.

`FORMAT_REGISTRY` (ordered — platform-specific first, generic grid last so it never
pre-empts a known platform):

| Family | Input types | Signature sniffs | Status |
|---|---|---|---|
| `golfgenius` | html, pdf-text | `golfgenius.com` / "Golf Genius" footer; R1..Rn + Total/Thru columns | **signature TBD — pending sample files** |
| `bluegolf` | html, pdf-text | `bluegolf.com` stamp; "Pos / Player / Rd1.. / Total / To Par" header | **signature TBD — pending sample files** |
| `golfbox` | html, pdf-text | `golfbox` markup/URL (Scandinavian federation exports) | **signature TBD — pending sample files** |
| `clubspot-golf` | pdf-text, html | Clubspot stamp **+ golf columns** (own signature; NOT sailing's `try_clubspot`) | **signature TBD — pending sample files** |
| `federation-pdf` | pdf-text | generic golf grid: Pos + Player + numeric round cols + Total; no platform stamp | **build first** |
| `golf-grid-xlsx` | xlsx, csv | openpyxl: header row with Pos/Player/round/Total tokens | **build first** |

`detect_format` walks these in order; first `detect(fb, low, meta)` hit wins at 0.9,
else `unknown`/0.3 — identical to sailing.

**Build order (decided):** Casey has **no sample export files**, so build the two
**format-independent** readers first — `golf-grid-xlsx` and `federation-pdf` — which
need no platform reverse-engineering yet exercise the whole pipeline end-to-end.
The four named platforms stay "signature TBD"; collect a few real exports later and
sign them then (one fixture per family in a golf `tools/fixtures/`, mirroring
sailing's test loop). **Clubspot note:** golf gets a distinct `clubspot-golf`
signature keyed on golf columns rather than a sport-flag branch inside sailing's
shared extractor.

## 8. Decisions log
_Session 1 (2026-07-18):_
- Inputs: tournament-software leaderboards + federation PDFs + Excel/CSV; **no images**.
- Formats: **all**, phased (stroke-play first, Stableford cheap, match play last) on a
  format-agnostic core.
- Reuse sailing pipeline, skip vision.
- Extend the existing position+per-round model rather than rewrite.
- Parser precedes stats.

_Session 2 (2026-07-19) — resolved the 3 open questions:_
- **Scope:** stroke-play core only (Tier 0+1); course-par DB + hole-by-hole deferred.
- **Schema:** `entries` unchanged; 4 flat columns on `events` (`scoring_format`,
  `rounds`, `cut_after_round`, `course_par`); golf `data/events.js` threads them.
- **`course_par`:** a document-read integer, not a subsystem — keeps sub-par/to-par
  in scope without building the deferred par database.
- **Parser:** own `api/golf/parse_pdf.py` + own `FORMAT_REGISTRY`, no vision path.
- **Build order:** `golf-grid-xlsx` + `federation-pdf` first (no samples needed);
  Golf Genius / BlueGolf / GolfBox / Clubspot-golf marked "signature TBD — pending
  samples" (Casey has none yet).
