# AthLink Parser v3 — reliability, speed & pluggable AI providers

**For:** the AI-parsing developer (run as a Claude Code / Opus agent session).
**Author of intent:** Casey. This is a spec — read it fully, plan, then build in a loop.
**Branch/worktree:** `parser-v3` (already created at `~/Desktop/AthLink2.0-parser-v3`, based on `origin/main` which has parser v2 **live**). Work only here. Do not push until the acceptance bar below is green; then push straight to `main` (Casey has authorized live pushes for this task — no localhost gate needed, but the corpus harness MUST be green first).

---

## 0. Read first (non-negotiable)

1. `CLAUDE.md` (repo root) — design tokens, locked terminology, TDZ rules, the 60s Vercel ceiling, the parser section.
2. `docs/parser-formats.md` — the 24-family format registry (ground-truth map of every format in the corpus).
3. `docs/parser-v3-baseline-sweep.txt` — the **current** rule-mode result for all 101 corpus files (committed alongside this prompt). This is your starting scoreboard: 72 OK / 29 err, with per-file smells flagged. Your job is to turn the red green.
4. The code you're extending: `api/parse_pdf.py` (~4,800 lines — `detect_format` + `FORMAT_REGISTRY`, all `try_*` extractors, `_gemini_parse`, `_vision_raw`, the xlsx/csv/blw ingestors), `api/llm.py` (the provider router — `route(task)`, `ROUTES`, `call_gemini`/`call_openai_compat`/`call_anthropic`), `api/validate.py` (the confidence gate), `api/enrich.py` (date/country web lookup).
5. The corpus itself: `~/Desktop/Results to parse/` plus the three zipped HKSF emails. Re-extract the zips into scratch (sanitize non-ASCII filenames) before testing — see the sweep script in `docs/` for the pattern.

**Iron rules that override everything below:** the uploaded document is ground truth — never re-rank, re-score, or recompute a placing/points value; preserve printed penalty codes (DSQ/BFD/UFD/DNF/STP/OCS/RET…) verbatim. No request may exceed 60s (parser self-timeout 50s). Keys stay server-side. Run `python3 -c "import ast; ast.parse(open('api/parse_pdf.py').read())"` after every Python edit and the esbuild gate after any `App.jsx` edit (pnpm path: `./node_modules/.pnpm/node_modules/.bin/esbuild sports/sailing/src/App.jsx --loader:.jsx=jsx --bundle --external:react --external:react-dom --external:lucide-react --external:recharts --format=esm --outfile=/dev/null`). Use `/opt/anaconda3/bin/python3` — it's the only interpreter here with pdfplumber+openpyxl.

---

## 1. The goal, in one paragraph

Every file a host can drop in must parse — fast and correctly. "Correctly" = rows, ranks, sails, names, per-race scores and codes match what's printed. For all **non-photo** documents (PDF-text, HTML, XLSX/CSV, .blw) the **rule-based** path must be reliable enough that the AI fallback almost never fires — rules are instant and free; the fallback is slow and costs money. Photos and true scans (no text layer) are the only inputs that should reach the vision AI. The AI provider must be **swappable by Casey via env vars** with no code change, and must default to a fast, cheap, non-Anthropic model.

---

## 2. Build method — loop + agents (how Casey wants this run)

Do **not** one-shot this. Build a **whole-corpus regression harness first**, then loop.

### 2a. Harness (build this before touching extractors)
Extend `tools/test_parser.py` (or add `tools/corpus_test.py`) so it runs the parser over **every file in `~/Desktop/Results to parse/` + the extracted zips**, not just `tools/fixtures/`. For each file it must record: detected family, input_type, entry count, per-fleet counts, confidence, wall-time, and **correctness smells**: duplicate ranks *within a single fleet*, missing sail on >50% of rows, blank names, ragged race-column counts within one fleet, and event-name pollution. Emit a diffable JSON snapshot per file so you can prove "no regressions" after each change. Seed the expected values from `docs/parser-v3-baseline-sweep.txt` plus your own hand-verification of the first-3/last row of each file (open the source, read the printed rows, compare). **The snapshot is the contract** — every loop iteration must keep every previously-correct file correct.

### 2b. Fan out sub-agents (parallelize, keep them cheap)
Use sub-agents (the repo has a `parser-fixer` agent type; otherwise `general-purpose` on a cheap model) — **one per format family or per bug cluster**. Route reading/classification to a cheap fast model, code-writing to your strongest, and keep each agent's scope tiny with a structured output. Loop each family: run harness → read the diffs/smells for that family → fix the extractor → re-run → repeat until that family is green and nothing else regressed. Merge one family's fix at a time.

