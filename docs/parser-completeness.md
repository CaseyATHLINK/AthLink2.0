# Parser completeness gate + hardening (rebuild §6A)

_Branch: `parser-rebuild`. Status: built, wired, tested, several genuine bugs
fixed — NOT yet pushed. Awaiting a preview deploy to verify the AI-repair tail._

## Why

The v3 parser already has content-keyed format detection + dedicated per-format
parsers (see `docs/parser-formats.md`). What it lacked was a **hard completeness
check**. `api/validate.py::score_parse` is a *soft* 0..1 confidence; it docks
points for missing data but still **passes** parses missing rows / race columns /
cells — the silent-incompleteness failure the rebuild targets. For a DB that must
be exact, "parsed but missing 5 sail numbers and race 7" is a FAILURE, not a pass.

## What was added

- **`api/completeness.py`** — deterministic, zero-token gate.
  `verify_completeness(result, declared=None)` → `{complete, gaps[], stats,
  summary}`. Every gap names the exact fleet / group / rows / race indices so a
  repair re-reads only the gap (§6A targeted). `repair_hint()` compresses gaps
  into an AI-repair instruction.
- **Checksum surfacing** — `parse_pdf.py::_extract_checksums` reads Sailwave's
  free `Entries: N` / `Sailed: N` onto `result["_checksums"]`; the gate uses them
  for row-count and whole-column checks.
- **Wiring (`parse_pdf_bytes`)** — every result now carries `complete` +
  `completeness`. A confident-but-incomplete rule parse **no longer
  short-circuits**: it escalates to a targeted AI repair (Gemini primary →
  Anthropic Sonnet-5 fallback, per CLAUDE.md — **not** Haiku). The AI result is
  re-gated, and `_prefer()` keeps whichever of rule/AI has the fuller result so a
  truncated AI re-read never replaces a richer rule parse.
- **Tests** — `tools/completeness_check.py` prints a per-document PASS/FAIL table
  + overall verdict; `tools/test_parser.py` records `complete`/`completeness`
  per fixture (now part of the baseline contract); `tools/pre_push_test.sh`
  syntax-checks the new module.

## Precision rules (avoid false gaps — learned from the real corpus)

Hard-fail only on **positive evidence**; absence of evidence passes.
- **Race width is checked per homogeneous group, monotonically by rank.** A
  Gold/Silver split legitimately has different race counts per band (widths form
  a non-increasing step function of rank). Only a shorter row *above* a longer,
  worse-ranked row is a dropped cell. Stops split-fleet regattas false-failing.
- **A field is "missing" only if its column exists** (populated on ≥60 % of the
  group). NOC-only reports have no sail column; race-by-race club sheets have no
  net column.
- **Rank contiguity checked only when ranks are 1-based** (flights/sub-divisions
  carry global offset ranks).

## Bugs fixed on this branch (deterministic, verified, non-regressive)

1. **Anthropic fallback lane was fully broken in production** — `claude-sonnet-5`
   now 400s on `temperature` ("`temperature` is deprecated for this model"), but
   all three Anthropic payloads sent `"temperature": 0`. So any time Gemini
   hiccuped, the *entire* Sonnet-5 fallback — CLAUDE.md's mandated safety net —
   returned a 400 and silently degraded to the incomplete rule result. Removed
   `temperature` from all three sites (`_anthropic_vision_raw`, the nat read, the
   agent loop). Verified the Anthropic vision call now succeeds. **This was a live
   go-live blocker independent of the completeness work.**
2. **OPTI HKRW 2017 (.pdf + .htm) — two fleets collapsed** (`dup_rank`, 52 dupes).
   Gold/Silver *Flight* tables merged into one 104-row list. PDF: `_sailwave_fleet_map`
   now keys off the real parsed sail numbers instead of a NAT-relative regex that
   grabbed the "Opti Age" column. HTML: the fleet-section regex now matches
   "Flight" as well as "Fleet". Both now split correctly → PASS.
3. **Hansa Worlds (`sailingresults`) — 21 of 32 rows silently dropped.**
   `_leading_name_pair` required an ALL-CAPS surname; this print uses Titlecase
   surnames, so rows without one returned no name and were discarded. Added a
   Titlecase-name fallback (fires only when the all-caps path finds nothing, so
   clean files and the passing Hansa fixture are untouched). 5 → 26 rows
   recovered; 6 wrapped-final-race rows remain (see backlog).

