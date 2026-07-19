# Golf Parser + Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained golf stroke-play results parser (`api/golf/parse_pdf.py`) plus the data-model changes needed to store its output, so real golf results can flow into the shared database.

**Architecture:** A new golf parser mirrors the sailing pipeline *shape* (detect → route → parse → normalise) but is written fresh and lean — no vision path, no handicap/sail-country logic. Its heart is one pure function, `interpret_golf_grid(rows, title_text)`, that turns a Pos/Player/round-scores/Total grid into golf entry dicts plus per-event fields. Two format-independent adapters feed it: an openpyxl/CSV reader (`golf-grid-xlsx`) and a pdfplumber reader (`federation-pdf`). The entries reuse the existing sailing entry shape verbatim (a golf *round* = the sailing `races[]` slot); four new per-event columns on the shared `events` table carry the golf-specific metadata.

**Tech Stack:** Python 3 (pdfplumber, openpyxl — both present in `/opt/anaconda3/bin/python3`), Postgres/Supabase (SQL migration), React data-layer JS (`sports/golf/src/data/events.js`).

## Scope & handoff

**This plan delivers (backend + data model, independently testable):**
1. Migration `0016_golf_stroke_core.sql` — 4 columns on `events`.
2. `sports/golf/src/data/events.js` — thread those 4 fields through read/write.
3. `api/golf/parse_pdf.py` — the parser: `interpret_golf_grid` + `golf-grid-xlsx` + `federation-pdf` + `detect_format` + a minimal HTTP handler.
4. `tools/test_golf_parser.py` + `tools/golf_fixtures/` — a local test harness with synthesized fixtures (Casey has no real sample files yet).
5. `vercel.json` — register the new function.

**Deferred to a FOLLOW-ON plan (do NOT do here):** repointing the golf frontend's
`/api/sailing/parse_pdf` fetches to `/api/golf/parse_pdf`, threading the new event
fields through `sports/golf/src/App.jsx`'s import→save flow, and surfacing rounds in
the import preview. The golf portal keeps working on the sailing parser until then —
nothing here breaks it.

## Global Constraints

_Every task's requirements implicitly include this section. Values copied verbatim from the spec / CLAUDE.md._

- **PDF/sheet is ground truth.** Record finishing position (`pdf_rank`) and totals exactly as published; never re-rank, recompute, or reorder. Derived stats are layered on later, never here.
- **No vision path.** `detect_format` emits only `pdf-text` / `html` / `xlsx` / `csv`. There is no image / `pdf-scanned` branch, no AI fallback in this parser.
- **Sailing is untouched.** Do not edit `api/sailing/parse_pdf.py` or `sports/sailing/**`. The golf parser is self-contained (copy/adapt what it needs; do not import sailing internals).
- **Extend, don't rewrite.** The `entries` table gets **zero** new columns. A golf round reuses `races[]`; `pdf_rank` = position; `pdf_net` = gross total; `race_codes[]` carries per-round status (`"MC"`/`"WD"`/`"DQ"`/`"DNS"`).
- **Scope = stroke play.** Every event this parser emits is tagged `scoring_format: "stroke"`. Stableford / match play are future phases — do not build them.
- **Exact column names:** `scoring_format` (text), `rounds` (int), `cut_after_round` (int, nullable), `course_par` (int, nullable) — all on `events`.
- **Migrations are idempotent** and end with `NOTIFY pgrst, 'reload schema';`.
- **Test interpreter:** run all Python with `/opt/anaconda3/bin/python3` (it has pdfplumber + openpyxl; the default `python3` may not).
- **Entry dict shape (must match sailing exactly):** `{helm, crew, sail, nat, div, gender, category, races[], race_codes[], pdf_rank, pdf_net, birth_year, crew_birth_year}`.

---

## File Structure

- **Create** `migrations/0016_golf_stroke_core.sql` — the 4-column migration.
- **Modify** `sports/golf/src/data/events.js` — `dbToApp`, `saveEventToDb`, `replaceEventResultsInDb` thread the 4 fields.
- **Create** `api/golf/parse_pdf.py` — the whole golf parser (interpreter, adapters, detect_format, registry, HTTP handler). One file, mirroring `api/sailing/parse_pdf.py`'s single-file layout.
- **Create** `tools/test_golf_parser.py` — local harness (imports the parser, runs fixtures, asserts against inline expected values, exits non-zero on mismatch).
- **Create** `tools/golf_fixtures/` — synthesized fixtures: a tiny `.xlsx`, a tiny `.csv`, a tiny federation-style `.pdf`.
- **Modify** `vercel.json` — add the `api/golf/parse_pdf.py` function entry.

---

## Task 1: Migration — 4 golf columns on `events`

**Files:**
- Create: `migrations/0016_golf_stroke_core.sql`

**Interfaces:**
- Produces: columns `events.scoring_format` (text), `events.rounds` (int), `events.cut_after_round` (int), `events.course_par` (int) — consumed by Task 2 and by the parser output.

- [ ] **Step 1: Write the migration**

