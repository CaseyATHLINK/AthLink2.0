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
