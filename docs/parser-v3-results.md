# Parser v3 — final corpus scoreboard & change log

_Generated 2026-07-07. Harness: `tools/corpus_test.py` (rule-mode, no network),
run over the full "Results to parse" corpus + the three extracted HKSF email
zips (105 parseable files). Interpreter `/opt/anaconda3/bin/python3`._

## Scoreboard

| bucket | count | route |
|---|---|---|
| **Parsed by RULE** (deterministic, no AI) | **77** | built-in parser |
| Vision-by-design (zero-text scans + WS Results Centre + CJK games book) | 21 | Gemini vision (AI mode) |
| Images (screenshots / photos) | 4 | Gemini vision (AI mode) |
| **Rule-fixable text still deferred to vision** | **3** | Gemini vision (see below) |

Baseline at hand-off (docs/parser-v3-baseline-sweep.txt): **72 OK / 29 ERR**
(10 rule-fixable text errors). Parser v3: **77 rule-parsed**, and the 10
rule-fixable errors are down to **3** (the other 7 became: 5 fixed ERR→OK below,
2 reclassified as vision-by-design — Allianz WS-Results-Centre per §3d, and the
CJK National Games book per §3c "your call, deferrable to vision").

## Fixed this pass (ERR → OK by rule)

1. **`2023 ILCA Asians Overall Results.pdf`** (overall-results) — `try_overall_results`
   now accepts ordinal ranks (`1st`/`2nd`) and the single-hander layout (no crew
   WSID token: name = leading run, then R1..Rn, Total, Net). n=178 across 10
   division fleets. _Known limit:_ penalty codes that wrap to a continuation line
   (`(27.0\nRET)`) drop the wrapped race cell → a few rows read one race short.
2. **`OP Asian Girls top places 2023.pdf`** (ioda-word-notice) — new
   `try_ioda_notice`: prose "First/Second/Third: Name (Country)" podium → a tiny
   3-row placements result. n=3, correct names + nationalities.
3. **`2nd South East Asian Para Sailing (final).pdf`** (excel-print) — Microsoft
   Excel producer + the `Sailor`/trailing-`Points`(=rank)/`After 1 Discard`(=net)
   header quirk now maps. Splits into 4 class fleets (2.4mR, 303 Doubles, 303
   Single, …), each ranked 1..N.
4. **`Results 303 Double _ hansaworlds.org.pdf`** and
   **`Results Liberty Gold _ hansaworlds.org.pdf`** (sailingresults, WordPress-
   embedded) — new `try_sailingresults_clipped`: recovers rank + sail + country +
   helm/crew (names de-wrapped from continuation lines) for the right-margin-
   clipped table. Races that survive the clip are kept; the rest are flagged as
   clipped (§3c). 303 Double n=4; Liberty Gold n=32.

## Correctness findings (grounded in §3)

- **Dup ranks (§3a):** the harness distinguishes a *suspicious* dup (same rank,
  DIFFERENT net → a bug) from a legitimate tie (same rank, same net). After the
  fleet-grouping fix below, **zero suspicious dups** remain across the whole
  corpus. Most old `DUPRANK` flags were multi-fleet artifacts (each fleet is
  correctly 1..N) or genuine ties.
- **Fleet-vs-age-category (§3a):** `parse_row_with_cols` no longer demotes a
  boat-class/fleet label ("303 Doubles", "2.4mR", "Radial") to an age category —
  only true age tokens (U23, Junior) are demoted (`_looks_like_fleet_label`
  guard). This corrected three Sailwave groupings, each validated by the
  dup-rank test (e.g. "OP main" is one clean 1..77 fleet; the old [41,33,3]
  split was spurious).
- **Confidence gate (§3e):** every non-PDF rule result (HTML/xlsx/blw/csv) now
  carries a real parse-quality `confidence` (was `None`) so a good rule parse is
  never re-run through the slow AI path.

## Speed (§4)

- Slowest rule parse now **~3.4s** (the 250-row, 12-page championship PDFs),
  down from the reported **10s** Aarhus. The dominant cost is pdfplumber's
  `extract_text()` on dense multi-page tables (intrinsic); all are far under the
  60s ceiling and most of the corpus parses in <1s.
- AI page parsing is now **concurrent** (bounded to 4 at once) — the old strictly-
  sequential design was forced by Anthropic's rate limit; Gemini's higher limits
  let a 9-page scan drop from ~90s to ~25s. Page results are stored by index so
  order is preserved.

## Deliberately deferred to vision (documented limitations)

- **`Palma 2026.pdf`, `SOF 2023.pdf`** (2-person Sailti/TCPDF) — the crew cell
  stacks two sailors whose glyphs interleave in the flat text
  (`RRiIcEhGaErRd` = "Richard" + "RIEGER"). A word-geometry parser was PROTOTYPED
  (`scratch/sailti_geo.py`): clustering chars by precise `top` (0.1px) *does*
  de-interleave the clean cases — Palma boat 1 → helm "Schultheis, Richard",
  crew "Rieger, Fabian"; SOF is per-sailor lines and reads correctly. BUT for the
  tightly-packed middle boats the vertical name band of 3 adjacent boats overlaps,
  so the surname↔forename pairing contaminates across boats (boat 2 crew read as
  "MACDIARMID, NYYC" — a club as the forename; boat 3 borrowed boat 4's helm). A
  parser that emits WRONG crew names is worse than vision, which reads the 2-D
  layout correctly — so per the spec's caveat these route to vision. Single-hander
  Sailti (U21 ILCA, Optimist Worlds) parses fine by rule. The prototype is a
  documented starting point for a future geometry pass that resolves the
  boat-band assignment (e.g. anchoring each name line to the numeric row it is
  vertically nearest *within the crew x-band only*).
- **`Hebe 2021.pdf`** (clubspot) — pdfplumber's table is garbled and needs a full
  word-geometry rewrite (NET/TOTAL before the race columns; discards in `[…]`;
  an extra hull-number line). Single file; deferred to vision rather than ship a
  fragile geometry path.
- **`OPTI HKRW 2017`** (`.pdf`/`.htm`, flighted Sailwave) — parses, but Gold and
  Silver flights are printed in **two interleaved columns** (ranks read
  1,1,2,2,…), so the two 52-boat flights collapse with colliding ranks. Correct
  splitting needs a two-column geometry parser. Not an ERR; flagged for a
  follow-up.

## How to reproduce

```bash
/opt/anaconda3/bin/python3 tools/corpus_test.py            # scoreboard
/opt/anaconda3/bin/python3 tools/corpus_test.py --update   # (re)seed baseline snapshots
/opt/anaconda3/bin/python3 tools/corpus_test.py --diff     # regression check vs baseline
```

Corpus dir defaults to `$CORPUS_DIR`, else the extracted scratch corpus, else
`~/Desktop/Results to parse` (the Email 7/8/9 zips must be pre-extracted with
non-ASCII filenames sanitised).