### 2c. Definition of done per file
A file is "done" when: (a) it parses without error in the correct mode (rule for non-photo, vision for photo/scan), (b) entry count matches the document's own last printed rank (per fleet), (c) first-3 and last rows match the print on rank/sail/name/nat/race-count, (d) a penalty-code row is preserved verbatim, (e) rule-mode wall-time < 2s (see §4).

---

## 3. Correctness bugs to fix (grounded in the current sweep)

These are the concrete regressions/gaps in the live parser right now. Investigate each against its source doc; the smell may be a real bug **or** a harness artifact — decide by opening the file.

### 3a. Duplicate ranks inside a single fleet  ← highest priority
Single-class docs are coming back with repeated `pdf_rank` values, which means either fleet-splitting fired when it shouldn't, rows were double-counted, or a tie was mishandled. Confirmed suspects (all should be ONE clean rank sequence, or correctly split into fleets with each fleet 1..N):
- `OPTI HKRW 2023.html` (n=76, 3 dup ranks) — single Optimist Main fleet.
- `2023 asians.pdf` (n=15, 1 dup), `29er Asians 2026.pdf` (n=25, 1 dup), `Sailwave results for 2026 29er Asian Championship` (n=25, 1 dup) — check for a duplicated row vs a genuine tie (ties share a rank legitimately; a *duplicated competitor* does not).
- The multi-class Southside/HKRW/xlsx files show large DUPRANK counts — verify these are correctly returning `multi:true` with separate `fleets[]` (each 1..N), **not** a single flattened `entries[]` with colliding ranks. If they're flattened, that's the bug.
Rule: a genuine tie (two boats, same points, same printed rank) is correct and must be preserved. A repeated rank from a **duplicated row** or a **collapsed multi-fleet** is a bug.

### 3b. Ragged race counts within a fleet
`49er Kiel 2025` (6–10), `Kiel 2022` (8–12), several sailti/manage2sail files: rows in the same fleet report different numbers of races. Some of this is legit (a boat scored only in qualifying, medal-race-only rows), but verify no race *cells* are being dropped by column-misalignment. The fix is usually in the per-row race-cell bucketing (word-geometry x-centres) — make every row in a fleet resolve to the same race-column count, padding genuinely-empty cells rather than shifting.

### 3c. Text formats that still error (rule gaps — make these parse without AI)
- **`Palma 2026.pdf`, `SOF 2023.pdf`** (sailti TCPDF): fail because the 2nd sailor's line overprints at the glyph level ("RRiIcEhGaErRd"). `try_sailti` exists but bails. Fix with word-geometry crew recovery (dedupe interleaved glyph runs by x-position) so these parse cleanly by rule.
- **`Hebe 2021.pdf`** (clubspot): pdfplumber's table is garbled; `try_clubspot` needs a geometry path (NET/TOTAL sit *before* the race columns; discards in `[…]`; extra hull-number line).
- **`2023 ILCA Asians Overall Results.pdf`** (overall-results): should hit `try_overall_results` but errors — check the heading/signature match.
- **`2nd South East Asian Para Sailing (final).pdf`** (excel-print, Microsoft Excel producer): should route to `try_excel_print` but errors — extend the excel-print detector/shim to this producer + layout.
- **`Results 303 Double` / `Results Liberty Gold` (hansaworlds.org)** (sailingresults browser-print): table lives on pp.2–3 amid WordPress chrome, wide table clipped at the right print margin. Recover what's printed; if columns are physically clipped off the page, parse placings + names and flag the missing races rather than erroring.
- **`OP Asian Girls top places 2023.pdf`** (IODA Word notice): prose "First/Second/Third: Name (Country)" — no score grid. Extract the placements as a tiny 3-row result rather than erroring; this is a legitimate (if sparse) import.
- **CN National Games book** (`第十五届…成绩册`): CJK, compound book. Deferrable to vision, but if a deterministic CJK text parse is cheap, prefer it. Your call — document the decision.