Create `migrations/0016_golf_stroke_core.sql`:

```sql
-- 0016_golf_stroke_core.sql
-- Golf stroke-play core: per-event scoring metadata on the SHARED events table.
-- The entries table is intentionally UNCHANGED — a golf round reuses entries.races[],
-- pdf_rank = finishing position, pdf_net = gross total, race_codes[] = per-round status.
-- Idempotent: safe to re-run. Sailing rows keep scoring_format NULL and are unaffected.

ALTER TABLE events ADD COLUMN IF NOT EXISTS scoring_format  text;   -- 'stroke' | (future) 'stableford' | 'match_play'
ALTER TABLE events ADD COLUMN IF NOT EXISTS rounds          int;    -- scheduled/played rounds (cut inference + "Sunday" = last round)
ALTER TABLE events ADD COLUMN IF NOT EXISTS cut_after_round int;    -- round the cut fell after; NULL = no cut
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_par      int;    -- par as printed on the document; NULL if silent

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Verify the SQL parses / columns land**

The Supabase MCP was timing out during design — first re-verify the live `events` columns, then apply. Preferred path is via the Supabase MCP `apply_migration` tool (name `golf_stroke_core`). If the MCP is unavailable, hand the file to Casey to run. To verify afterwards, run this query (MCP `execute_sql`):

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='events'
  and column_name in ('scoring_format','rounds','cut_after_round','course_par')
order by column_name;
```

Expected: 4 rows — `course_par|integer`, `cut_after_round|integer`, `rounds|integer`, `scoring_format|text`.

- [ ] **Step 3: Commit**

```bash
git add migrations/0016_golf_stroke_core.sql
git commit -m "feat(golf): migration 0016 — stroke-play event columns"
```

---

## Task 2: Data-layer — thread the 4 fields through golf `events.js`

**Files:**
- Modify: `sports/golf/src/data/events.js` (`dbToApp`, `saveEventToDb`, `replaceEventResultsInDb`)

**Interfaces:**
- Consumes: the `events` columns from Task 1.
- Produces: app event objects that carry `scoring_format`, `rounds`, `cut_after_round`, `course_par`; save payloads that write them. Later tasks (and the follow-on frontend plan) rely on these being present on the app event object.

**Note:** the entry mapping is deliberately NOT changed — entries already carry `races`/`race_codes`/`pdf_rank`/`pdf_net`.

- [ ] **Step 1: Add the fields to `dbToApp`**

In `sports/golf/src/data/events.js`, find the `dbToApp` return object (the `subclass:ev.subclass||null,` line inside the top-level event fields, before `entries:`). Add the four golf fields right after `subclass`:

```js
    subclass:ev.subclass||null,
    scoring_format:ev.scoring_format||null,
    rounds:(ev.rounds??null),
    cut_after_round:(ev.cut_after_round??null),
    course_par:(ev.course_par??null),
```

- [ ] **Step 2: Add the fields to `saveEventToDb`'s payload**

In the same file, find `evPayload` in `saveEventToDb`. Add after its `subclass:ev.subclass||null,` line:

```js
    scoring_format:ev.scoring_format||null,
    rounds:(ev.rounds??null),
    cut_after_round:(ev.cut_after_round??null),
    course_par:(ev.course_par??null),
```

- [ ] **Step 3: Add the fields to `replaceEventResultsInDb`'s patch**

In the same file, find the `sbPatch("events",...)` body inside `replaceEventResultsInDb`. Add after its `subclass:ev.subclass||null,` line:

```js
    scoring_format:ev.scoring_format||null,
    rounds:(ev.rounds??null),
    cut_after_round:(ev.cut_after_round??null),
    course_par:(ev.course_par??null),
```

- [ ] **Step 4: Build to verify no syntax break**

Run: `pnpm --filter @athlink/web build`
Expected: build succeeds (exit 0). (Golf shares the web bundle.)

- [ ] **Step 5: Static safety check**

Run: `node tools/check-modules.mjs`
Expected: no undefined-ref / bad-import errors.

- [ ] **Step 6: Commit**

```bash
git add sports/golf/src/data/events.js
git commit -m "feat(golf): thread stroke-play event fields through data layer"
```

---

## Task 3: Parser scaffold — module, helpers, `detect_format` (no vision)

**Files:**
- Create: `api/golf/parse_pdf.py`

**Interfaces:**
- Produces:
  - `detect_format(file_bytes: bytes, full_text_lower: str) -> tuple[str, str, float]` → `(family, input_type, confidence)`; `input_type ∈ {'pdf-text','html','xlsx','csv'}`.
  - `clean_int(s) -> int | None`, `clean_name(s) -> str`, `parse_round_cell(s) -> tuple[int|None, str|None]` (value, code) — helpers consumed by Task 4.
  - `FORMAT_REGISTRY: list[dict]` (empty placeholder here; filled in Tasks 5–6).

- [ ] **Step 1: Write the failing test**

Create `tools/test_golf_parser.py`:

