# Golf parser + data model — design spec

_Date: 2026-07-18 · Status: **DRAFT — foundational decisions captured, paused.** 3 open questions before it's plan-ready (see §7). · Branch: `golf-parser`_

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
  hole-by-hole scores.

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

## 7. OPEN QUESTIONS (resolve on resume, before plan-ready)
1. **Exact data-model / schema** — concrete columns/shape for `scoring_format`,
   per-round values, course par, cut structure, hole-by-hole; how they sit on the
   existing `events`/`entries` tables + any `golf_*` additions.
2. **Course / par database** — do we build a course→par(+ per-hole) store now (needed
   for sub-par & birdie stats), what seeds it, and how a result links to its course.
3. **Parser format families + detection** — the specific signatures/extractors for
   Golf Genius / BlueGolf / GolfBox / Clubspot / federation PDFs / Excel, and how
   `detect_format` routes among them.

## 8. Decisions log (this session)
- Inputs: tournament-software leaderboards + federation PDFs + Excel/CSV; **no images**.
- Formats: **all**, phased (stroke-play first, Stableford cheap, match play last) on a
  format-agnostic core.
- Reuse sailing pipeline, skip vision.
- Extend the existing position+per-round model rather than rewrite.
- Parser precedes stats.