4. **Completeness gate false-positive on the manage2sail Gold/Silver finals
   split** — found by running real 49er.org championship results (see below).
   The gate compared race-column counts across a fleet and flagged any row with
   fewer races than a worse-ranked one. But Gold and Silver sail INDEPENDENT
   final series, so a Silver boat legitimately sails more finals than a
   better-ranked Gold boat (verified: on the 2025 Euros, ranks 11–25 sailed 12
   races, ranks 26+ sailed 13, and every row's `sum(races) == printed Total`).
   The gate now checks the authoritative **per-row Total checksum**
   (`sum(races) == Total`, with a max-width exemption for medal-race boats whose
   medal score is weighted 200 %) instead of comparing counts across rows, and
   only falls back to the count model when a format has no Total column. The
   parser now captures `pdf_total`. This flipped 49er Euros, Kiel 2022, and every
   49er.org championship from false-FAIL to correct PASS, with no false negatives
   (genuine drops — sailti overalls, 2019 Southside — still FAIL).

## Corpus scoreboard (rule lane, deterministic — no AI)

`/opt/anaconda3/bin/python3 tools/completeness_check.py`

- **47 / 57 text-parseable files complete (82 %)**, up from 43; 11 correctly
  deferred to the AI/vision lane. (The old soft gate reported "58 OK".)
- **No regressions**: `tools/test_parser.py --diff` (only the OPTI HKRW fixture
  changed — an improvement, re-baselined) and `tools/corpus_test.py --diff` clean.

## Remaining 12 — the AI-vision tail (evidence-backed, not a cop-out)

These need visual/geometry reading the rule lane can't do deterministically
without cross-cutting risk. The completeness gate reliably flags them and the AI
lane re-reads them at runtime. Root causes (verified by inspection / geometry):

| files | family | why it's AI-lane |
|---|---|---|
| 49er Euros, Kiel 2022, JWC2023 | manage2sail | Medal-race / finals-split: boats sail different race subsets; MR & F7 sit ambiguously against the summary columns. **Clean word-geometry reproduces the same ragged widths as the table parser** — it's the true data shape, not a fixable misalignment. Needs a positional-vector model or vision. |
| 2025 Opti Worlds, 2024 Opti Asian, 2026 Opti Worlds, 2025 ILCA Asian&Open | sailti | Penalty-coded scores wrap: code on the line *above* the row, value *below*. Correct **column order** for the wrapped cell needs word-geometry (flat text is order-ambiguous). |
| 2023 ILCA Asians Overall | overall-results | Text-flow format with no header column anchor; discard tokens dropped by `extract_text` shorten rows. |
| events.pya | pya-events | Fixed-column table where `-` (did-not-sail) cells are dropped by the generic race loop. Fix has a data-model implication (placeholder values) — deferred. |
| 2019 Southside, 29er Worlds 2025, Hansa (6 rows) | sailwave / sailingresults | Old club layout mis-parse; early-stage 2-race result; wrapped final race. Low volume. |

## Real-world validation: 49er.org 2025+ championships

`tools/fetch_49er_results.py <event-slug> …` fetches a 49er.org event page (a
browser User-Agent gets HTTP 200; a bare fetch 403s), extracts the "49er
results" table from the server-rendered `#result-49` panel, and runs it through
the rule parser + completeness gate. Key findings:

- 49er.org embeds full manage2sail results as static HTML **only for the
  curated major championships**; other 2025+ events (Palma, Hyères, Gdynia,
  South American, the FX-only Open Series, canceled events) have an empty
  results panel — nothing to parse on 49er.org (results hosted externally).
- **All 7 embedded 2025+ 49er championships parse COMPLETELY** (100 %):
  2026 Kiel Week, 2026 Worlds, 2025 Worlds, 2025 Euros, 2025 Junior Euros,
  2025 Junior Worlds, 2025 Kiel Week.
- Crucial lesson: the manage2sail **HTML** table parses cleanly where the same
  data's **PDF export** did not — the PDF failures were a pdfplumber
  grid-alignment artifact, not the format. Prefer the HTML/`.blw` source.
- This exercise is what surfaced the Total-checksum gate fix (#4 above): two of
  the seven initially false-FAILed on the Gold/Silver split before the fix.

## Go-live status & the one open verification

The system is **go-live-*safe*** in the sense that nothing ships silently
incomplete: every result carries an honest `complete` flag, clean formats parse
fast, and the hard tail escalates to AI. Two caveats before a production merge:

1. **The AI-repair tail can only be verified in a preview deploy.** Locally the
   Gemini key is a retired free key (401); production's paid
   `Gemini_API_Key_Universal` is the real primary and isn't exercisable here
   (consistent with CLAUDE.md: "parser changes are NOT testable locally"). The
   Anthropic fallback is now confirmed working locally.
2. **Large hard-tail tables approach the 60s ceiling.** A whole-file Anthropic
   read of 49er Euros (54 rows) took ~49s; Kiel 2022 (127 rows) would exceed it.
   In the real client flow these arrive page-chunked (`?page=N`), and Gemini is
   faster than the Anthropic fallback used in the local test — but this should be
   confirmed on preview.

**Recommended next step:** push `parser-rebuild` to its Vercel **preview** (not
production), then re-run the failing corpus files through the live preview parser
to confirm the AI lane returns them complete within the ceiling. Only then merge
to production.

## Model / token strategy (correction to the brief)

The brief's §8 named Haiku for the fallback lane. CLAUDE.md is authoritative:
**Gemini primary for every AI task; Anthropic Sonnet-5 the single fallback; no
Haiku.** The wiring follows CLAUDE.md. Rule parsers stay zero-token; a complete
rule parse never calls a model.