```python
#!/usr/bin/env python3
"""Local harness for the golf rule parser. Run with /opt/anaconda3/bin/python3.
No network, no AI — pure rule logic. Asserts against inline expected values;
exits non-zero on the first mismatch so it works as a pre-commit gate."""
import os, io, importlib.util, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FIXTURES = os.path.join(HERE, "golf_fixtures")

spec = importlib.util.spec_from_file_location(
    "golf_parse_pdf", os.path.join(REPO, "api", "golf", "parse_pdf.py"))
gp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gp)

_failures = []
def check(name, got, want):
    if got != want:
        _failures.append(f"{name}: got {got!r}, want {want!r}")
    else:
        print(f"  ok  {name}")

def test_detect_format_input_types():
    check("xlsx sniff", gp.detect_format(b'PK\x03\x04rest', '')[1], "xlsx")
    check("pdf sniff",  gp.detect_format(b'%PDF-1.4', '')[1], "pdf-text")
    check("csv sniff",  gp.detect_format(b'Pos,Player,R1,Total\n1,A,70,70', 'pos,player')[1], "csv")

if __name__ == "__main__":
    for fn in list(globals()):
        if fn.startswith("test_"):
            print(f"# {fn}"); globals()[fn]()
    if _failures:
        print("\nFAIL:"); [print(" -", f) for f in _failures]; sys.exit(1)
    print("\nALL PASS")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: FAIL — `No module named ...` / `AttributeError: module ... has no attribute 'detect_format'` (the parser file doesn't exist yet).

- [ ] **Step 3: Write the scaffold**

Create `api/golf/parse_pdf.py`:

```python
"""AthLink golf results parser — stroke-play core.

Mirrors the sailing pipeline SHAPE (detect -> route -> parse -> normalise) but is
self-contained and lean: NO vision path, NO handicap/sail logic. A golf round maps
onto the existing entry `races[]` slot; pdf_rank = finishing position; pdf_net =
gross total; race_codes[] = per-round status (MC/WD/DQ/DNS). Per-event golf metadata
(scoring_format, rounds, cut_after_round, course_par) rides on the result dict and is
written to the events table (migration 0016)."""
import io, re, json, csv as _csv