### 3d. Formats correctly deferred to vision (leave as-is unless trivially fixable)
`worldsailing-resultscentre` (no sail numbers → confidence can't clear the gate; already routes to vision) and the 19 true scans. Don't force a flaky rule parser on these.

### 3e. Confidence gate hygiene (`api/validate.py`)
Some rule successes return `confidence: None` (the HTML/xlsx/blw paths skip `score_parse`). In AI mode a `None` confidence can push a perfectly good rule parse into the slow AI path. **Every successful rule parse must get a real confidence score** so a good parse is never re-run through AI. Audit `parse_pdf_bytes`: rule-first, score it, and only fall back when the score genuinely fails — and make sure xlsx/html/blw results are scored too.

---

## 4. Speed — rule-first, and make the fallback rare (why athlink.win felt slow)

The live parser is slow for two reasons: (1) good rule parses sometimes fall through to the multi-round AI path, and (2) the AI path itself is sequential-per-page with pre-count round-trips. Fix both.

1. **Trust the rules.** Once §3e is done, a clean rule parse returns in <1s with no AI at all. That is the single biggest win — most of the corpus should never touch AI.
2. **Kill the slow rule parse.** `Aarhus 29er Worlds` takes **10s** in rule mode (258 rows, 9 pages, double pdfplumber strategies per page). Profile it; cache the pdfplumber page text, avoid re-running both table strategies when the first yields a good table, and short-circuit once the declared entry count is met. Target <2s for every rule parse.
3. **Fewer AI round-trips.** The client currently does `?count=1` then N sequential `?page=N` calls with retries. (a) For small PDFs (≤2 pages) do one whole-file call. (b) The per-page sequential design was forced by *Anthropic's* rate limit — with Gemini (much higher limits) you can parse pages **concurrently** (bounded, e.g. 3–4 at once) and merge, cutting a 9-page scan from ~90s to ~25s. (c) Drop the separate count call where the page count is cheaply known.
4. **Tall-image banding** (already added: `_image_band_boxes`/`_extract_image_band`, served like PDF pages via `?count=1`/`?page=N`) must also parse its bands concurrently within the provider rate limit. Verify a 157-row screenshot completes under the ceiling.
5. **Cold starts.** Keep imports light (no heavy module-level imports beyond pdfplumber/openpyxl); the vision providers are pure `urllib`, keep them that way.

---

## 5. AI provider routing — Gemini universal primary, Anthropic fallback  ← UPDATED per Casey 2026-07

Casey has provisioned **one paid Gemini key** in Vercel named **`Gemini_API_Key_Universal`** (Production + Preview) and is **deactivating** the old free Gemini keys (`parser` …7qyQ, `flag-reading` …18vw, `athlink2.0` …Etaw). The decision:

- **`Gemini_API_Key_Universal` is the single primary key for EVERY AI task in AthLink** — not just parsing. Search-bar suggestions, smart filters, athlete overviews, hover blurbs, flag/nationality reads, photo/scan vision parsing, and date/country enrichment all run on Gemini with this one key.
- **Anthropic is the universal fallback** (fires only when Gemini errors/rate-limits). **Do NOT use Haiku anymore** — use `claude-sonnet-5` (Sonnet 5) as the fallback model across the board: it handles both text and vision, balances cost vs quality, and rarely fires. (Reserve `claude-opus-4-8` only if a Sonnet vision fallback measurably underperforms on the hardest scans.)
- Kimi / DeepSeek / Cerebras are **retired from the default routes** (Cerebras was already unreliable — it 403s). Keep the `openai`-compatible caller in `llm.py` so a provider can be re-added via env, but no task should route to them by default.

### 5a. Key resolution (do this centrally in `llm.py`)
Add one helper: `_gemini_key()` returns `os.environ.get("Gemini_API_Key_Universal") or os.environ.get("GEMINI_API_KEY", "")` — the exact mixed-case name Vercel shows, with the legacy `GEMINI_API_KEY` as a fallback so local dev (`.env.local` still has the old value) keeps working. **Every** Gemini call in `api/parse_pdf.py`, `api/llm.py`, `api/enrich.py`, `api/ai_filter.py` must resolve its key through this helper — grep for `GEMINI_API_KEY` and `Gemini_API_Key_Universal` and make sure there is exactly one resolution path. Do the same for the model ids so they're env-overridable.

### 5b. Per-task model map (rewrite `llm.py`'s `ROUTES`; all provider `gemini`, key via `_gemini_key()`)
| task | used by | Gemini model (default, env-overridable) | why |
|---|---|---|---|
| `filter` | **search-bar suggestions** (`/api/ai_filter`, `App.jsx` `fetchEvSuggestions`/`fetchProfileSuggestions`) | **`gemini-3.1-flash-lite`** | **latency — see §5c** |
| `overview` | athlete overview blurbs | `gemini-3.1-flash-lite` (or `flash` if quality needs it) | short text, cheap |
| `hover` | hover summaries | `gemini-3.1-flash-lite` | short text, cheap |
| `nat` | flag/nationality reads (vision, small) | `gemini-3-flash` / `gemini-3.5-flash` | small vision |
| `vision` | photo/scan results parsing | `gemini-3-flash` / `gemini-3.5-flash` | main OCR model |
| `enrich` | date/country web lookup | `gemini-3-flash` + Google Search grounding | see enrichment note |
| fallback (all) | on any Gemini error | **`claude-sonnet-5`** via `ANTHROPIC_API_KEY` | non-Haiku, text+vision |

Env overrides so Casey can retune without a deploy: `VISION_MODEL`, `NAT_MODEL`, `FILTER_MODEL`, `ENRICH_MODEL`, and `ANTHROPIC_FALLBACK_MODEL` (default `claude-sonnet-5`). Optionally keep `VISION_PROVIDER`/`VISION_CJK_PROVIDER` hooks (Qwen3-VL for CJK, GPT-5-mini) as future swap points, but the shipped default is Gemini-primary / Sonnet-fallback everywhere.

### 5c. Fast search suggestions (Casey: "suggestions need to appear faster") ← benchmarked
The search bars call `/api/ai_filter` with `task:"filter"` (currently → Kimi, ~1.7s). Measured on a real suggestion prompt (3-run median): **`gemini-3.1-flash-lite` 0.92s**, kimi-k2.5 1.72s, gemini-2.5-flash-lite 1.97s, gemini-2.5-flash 2.19s, Cerebras 403. **Route `filter` to `gemini-3.1-flash-lite`.** Also cut perceived latency further: keep the ~200 `max_tokens` cap, ensure the debounce isn't too long (≤250ms), cancel in-flight requests when the query changes (AbortController), and cache completed suggestions per query prefix so backspacing is instant. Target first-suggestion under ~1s.

### 5d. Implementation notes
Each provider stays behind the existing pure-urllib `call_*` idiom (no SDKs). Gemini keeps the native `inline_data` path (only one that ingests PDF bytes directly). Keep the JSON contract out of `_vision_raw` provider-agnostic so `_gemini_parse`'s normalization doesn't care who answered. A missing/instructed-off provider cleanly falls to Anthropic Sonnet. **Enrichment:** switch `api/enrich.py` off Anthropic web-search onto **Gemini + Google Search grounding** (`google_search` tool), same "low-confidence, never auto-applied" contract; Sonnet-with-web-search only as fallback. Document the full env matrix (`Gemini_API_Key_Universal`, `ANTHROPIC_API_KEY`, the model overrides) in `CLAUDE.md` and `docs/parser-formats.md`, and note the retired keys.

---

## 6. Drop zone — accept ANY format

In `sports/sailing/src/App.jsx` the import drop zone / file input must accept anything and decide server-side, never reject by extension:
- Set the file input `accept` broadly (or drop it) and let the drop handler take **all** files.
- Server-side MIME sniffing (`_detect_mime`) already covers PDF/PNG/JPEG/WEBP/HEIC/HTML/XLSX/XLS/CSV/BLW — make an unknown/unsniffable type produce a **clear, actionable message** ("Couldn't read <name> — try exporting as PDF/Excel/HTML"), never a crash or silent drop.
- HEIC (iPhone photos) must actually decode — verify Pillow/pillow-heif handles it or convert; if not decodable, say so.
- Multi-file drops of mixed types must each route to their own parser independently (one bad file never fails the batch).

---

## 7. Acceptance bar (must all be true before pushing to `main`)

1. `ast.parse` clean on every edited `.py`; esbuild clean on `App.jsx`.
2. Corpus harness: **every non-photo file parses by rule** (0 rule-fixable errors remaining), and **every photo/scan parses by vision** in ai-mode — no file in the corpus ends with "no results / crash".
3. Zero correctness regressions: the per-file snapshot shows every previously-correct file still correct; the §3 bugs (dup ranks, ragged races) are resolved on the named files.
4. Every rule-mode parse < 2s locally; no AI path can exceed the 60s ceiling (verify the worst multi-page scan and the tallest screenshot).
5. **Provider routing (§5):** every AI call resolves its key through `_gemini_key()` (`Gemini_API_Key_Universal` → legacy `GEMINI_API_KEY`); every task defaults to a Gemini model per the §5b map; Anthropic **Sonnet 5** (never Haiku) is the only fallback and fires only on Gemini error. Grep confirms no default route to Kimi/DeepSeek/Cerebras and no `claude-haiku` default anywhere.
6. **Search suggestions:** `filter` task runs on `gemini-3.1-flash-lite`; first suggestion returns in ≲1s; in-flight requests are cancelled on new keystrokes and prefixes are cached.
7. Docs updated: `CLAUDE.md` parser section + full env matrix (incl. `Gemini_API_Key_Universal` and the retired keys), `docs/parser-formats.md` status, and a short `docs/parser-v3-results.md` with the final corpus scoreboard.
Then push to `main` (Vercel deploys it live).
