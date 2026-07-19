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
        races, codes = [], []
        for i in round_idxs:
            v, code = parse_round_cell(r[i] if i < len(r) else "")
            if v is not None:
                races.append(v); codes.append(code)
            elif code is not None:
                # status stands in place of a score: keep it, no numeric value
                codes.append(code)
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