# ── small helpers ────────────────────────────────────────────────────────────
def clean_name(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()

def clean_int(s):
    """First signed integer in a cell, else None. '70' -> 70, '(72)' -> 72, '' -> None."""
    m = re.search(r"-?\d+", str(s or ""))
    return int(m.group()) if m else None

# Per-round status codes that stand IN PLACE OF a numeric score.
_ROUND_CODES = ("MC", "WD", "DQ", "DNS", "DNF", "NC", "RTD", "CUT")
def parse_round_cell(s):
    """Return (value:int|None, code:str|None) for one round cell.
    A numeric cell -> (int, None). A status cell -> (None, 'MC'). Blank -> (None, None)."""
    t = str(s or "").strip().upper()
    if not t:
        return (None, None)
    for c in _ROUND_CODES:
        if c in t:
            return (None, "MC" if c == "CUT" else c)
    v = clean_int(t)
    return (v, None)

# ── format detection (NO vision) ─────────────────────────────────────────────
def _input_type(fb: bytes, low: str) -> str:
    fb = fb or b""
    if fb[:4] == b"%PDF":
        return "pdf-text"                         # golf ingests only text-extractable PDFs
    if fb[:4] == b"PK\x03\x04" or fb[:4] == b"\xd0\xcf\x11\xe0":
        return "xlsx"
    head = fb[:512].lstrip().lower()
    if head[:5] == b"<html" or head[:9] == b"<!doctype" or b"<table" in fb[:4000].lower():
        return "html"
    if b"," in fb[:400] and b"\n" in fb[:2000]:
        return "csv"
    return "pdf-text"

FORMAT_REGISTRY = []  # filled in Tasks 5-6: list of {"family","input_types","detect","extractor"}

def detect_format(file_bytes: bytes, full_text_lower: str):
    """(family, input_type, confidence). Never raises. input_type is vision-free."""
    itype = _input_type(file_bytes or b"", full_text_lower or "")
    for spec in FORMAT_REGISTRY:
        if itype not in spec["input_types"]:
            continue
        try:
            if spec["detect"](file_bytes or b"", full_text_lower or ""):
                return spec["family"], itype, 0.9
        except Exception:
            continue
    return "unknown", itype, 0.3
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: PASS — the three `detect_format` checks print `ok` and the script ends `ALL PASS`.

- [ ] **Step 5: Python syntax check**

Run: `/opt/anaconda3/bin/python3 -c "import ast; ast.parse(open('api/golf/parse_pdf.py').read())"`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add api/golf/parse_pdf.py tools/test_golf_parser.py
git commit -m "feat(golf): parser scaffold — detect_format + round-cell helpers"
```

---

## Task 4: `interpret_golf_grid` — the pure grid → golf-result core

**Files:**
- Modify: `api/golf/parse_pdf.py` (add `interpret_golf_grid` + header-synonym maps)
- Modify: `tools/test_golf_parser.py` (add grid tests)

**Interfaces:**
- Consumes: `clean_name`, `clean_int`, `parse_round_cell` (Task 3).
- Produces: `interpret_golf_grid(rows: list[list[str]], title_text: str = "") -> dict` returning:
  ```
  {"ok": True, "multi": False, "name": str, "date": str, "discards": 0,
   "scoring_format": "stroke", "rounds": int, "cut_after_round": int|None,
   "course_par": int|None, "entries": [ <entry dict> ], "notes": [str]}
  ```
  (`"multi": False` mirrors the sailing parser response the deferred frontend
  consumes — kept intentionally, single-result golf grids are never multi.)
  Each entry: `{helm, crew:"", sail:"—", nat:"", div:"", gender:"", category:"",
  races:[int...], race_codes:[str|None...], pdf_rank:int|None, pdf_net:int|None,
  birth_year:None, crew_birth_year:None}`.

- [ ] **Step 1: Write the failing tests**

Add to `tools/test_golf_parser.py` (above the `__main__` block):

```python
def test_interpret_grid_basic():
    rows = [
        ["Pos", "Player", "R1", "R2", "R3", "Total"],
        ["1",   "Amy Chan",   "70", "71", "69", "210"],
        ["T2",  "Ben Wong",   "72", "70", "70", "212"],
        ["T2",  "Cara Diaz",  "71", "71", "70", "212"],
    ]
    r = gp.interpret_golf_grid(rows, "Spring Open  Par 72")
    check("grid n_entries", len(r["entries"]), 3)
    check("grid rounds", r["rounds"], 3)
    check("grid scoring_format", r["scoring_format"], "stroke")
    check("grid course_par", r["course_par"], 72)
    e0 = r["entries"][0]
    check("grid rank0", e0["pdf_rank"], 1)
    check("grid net0", e0["pdf_net"], 210)
    check("grid races0", e0["races"], [70, 71, 69])
    check("grid codes0", e0["race_codes"], [None, None, None])
    check("grid helm0", e0["helm"], "Amy Chan")
    check("grid tie rank", r["entries"][1]["pdf_rank"], 2)   # 'T2' -> 2, ground truth

def test_interpret_grid_missed_cut():
    rows = [
        ["Pos", "Player", "Rd1", "Rd2", "Rd3", "Rd4", "Total"],
        ["1",   "Amy Chan", "70", "71", "69", "68", "278"],
        ["",    "Ben Wong", "80", "82", "MC", "",   "162"],
    ]
    r = gp.interpret_golf_grid(rows, "")
    check("cut rounds", r["rounds"], 4)
    ben = r["entries"][1]
    # races[] and race_codes[] MUST stay parallel (same length). The MC marker is
    # stored IN races[] (sailing-consistent: races may hold a status string, as it
    # holds "DNF"/"DNS" in sailing); the code lane stays None. The trailing blank
    # round (post-cut, not played) is trimmed from BOTH arrays.
    check("cut arrays parallel", len(ben["races"]), len(ben["race_codes"]))
    check("cut races len", len(ben["races"]), 3)             # R1, R2, MC — R4 (blank, post-cut) trimmed
    check("cut marker in races", ben["races"][2], "MC")
    check("cut codes clean", ben["race_codes"], [None, None, None])
```

- [ ] **Step 2: Run to verify failure**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: FAIL — `AttributeError: ... 'interpret_golf_grid'`.

- [ ] **Step 3: Implement `interpret_golf_grid`**

Add to `api/golf/parse_pdf.py`:

```python
# ── header synonyms ──────────────────────────────────────────────────────────
def _hk(cell) -> str:
    return re.sub(r"[^a-z0-9]", "", str(cell or "").lower())

_POS_KEYS    = {"pos", "position", "place", "rank", "rk", "no"}
_PLAYER_KEYS = {"player", "name", "golfer", "competitor", "athlete"}
_TOTAL_KEYS  = {"total", "gross", "agg", "aggregate", "score", "strokes", "net", "nett"}
_TOPAR_KEYS  = {"topar", "par", "toparscore", "vspar", "score2"}
_ROUND_RE    = re.compile(r"^(?:r|rd|round|day)0*(\d+)$")

def _classify_header(header):
    """Map a header row to column roles. Returns (pos_i, player_i, round_idxs, total_i)
    or None if it isn't a results header."""
    keys = [_hk(c) for c in header]
    pos_i = next((i for i, k in enumerate(keys) if k in _POS_KEYS), None)
    player_i = next((i for i, k in enumerate(keys) if k in _PLAYER_KEYS), None)
    if player_i is None:
        return None
    round_idxs = [i for i, k in enumerate(keys) if _ROUND_RE.match(k)]
    total_i = next((i for i, k in enumerate(keys) if k in _TOTAL_KEYS), None)
    if not round_idxs and total_i is None:
        return None
    return pos_i, player_i, round_idxs, total_i

_PAR_RE = re.compile(r"\bpar\s*[:\-]?\s*(\d{2,3})\b", re.I)
def _course_par(title_text: str):
    m = _PAR_RE.search(title_text or "")
    return int(m.group(1)) if m else None

def interpret_golf_grid(rows, title_text: str = ""):
    """Turn a Pos/Player/round-scores/Total grid into a golf stroke-play result.
    Ground truth: pdf_rank read verbatim (ties keep their number), rows never reordered."""
    rows = [[("" if c is None else str(c).strip()) for c in r] for r in (rows or [])
            if any((str(c or "").strip()) for c in r)]
    header = cols = None
    hdr_i = 0
    for i, r in enumerate(rows[:8]):
        c = _classify_header(r)
        if c:
            header, cols, hdr_i = r, c, i
            break
    if not cols:
        raise ValueError("No golf results header (Pos/Player/round/Total) found.")
    pos_i, player_i, round_idxs, total_i = cols

    entries = []
    cut_after = None
    for r in rows[hdr_i + 1:]:
        # An explicit cut separator row (e.g. a lone 'CUT' / 'Missed Cut' line).
        joined = " ".join(r).strip().lower()
        if joined and ("cut" in joined) and not clean_name(r[player_i] if player_i < len(r) else ""):
            cut_after = cut_after or len([i for i in round_idxs if i < len(r)])
            continue
        name = clean_name(r[player_i]) if player_i < len(r) else ""
        if not name:
            continue
        # Build races[] and race_codes[] as PARALLEL arrays — one element per round,
        # same index = same round. Sailing convention: a pure status round (MC/WD/DQ)
        # stores its marker string IN races[] (just as sailing stores "DNF"/"DNS"),
        # with the code lane None; a numeric round stores the number and any annotation
        # in the code lane. A blank round gets a None placeholder so positions never
        # shift. Trailing blank rounds (post-cut / not played) are trimmed from both.
        races, codes = [], []
        for i in round_idxs:
            v, code = parse_round_cell(r[i] if i < len(r) else "")
            if v is not None:
                races.append(v); codes.append(code)          # numeric (code annotates it, usually None)
            elif code is not None:
                races.append(code); codes.append(None)        # status marker lives in races[]
            else:
                races.append(None); codes.append(None)        # blank placeholder keeps arrays parallel
        while races and races[-1] is None and codes[-1] is None:
            races.pop(); codes.pop()                           # trim trailing not-played rounds
        rank = clean_int(r[pos_i]) if (pos_i is not None and pos_i < len(r)) else None
        net = clean_int(r[total_i]) if (total_i is not None and total_i < len(r)) else None
        entries.append({
            "helm": name, "crew": "", "sail": "—", "nat": "",
            "div": "", "gender": "", "category": "",
            "races": races, "race_codes": codes,
            "pdf_rank": rank, "pdf_net": net,
            "birth_year": None, "crew_birth_year": None,
        })
    if not entries:
        raise ValueError("Golf grid had a header but no player rows.")

    name_line = clean_name((title_text or "").splitlines()[0]) if title_text else ""
    return {
        "ok": True, "multi": False,
        "name": name_line or "Imported Competition",
        "date": "", "discards": 0,
        "scoring_format": "stroke",
        "rounds": len(round_idxs),
        "cut_after_round": cut_after,
        "course_par": _course_par(title_text),
        "entries": entries,
        "notes": [f"Read {len(entries)} golf player rows over {len(round_idxs)} rounds."],
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: PASS — all `test_interpret_grid_*` checks print `ok`, script ends `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add api/golf/parse_pdf.py tools/test_golf_parser.py
git commit -m "feat(golf): interpret_golf_grid — pure grid to stroke-play result"
```

---

## Task 5: `golf-grid-xlsx` + CSV adapter (+ fixtures)

**Files:**
- Modify: `api/golf/parse_pdf.py` (add `parse_xlsx_bytes`, `parse_csv_bytes`, register families)
- Create: `tools/golf_fixtures/mini_grid.csv`, `tools/golf_fixtures/mini_grid.xlsx`
- Modify: `tools/test_golf_parser.py` (add fixture tests)

**Interfaces:**
- Consumes: `interpret_golf_grid` (Task 4).
- Produces: `parse_xlsx_bytes(fb)`, `parse_csv_bytes(fb)` returning the Task-4 result dict; two `FORMAT_REGISTRY` entries (`golf-grid-xlsx` for xlsx, and CSV routed by input_type).

- [ ] **Step 1: Create the CSV fixture**

Create `tools/golf_fixtures/mini_grid.csv`:

```csv
Spring Junior Open — Par 71
Pos,Player,R1,R2,Total
1,Amy Chan,68,70,138
T2,Ben Wong,70,70,140
T2,Cara Diaz,69,71,140
```

- [ ] **Step 2: Create the xlsx fixture (generate it, don't hand-author binary)**

Run this one-off generator (it writes the binary fixture):

```bash
/opt/anaconda3/bin/python3 - <<'PY'
import openpyxl, os
wb = openpyxl.Workbook(); ws = wb.active
for r in [
    ["Autumn Amateur  Par 72"],
    ["Pos","Player","Rd1","Rd2","Rd3","Total"],
    [1,"Amy Chan",70,71,69,210],
    ["T2","Ben Wong",72,70,70,212],
    ["T2","Cara Diaz",71,71,70,212],
]:
    ws.append(r)
os.makedirs("tools/golf_fixtures", exist_ok=True)
wb.save("tools/golf_fixtures/mini_grid.xlsx")
print("wrote tools/golf_fixtures/mini_grid.xlsx")
PY
```

Expected: prints `wrote tools/golf_fixtures/mini_grid.xlsx`.

- [ ] **Step 3: Write the failing tests**

Add to `tools/test_golf_parser.py`:

```python
def test_csv_fixture():
    fb = open(os.path.join(FIXTURES, "mini_grid.csv"), "rb").read()
    r = gp.parse_csv_bytes(fb)
    check("csv n_entries", len(r["entries"]), 3)
    check("csv rounds", r["rounds"], 2)
    check("csv course_par", r["course_par"], 71)
    check("csv net0", r["entries"][0]["pdf_net"], 138)

def test_xlsx_fixture():
    fb = open(os.path.join(FIXTURES, "mini_grid.xlsx"), "rb").read()
    r = gp.parse_xlsx_bytes(fb)
    check("xlsx n_entries", len(r["entries"]), 3)
    check("xlsx rounds", r["rounds"], 3)
    check("xlsx course_par", r["course_par"], 72)
    check("xlsx detect family", gp.detect_format(fb, "")[0], "golf-grid-xlsx")
```

- [ ] **Step 4: Run to verify failure**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: FAIL — `AttributeError: ... 'parse_csv_bytes'`.

- [ ] **Step 5: Implement the adapters + register families**

Add to `api/golf/parse_pdf.py` (after `interpret_golf_grid`):

```python
# ── xlsx / csv adapters ──────────────────────────────────────────────────────
def _grid_and_title(rows):
    """Split leading single-cell title rows (above the header) from the grid.
    Returns (title_text, rows). Title rows carry the event name + a 'Par NN' hint."""
    title_bits = []
    for r in rows[:4]:
        ne = [c for c in r if str(c).strip()]
        if len(ne) == 1:
            title_bits.append(str(ne[0]).strip())
        elif ne:
            break
    return ("\n".join(title_bits), rows)

def parse_xlsx_bytes(fb: bytes):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(fb), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = [["" if c is None else str(c).strip() for c in row]
            for row in ws.iter_rows(values_only=True)]
    title_text, rows = _grid_and_title(rows)
    return interpret_golf_grid(rows, title_text)

def parse_csv_bytes(fb: bytes):
    try:
        text = fb.decode("utf-8")
    except UnicodeDecodeError:
        text = fb.decode("latin-1", errors="replace")
    rows = [r for r in _csv.reader(io.StringIO(text)) if any((c or "").strip() for c in r)]
    title_text, rows = _grid_and_title(rows)
    return interpret_golf_grid(rows, title_text)

# A single-sheet golf workbook is always our grid; a CSV likewise. Detection is by
# input_type (there is no vendor stamp to sniff), so the signature just returns True.
FORMAT_REGISTRY.extend([
    {"family": "golf-grid-xlsx", "input_types": ["xlsx"],
     "detect": lambda fb, low: True, "extractor": parse_xlsx_bytes},
    {"family": "golf-grid-csv",  "input_types": ["csv"],
     "detect": lambda fb, low: True, "extractor": parse_csv_bytes},
])
```

- [ ] **Step 6: Run to verify pass**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: PASS — `csv_*` and `xlsx_*` checks print `ok`, `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add api/golf/parse_pdf.py tools/test_golf_parser.py tools/golf_fixtures/mini_grid.csv tools/golf_fixtures/mini_grid.xlsx
git commit -m "feat(golf): xlsx + csv grid adapters + fixtures"
```

---

## Task 6: `federation-pdf` adapter (+ fixture)

**Files:**
- Modify: `api/golf/parse_pdf.py` (add `parse_pdf_bytes`, register `federation-pdf`)
- Create: `tools/golf_fixtures/mini_federation.pdf`
- Modify: `tools/test_golf_parser.py` (add fixture test)

**Interfaces:**
- Consumes: `interpret_golf_grid` (Task 4).
- Produces: `parse_pdf_bytes(fb)` returning the Task-4 result dict; a `federation-pdf` `FORMAT_REGISTRY` entry (input_type `pdf-text`, lowest priority — appended last).

- [ ] **Step 1: Generate the PDF fixture**

pdfplumber reads tables best from ruled grids. Generate one with reportlab (present in the anaconda env):

```bash
/opt/anaconda3/bin/python3 - <<'PY'
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
os.makedirs("tools/golf_fixtures", exist_ok=True)
doc = SimpleDocTemplate("tools/golf_fixtures/mini_federation.pdf", pagesize=A4)
styles = getSampleStyleSheet()
data = [
    ["Pos","Player","R1","R2","R3","Total"],
    ["1","Amy Chan","70","71","69","210"],
    ["T2","Ben Wong","72","70","70","212"],
    ["T2","Cara Diaz","71","71","70","212"],
]
t = Table(data)
t.setStyle(TableStyle([("GRID",(0,0),(-1,-1),0.5,colors.black),
                       ("BACKGROUND",(0,0),(-1,0),colors.lightgrey)]))
doc.build([Paragraph("National Junior Championship — Par 72", styles["Title"]),
           Spacer(1,12), t])
print("wrote tools/golf_fixtures/mini_federation.pdf")
PY
```

Expected: prints `wrote tools/golf_fixtures/mini_federation.pdf`.

- [ ] **Step 2: Write the failing test**

Add to `tools/test_golf_parser.py`:

```python
def test_federation_pdf_fixture():
    fb = open(os.path.join(FIXTURES, "mini_federation.pdf"), "rb").read()
    r = gp.parse_pdf_bytes(fb)
    check("pdf n_entries", len(r["entries"]), 3)
    check("pdf rounds", r["rounds"], 3)
    check("pdf course_par", r["course_par"], 72)
    check("pdf rank0", r["entries"][0]["pdf_rank"], 1)
    check("pdf detect family", gp.detect_format(fb, "pos player total")[0], "federation-pdf")
```

- [ ] **Step 3: Run to verify failure**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: FAIL — `AttributeError: ... 'parse_pdf_bytes'`.

- [ ] **Step 4: Implement the PDF adapter + register the family**

Add to `api/golf/parse_pdf.py`:

```python
# ── federation PDF adapter ───────────────────────────────────────────────────
def parse_pdf_bytes(fb: bytes):
    import pdfplumber
    title_lines, all_rows = [], []
    with pdfplumber.open(io.BytesIO(fb)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            title_lines.extend(l.strip() for l in txt.splitlines()[:3] if l.strip())
            for strategy in ({"vertical_strategy": "lines", "horizontal_strategy": "lines"},
                             {"vertical_strategy": "text",  "horizontal_strategy": "text"}):
                tbls = page.extract_tables(strategy) or []
                if tbls:
                    for tb in tbls:
                        all_rows.extend(tb)
                    break
    if not all_rows:
        raise ValueError("No results table found in this PDF.")
    return interpret_golf_grid(all_rows, "\n".join(title_lines))

# A generic golf grid with NO vendor stamp: detect only that the text carries the
# tell-tale column words. Appended LAST so any future vendor family wins first.
def _sig_federation(fb, low):
    return ("player" in low or "name" in low) and ("total" in low or "gross" in low)

FORMAT_REGISTRY.append(
    {"family": "federation-pdf", "input_types": ["pdf-text"],
     "detect": _sig_federation, "extractor": parse_pdf_bytes})
```

- [ ] **Step 5: Run to verify pass**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: PASS — `pdf_*` checks print `ok`, `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add api/golf/parse_pdf.py tools/test_golf_parser.py tools/golf_fixtures/mini_federation.pdf
git commit -m "feat(golf): federation-pdf adapter + fixture"
```

---

## Task 7: Route dispatch + `parse_bytes` entry point

**Files:**
- Modify: `api/golf/parse_pdf.py` (add `parse_bytes` that ties detect → route → extract)
- Modify: `tools/test_golf_parser.py` (add a dispatch test per input type)

**Interfaces:**
- Consumes: `detect_format`, `parse_xlsx_bytes`, `parse_csv_bytes`, `parse_pdf_bytes`.
- Produces: `parse_bytes(fb: bytes) -> dict` — the single rule-parse entry point. Returns the Task-4 result dict plus a `detected_format` diagnostic `{family, input_type, confidence}`. Raises `ValueError` with a human message when nothing matches.

- [ ] **Step 1: Write the failing test**

Add to `tools/test_golf_parser.py`:

```python
def test_parse_bytes_routes_all_three():
    for fn in ("mini_grid.csv", "mini_grid.xlsx", "mini_federation.pdf"):
        fb = open(os.path.join(FIXTURES, fn), "rb").read()
        r = gp.parse_bytes(fb)
        check(f"dispatch {fn} entries", len(r["entries"]), 3)
        check(f"dispatch {fn} scoring_format", r["scoring_format"], "stroke")
        check(f"dispatch {fn} has detected_format", bool(r.get("detected_format")), True)
```

- [ ] **Step 2: Run to verify failure**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: FAIL — `AttributeError: ... 'parse_bytes'`.

- [ ] **Step 3: Implement `parse_bytes`**

Add to `api/golf/parse_pdf.py`:

```python
# ── main rule parse: detect -> route -> extract ──────────────────────────────
def _text_for_detect(fb: bytes) -> str:
    """Cheap lowercase text sniff for detect_format's signatures."""
    itype = _input_type(fb, "")
    if itype == "pdf-text":
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(fb)) as pdf:
                return "\n".join((p.extract_text() or "") for p in pdf.pages[:2]).lower()
        except Exception:
            return ""
    if itype in ("csv", "html"):
        try:
            return fb[:4000].decode("utf-8", errors="replace").lower()
        except Exception:
            return ""
    return ""   # xlsx: routed by input_type, no text sniff needed

def parse_bytes(fb: bytes) -> dict:
    low = _text_for_detect(fb)
    family, itype, conf = detect_format(fb, low)
    extractor = next((s["extractor"] for s in FORMAT_REGISTRY if s["family"] == family), None)
    if extractor is None:
        raise ValueError("This file doesn't look like a golf results grid "
                         "(need Pos / Player / round / Total columns).")
    res = extractor(fb)
    res["detected_format"] = {"family": family, "input_type": itype, "confidence": conf}
    return res
```

- [ ] **Step 4: Run to verify pass**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: PASS — all three dispatch checks print `ok`, `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add api/golf/parse_pdf.py tools/test_golf_parser.py
git commit -m "feat(golf): parse_bytes — detect/route/extract entry point"
```

---

## Task 8: HTTP handler + Vercel registration

**Files:**
- Modify: `api/golf/parse_pdf.py` (add a `BaseHTTPRequestHandler` `handler`)
- Modify: `vercel.json` (register the function)

**Interfaces:**
- Consumes: `parse_bytes` (Task 7).
- Produces: a deployable `POST /api/golf/parse_pdf` endpoint accepting a raw octet-stream body (file bytes) → JSON result. Mirrors the sailing endpoint's basic contract enough to be probeable; the follow-on frontend plan repoints golf's fetches here.

- [ ] **Step 1: Add the HTTP handler**

Append to `api/golf/parse_pdf.py`:

```python
# ── Vercel HTTP handler ──────────────────────────────────────────────────────
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n) if n else b""
            ctype = (self.headers.get("Content-Type") or "").lower()
            if "application/json" in ctype:
                # {url} form is a follow-on concern; for now report it clearly.
                self._send(400, {"ok": False, "error": "Send the file as an octet-stream body."})
                return
            res = parse_bytes(raw)
            self._send(200, res)
        except ValueError as e:
            self._send(200, {"ok": False, "error": str(e)})
        except Exception as e:  # never 500 the client
            self._send(200, {"ok": False, "error": f"Golf parser failed: {e}"})
```

- [ ] **Step 2: Register the function in `vercel.json`**

In `vercel.json`, in the `functions` block (alongside `api/sailing/parse_pdf.py`), add:

```json
    "api/golf/parse_pdf.py": {
      "maxDuration": 60
    },
```

(No `includeFiles: api/_shared/**` — the golf parser is self-contained and uses no `_shared` module.)

- [ ] **Step 3: Syntax + JSON validity checks**

Run: `/opt/anaconda3/bin/python3 -c "import ast; ast.parse(open('api/golf/parse_pdf.py').read())"`
Expected: no output (exit 0).

Run: `/opt/anaconda3/bin/python3 -c "import json; json.load(open('vercel.json')); print('vercel.json ok')"`
Expected: prints `vercel.json ok`.

- [ ] **Step 4: Full harness re-run (regression)**

Run: `/opt/anaconda3/bin/python3 tools/test_golf_parser.py`
Expected: `ALL PASS` (handler addition didn't break the rule path).

- [ ] **Step 5: Commit**

```bash
git add api/golf/parse_pdf.py vercel.json
git commit -m "feat(golf): HTTP handler + Vercel function registration"
```

---

## Self-Review (completed against the spec)

- **Spec coverage** — §7.1 schema → Tasks 1–2 (4 columns; entries unchanged; data-layer threading). §7.1 `course_par` = document-read int → `_course_par`/`_PAR_RE` in Task 4 (no par subsystem, honoring §7.2 defer). §7.3 own `api/golf/parse_pdf.py` + own `FORMAT_REGISTRY`, no vision → Tasks 3–8. §7.3 build `golf-grid-xlsx` + `federation-pdf` first → Tasks 5–6; named platforms (Golf Genius/BlueGolf/GolfBox/clubspot-golf) deliberately NOT built (registry is append-only — a future task adds a signature + extractor, nothing here blocks it). Ground-truth rule (§4) → `pdf_rank` read verbatim, ties keep their number, rows never reordered. Stableford/match-play (§3.2) → out of scope, `scoring_format` hard-coded `"stroke"`.
- **Placeholder scan** — no TBD/TODO in code steps; every code step shows complete code; the "signature TBD" platform families are an explicit non-goal, not an unfinished step.
- **Type consistency** — `interpret_golf_grid` result dict is defined once (Task 4) and every adapter (`parse_xlsx_bytes`/`parse_csv_bytes`/`parse_pdf_bytes`) returns it unchanged; `parse_bytes` only adds `detected_format`. Entry dict keys match the sailing shape in Global Constraints. Helper names (`clean_int`, `clean_name`, `parse_round_cell`, `_input_type`, `FORMAT_REGISTRY`, `detect_format`) are introduced in Task 3 and reused verbatim.
- **Note carried forward** — the live `events` columns were read off `events.js` payloads (Supabase MCP was timing out); Task 1 Step 2 re-verifies against the DB before/after applying.
