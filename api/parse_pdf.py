"""
AthLink PDF parser v5 — Vercel serverless function.

Universal parser covering:
  - Sailwave PDF (standard, any column arrangement, wrapped text in cells)
  - Sailwave HTML via ourclubadmin (doubled headers, TP5 [17.0] scores)
  - Manage2sail (split 2-row header, combined helm+crew cell with birth years)
  - SailingResults.net
  - Clubspot (SAILORS section below table)
  - ourclubadmin multi-class (Rank Class Sail number Club Helm's Name Crew's Name)
  - Multi-fleet / split Gold/Silver/Bronze fleet events

v5 additions:
  - Gender + age-category detection (rule headers, server HTML, Gemini prompt).
    Emits entry['gender'] in {'M','F','Mix',''} and entry['category'] (e.g.
    'U17','Jr','U23',''). Boat gender for two-person boats is combined from
    separate helm/crew gender columns when no single boat-gender column exists.
  - Live results LINK ingestion: POST a JSON body {"url": "...", "mode": "ai"}
    and the function fetches + parses the page server-side (browsers can't, due
    to CORS). HTML pages are parsed from source (more accurate than PDFs) via a
    stdlib HTMLParser that reuses the same column machinery.
  - Parser MODE routing: ?mode=rule (built-in parser only, no AI) or ?mode=ai
    (built-in first, Gemini fallback; images always AI).
  - 'notes': a short status trail returned with every parse, for the import
    "thinking" / progress stream in the UI.
"""

from http.server import BaseHTTPRequestHandler
import json, io, re, os, base64
try:
    from urllib.request import urlopen, Request as UrlRequest
    from urllib.error import HTTPError
except ImportError:
    urlopen = UrlRequest = None
    HTTPError = Exception

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

# Confidence gate (standalone module in api/). Robust import so it works both
# in the Vercel serverless runtime and the local test harness.
import sys
_API_DIR = os.path.dirname(os.path.abspath(__file__))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)
try:
    from validate import score_parse
except Exception:
    score_parse = None
try:
    from llm import (call_gemini, gemini_text, call_openai_compat, openai_text,
                     LLMError, ROUTES as _LLM_ROUTES, route as _llm_route)
except Exception:
    call_gemini = None
    gemini_text = None
    call_openai_compat = None
    openai_text = None
    LLMError = Exception
    _LLM_ROUTES = {}
    _llm_route = None

# ── penalty codes ──────────────────────────────────────────────────────────
CODES = {
    'DNF','DNC','DNS','OCS','DSQ','BFD','UFD','RET','RDG','DGM','DNE',
    'SCP','NSC','PRP','TAL','ZFP','STP','DPI','TP5','TPP','TPN',
    # TopYacht legend codes (single-letter suffixes translated to these):
    'ARB','MED','ESP','ENP','LATE','DUT','EXC','TLE','UFP','AVG','PRO',
}

def fix_doubled(s):
    """Fix 'RRaannkk' → 'Rank' (doubled-character font artifact in ourclubadmin PDFs)."""
    c = str(s or '').replace('\n', ' ').strip()
    if len(c) >= 4 and all(c[i] == c[i+1] for i in range(0, min(len(c)-1, 8), 2)):
        return c[::2]
    return c

# ── score parsing ──────────────────────────────────────────────────────────
def clean_score(raw):
    """
    Parse any score cell into a number or code string.

    KEY RULE (from RRS / Sailwave / Manage2sail):
      "NUMBER CODE"  e.g. "3 STP", "7\nSTP", "11.9\nSCP", "(33)\nDNC"
        → the NUMBER is the actual points value; the CODE is just a label
        → return the number

      "(NUMBER)"     e.g. "(16)", "(18)"
        → discarded score; return the number

      "CODE" alone   e.g. "DNF", "DNC", "UFD", "BFD"
        → no explicit number; score = fleet+1 in the engine
        → return the code string so the engine can assign fleet+1

    This means STP/SCP/DPI etc. with an attached number are treated as
    plain numeric scores — the organiser's software already calculated the
    penalty into the number shown.
    """
    if raw is None:
        return None
    s = str(raw).strip().replace('\n', ' ')
    if not s or s in ('-', '—', '–', '*', ''):
        return None

    # Strip outer discard parens: (5.0) → 5.0 | (33) DNC → 33 DNC | (DNF) → DNF
    inner = re.sub(r'^\(|\)$', '', s.strip())

    # Split into tokens
    parts = re.split(r'[\s\[\]]+', inner.strip())
    parts = [p for p in parts if p]

    num = None
    code = None
    for p in parts:
        up = re.sub(r'[^A-Z]', '', p.upper())
        if up in CODES:
            code = up
        else:
            ns = re.sub(r'[^\d.]', '', p)
            if ns:
                try:
                    n = float(ns)
                    num = int(n) if n == int(n) else round(n, 2)
                except ValueError:
                    pass

    # If both a number and a code are present, the number IS the score.
    # The code is just an annotation (STP/SCP/DPI etc. already factored in).
    if num is not None:
        return num

    # Code only (no number) → engine will assign fleet+1
    if code is not None:
        return code

    return None


def clean_score_with_code(raw):
    """
    Like clean_score but also returns the penalty code annotation when a
    numeric score has an associated code (e.g. "7 STP" → (7, "STP")).
    Returns (score, code_annotation) where code_annotation may be None.
    """
    if raw is None:
        return None, None
    s = str(raw).strip().replace('\n', ' ')
    if not s or s in ('-', '—', '–', '*', ''):
        return None, None

    inner = re.sub(r'^\(|\)$', '', s.strip())
    parts = re.split(r'[\s\[\]]+', inner.strip())
    parts = [p for p in parts if p]

    num = None
    code = None
    for p in parts:
        up = re.sub(r'[^A-Z]', '', p.upper())
        if up in CODES:
            code = up
        else:
            ns = re.sub(r'[^\d.]', '', p)
            if ns:
                try:
                    n = float(ns)
                    num = int(n) if n == int(n) else round(n, 2)
                except ValueError:
                    pass

    if num is not None:
        # Return the number AND the code label (for display annotation)
        return num, code

    if code is not None:
        return code, None

    return None, None

# ── header helpers ─────────────────────────────────────────────────────────
def is_race_hdr(cell):
    s = fix_doubled(str(cell or '')).strip().upper()
    return bool(
        re.match(r'^[RFOQ]\d{1,2}$', s) or   # Q1-Q6, F1-F7, O1, R1
        re.match(r'^[FQ]\d{1,2}$', s) or
        re.match(r'^\d{1,2}[PEQF]$', s) or     # Sailti: 1P (qualifying), 8E (final)
        re.match(r'^(RACE\s*\d{1,2})$', s) or
        re.match(r'^\d{1,2}$', s) or
        re.match(r'^ER\d{1,2}$', s) or         # ER1/ER2 = extra race (pya-events)
        re.match(r'^M\d{1,2}$', s) or          # M10 = medal race 10
        s in ('M', 'MR')                        # M / MR = medal race (Sailwave native)
    )


def hdr_key(cell):
    return re.sub(r"[\s\n_()/\\'#.]+", '', fix_doubled(str(cell or '')).lower())

# ── name helpers ───────────────────────────────────────────────────────────
def strip_birth_year(name):
    # Replace a (YYYY) birth year with a space so the surname doesn't glue to
    # whatever follows (e.g. a trailing "(Club)"), then collapse whitespace.
    n = re.sub(r'\(\s*(?:19[3-9]\d|20[0-2]\d)\s*\)', ' ', str(name))
    return re.sub(r'\s+', ' ', n).strip()

def strip_club_suffix(name):
    # Strip ALL trailing parenthetical groups (club names, codes, empty "()"),
    # not just short ALL-CAPS abbreviations. Repeats to peel multiple groups.
    n = str(name); prev = None
    while prev != n:
        prev = n
        n = re.sub(r'\s*\([^()]*\)\s*$', '', n).strip()
    return n

def title_name(n):
    if not n:
        return ''
    parts = str(n).strip().split()
    out = []
    for p in parts:
        mc = re.match(r"^(Ma?c)([A-ZÀ-ÖØ-Þ]{2,})$", p)  # McKAY → McKay, MacDONALD → MacDonald
        if mc:
            out.append(mc.group(1) + mc.group(2).title())
        elif len(p) > 1 and re.match(r'^[A-ZÀ-ÖØ-Þ\-]+$', p):
            out.append(p.title())
        else:
            out.append(p)
    return ' '.join(out)

def reorder_surname_first(n):
    """manage2sail writes Asian names surname-first ("LAW Casey"). The ALL-CAPS
    token is the surname in either order, so when a name STARTS with an all-caps
    run followed by a Title-case forename, move the surname to the end.
    Western names ("Erwan FISCHER") start Title-case and are left untouched."""
    toks = n.split()
    if len(toks) < 2:
        return n
    def is_caps(t):  return len(t) >= 2 and re.match(r"^[A-ZÀ-ÖØ-Þ\-]+$", t)
    def is_title(t): return re.match(r"^[A-ZÀ-Þ][a-zà-ÿ]", t)
    if is_caps(toks[0]) and any(is_title(t) for t in toks[1:]):
        i = 0
        while i < len(toks) and is_caps(toks[i]):
            i += 1
        surname, rest = toks[:i], toks[i:]
        if rest:
            return ' '.join(rest + surname)
    return n

def clean_name(raw):
    n = str(raw or '').strip()
    n = strip_birth_year(n)
    n = strip_club_suffix(n)
    n = reorder_surname_first(n)
    return title_name(n)

def join_wrapped(cell_value):
    """Join a wrapped single-person name cell: 'Dylan\nCreighton' → 'Dylan Creighton'."""
    lines = [l.strip() for l in str(cell_value or '').split('\n') if l.strip()]
    return clean_name(' '.join(lines))

def split_combined_names(cell_value):
    """
    Split a COMBINED helm+crew cell into (helm, crew).
    
    Logic:
    - Comma present → split on comma (each part may span wrapped lines)
    - No comma, birth years present → each \n-separated line is a person (manage2sail)
    - No comma, no birth years → single wrapped name, join with space
    """
    if not cell_value:
        return '', ''
    raw = str(cell_value).strip()

    # Case 1: comma divides the two sailors
    if ',' in raw:
        comma_parts = raw.split(',', 1)
        def rejoin(s):
            return ' '.join(l.strip() for l in s.split('\n') if l.strip())
        helm = clean_name(rejoin(comma_parts[0]))
        crew = clean_name(rejoin(comma_parts[1]))
        return helm, crew

    # Case 2: manage2sail combined cell (birth years and/or per-line clubs).
    if re.search(r'\(\d{4}\)', raw):
        lines = [l.strip() for l in raw.split('\n') if l.strip()]
        # A NAME line has BOTH a Title-case token (forename) and an ALL-CAPS
        # token (surname). Club lines (all-caps abbreviations like "WPNSA",
        # all-title-case like "Royal Sydney YC", or score rows) are skipped.
        def is_name_line(l):
            toks = l.split()
            has_title = any(re.match(r"^[A-ZÀ-Þ][a-zà-ÿ]", t) for t in toks)
            has_caps  = any(len(t.strip("().,'")) >= 2 and
                            re.match(r"^[A-ZÀ-ÖØ-Þ\-]+$", t.strip("().,'")) for t in toks)
            return has_title and has_caps
        name_lines = [l for l in lines if is_name_line(l)]
        # Two clean single-line names → use them directly (handles a helm with
        # no birth year followed by a crew that has one).
        if len(name_lines) >= 2:
            return clean_name(name_lines[0]), clean_name(name_lines[1])
        # Otherwise fall back to accumulating lines and breaking on birth years
        # (covers names that wrap across two lines: "Iven Anton" / "FROMM (2004)").
        person_lines = []
        current = ''
        for line in lines:
            current = (current + ' ' + line).strip()
            if re.search(r'\(\d{4}\)', line):
                person_lines.append(current); current = ''
        if current and (not person_lines or is_name_line(current)):
            person_lines.append(current)
        helm = clean_name(person_lines[0]) if person_lines else (clean_name(name_lines[0]) if name_lines else '')
        crew = clean_name(person_lines[1]) if len(person_lines) > 1 else ''
        return helm, crew

    # Case 3: no comma, no birth year, but TWO lines that each look like a full
    # name (a forename + an ALL-CAPS surname). This is the manage2sail / 49er.org
    # crewed-boat format without DOB, e.g. "Seb MENZIES\nGeorge LEE RUSH".
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    if len(lines) == 2:
        def looks_like_full_name(s):
            # has at least one token that is an ALL-CAPS surname (2+ letters)
            return any(len(t) >= 2 and re.match(r'^[A-ZÀ-ÖØ-Þ\-]+$', t) for t in s.split())
        if all(looks_like_full_name(l) for l in lines):
            return clean_name(lines[0]), clean_name(lines[1])
        # Two <br>-stacked Title-case names (Sailwave-native "Team" cell:
        # "Ming Xu" / "Yahan Tu"): each line is a plausible full name (2+ word
        # tokens, ≥1 with a lower-case run so it isn't a stray label). Split them.
        def looks_like_title_name(s):
            toks = [t for t in s.split() if re.search(r'[A-Za-zÀ-ÿ]', t)]
            return len(toks) >= 2 and any(re.search(r'[a-zà-ÿ]', t) for t in toks)
        if all(looks_like_title_name(l) for l in lines):
            return clean_name(lines[0]), clean_name(lines[1])

    # Case 4: no comma, no birth year, single line (or unclear) → wrapped single name
    return clean_name(join_wrapped(raw)), ''

# ── sail / nationality ─────────────────────────────────────────────────────
def parse_sail_country(raw):
    """Split a sail cell into (country_code, sail_number).

    Handles, in order:
      - pure / club-prefixed sails (315, 22597, "RHKYC 1") → ('', sail as-is);
        never guess a country for these.
      - a 3-letter IOC code OR 2-letter "HK", with or WITHOUT a space, any case,
        directly followed by the number:  "HKG 929" / "HKG929" / "HkG306" /
        "HK 12" / "HK12" → ('HKG'/'CHN'/…, '929'/…). "HK" normalises to "HKG".
    Returns ('', sail) when no country prefix is recognised.
    """
    if raw is None:
        return '', ''
    s = str(raw).strip()
    if not s:
        return '', ''
    # Pure number (optionally with internal spaces / hyphens) → no country.
    if re.match(r'^\d[\d\s\-]*$', s):
        return '', s
    # 2–3 letter alpha prefix glued or spaced to the sail number.
    m = re.match(r'^([A-Za-z]{2,3})\s*(\d+.*)$', s)
    if m:
        code = m.group(1).upper()
        num  = m.group(2).strip()
        if len(code) == 2:
            if code == 'HK':
                return 'HKG', num
            return '', s          # unknown 2-letter prefix — don't guess
        return code, num          # 3-letter code (HKG, CHN, …)
    # Club-prefixed (e.g. "RHKYC 1") or anything else → leave sail untouched.
    return '', s

def flag_from_ioc(code):
    if not code:
        return ''
    up = code.upper().strip()
    return up if re.match(r'^[A-Z]{3}$', up) else ''

# ── gender / age-category ───────────────────────────────────────────────────
def norm_gender(raw):
    """Normalise any gender cell into 'M' | 'F' | 'Mix' | ''."""
    s = re.sub(r'[^a-z]', '', str(raw or '').lower())
    if not s:
        return ''
    if s in ('m', 'male', 'man', 'men', 'boy', 'boys', 'h', 'herr'):
        return 'M'
    if s in ('f', 'female', 'woman', 'women', 'w', 'girl', 'girls',
             'lady', 'ladies', 'dame'):
        return 'F'
    if s in ('mix', 'mixed', 'x', 'mf', 'fm', 'co', 'coed'):
        return 'Mix'
    return ''

def gender_from_text(raw):
    """Extract a boat gender from a free-text Division/category label such as
    "Junior, Men" / "Women" / "Mixed". Checks women/mixed before men so the
    substring in 'women' can't be misread (word boundaries guard this anyway)."""
    low = str(raw or '').lower()
    if re.search(r'\b(women|woman|female|girls?|ladies|lady)\b', low): return 'F'
    if re.search(r'\b(mixed|mix|co\-?ed)\b', low):                     return 'Mix'
    if re.search(r'\b(men|man|male|boys?|open\s+men)\b', low):         return 'M'
    return ''

def combine_boat_gender(helm_g, crew_g):
    """Derive a single boat gender from helm + crew gender."""
    h, c = norm_gender(helm_g), norm_gender(crew_g)
    if h and c:
        return h if h == c else 'Mix'
    return h or c or ''

def norm_category(raw):
    """
    Normalise an age-group / division category into a short label, preserving
    the source intent: 'U17', 'U-17', 'Under 17' → 'U17'; 'Junior' → 'Jr';
    'Open'/'Senior'/'Master' kept title-cased. Returns '' for empties / pure
    fleet colours (Gold/Silver/Bronze are fleets, not categories).
    """
    s = str(raw or '').strip()
    if not s:
        return ''
    low = s.lower()
    if low in ('open', 'overall', 'main', 'all', 'mixed', 'm', 'f', '-', '—',
               'men', 'man', 'male', 'women', 'woman', 'female',
               'boy', 'boys', 'girl', 'girls', 'lady', 'ladies'):
        return ''
    # Strip a leading/trailing gender word so "Junior, Men" → "Junior".
    s_nogender = re.sub(r'\b(men|man|male|women|woman|female|boys?|girls?|ladies|lady|mixed)\b',
                        ' ', s, flags=re.IGNORECASE)
    s_nogender = re.sub(r'[,\s]+', ' ', s_nogender).strip()
    if s_nogender:
        s, low = s_nogender, s_nogender.lower()
    else:
        return ''
    if re.search(r'\b(gold|silver|bronze|emerald|sapphire)\b', low):
        return ''
    m = re.search(r'\bu[\s\-]?(\d{1,2})\b', low)        # U17, U-17, U 17
    if m:
        return 'U' + m.group(1)
    m = re.search(r'\bunder[\s\-]?(\d{1,2})\b', low)     # Under 17
    if m:
        return 'U' + m.group(1)
    if re.search(r'\b(junior|jr|youth|cadet)\b', low):
        return 'Jr'
    if re.search(r'\b(master|veteran|senior)s?\b', low):
        return 'Mst'
    # Keep a clean short alphanumeric label (e.g. "Apprentice", "Radial")
    cleaned = re.sub(r'\s+', ' ', s).strip()
    return cleaned[:12] if len(cleaned) <= 14 else ''

def _is_age_cat_token(s):
    """True only for a BARE age-group token (U16, U-18, Under 17, Junior, Youth,
    Cadet, Master, Veteran, Senior). Deliberately strict: used to recover an
    UNLABELLED category column (e.g. the Sailwave 'Group' column in the ILCA
    Youth Worlds whose header cell renders blank), so it must never match names,
    clubs, sail numbers or scores."""
    low = str(s or '').strip().lower()
    if not low:
        return False
    if re.fullmatch(r'u[\s\-]?\d{1,2}', low):          # U16, U-18, U 16
        return True
    if re.fullmatch(r'under[\s\-]?\d{1,2}', low):       # Under 17
        return True
    return low in ('junior', 'jr', 'youth', 'cadet', 'master', 'masters',
                   'veteran', 'veterans', 'senior')

# ── metadata ───────────────────────────────────────────────────────────────
def extract_event_name(text):
    kw = r'(?i)(championship|regatta|nationals|cup|trophy|open|series|race|sailing|woche|ovington)'
    skip = r'(?i)^(sailed|discard|entries|result|rank|pos|overall|start|finish|http|www|point|powered|report)'
    for line in text.split('\n'):
        line = line.strip()
        # Drop a browser print-header prefix ("09/06/2026, 12:00 …") and the
        # Sailwave "Sailwave results for … at YYYY" title wrapper.
        line = re.sub(r'^\d{1,2}/\d{1,2}/\d{2,4},?\s+\d{1,2}:\d{2}\s+', '', line)
        line = re.sub(r'(?i)^sailwave results for\s+', '', line)
        line = re.sub(r'(?i)\s+at\s+\d{4}\s*$', '', line)
        if len(line) > 8 and re.search(kw, line) and not re.match(skip, line):
            return line[:120]
    for line in text.split('\n')[:12]:
        line = line.strip()
        if len(line) > 8 and not line[0].isdigit() and 'http' not in line.lower():
            return line[:120]
    return 'Imported Regatta'

def extract_discards(text):
    """Read the discard count from a header/metadata line ("Discards: 1").

    Returns 0 when there's no discard indicator — the bracket-count logic in
    _discards_from_brackets() is the primary signal and will override this from
    the actual results; this header number is only a fallback. We never default
    to a non-zero discard count without evidence (genuinely no-discard regattas
    must stay at 0)."""
    m = re.search(r'[Dd]iscard[^:]*[:\s]+(?:Global[:\s]+)?(\d+)', text)
    return int(m.group(1)) if m else 0

def extract_date(text):
    months = {
        'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
        'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12,
    }
    s = text[:3000]
    patterns = [
        (r'[Aa]s\s+[Oo]f\s+[\d:]+\s+[Oo]n\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})', 'mdy'),
        (r'[Aa]s\s+[Oo]f\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})', 'dmy'),
        (r'[Aa]s\s+[Oo]f\s+(\d{1,2})/(\d{1,2})/(\d{4})', 'dmy_num'),
        (r'[Pp]rovisional.*?(\d{1,2})[/.](\d{1,2})[/.](\d{4})', 'dmy_num'),
        (r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b', 'dmy_num'),
        (r'\b(\d{4})-(\d{2})-(\d{2})\b', 'iso'),
    ]
    for pat, fmt in patterns:
        m = re.search(pat, s, re.IGNORECASE | re.DOTALL)
        if not m:
            continue
        a, b, c = m.group(1), m.group(2), m.group(3)
        try:
            if fmt == 'mdy':
                mo = months.get(a[:3].lower())
                if mo: return f"{int(b):02d}/{mo:02d}/{c}"
            elif fmt == 'dmy':
                mo = months.get(b[:3].lower())
                if mo: return f"{int(a):02d}/{mo:02d}/{c}"
            elif fmt == 'dmy_num':
                return f"{int(a):02d}/{int(b):02d}/{c}"
            elif fmt == 'iso':
                return f"{int(c):02d}/{int(b):02d}/{a}"
        except (ValueError, AttributeError):
            continue
    return ''

_MONTHS = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
           'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}

def _textual_date(text):
    """Parse a textual 'D [& D] Month YYYY' (e.g. '9 & 10 September 2017') into
    dd/mm/yyyy, taking the LAST day of a range. Deliberately NOT part of
    extract_date's global pattern list (it would re-date other formats' baselines
    off stray in-text dates); callers opt in via a date_hint."""
    m = re.search(r'\b(\d{1,2})(?:\s*[&\-–to]+\s*(\d{1,2}))?\s+'
                  r'([A-Za-z]{3,9})\s+(\d{4})\b', text or '', re.IGNORECASE)
    if not m:
        return ''
    day = m.group(2) or m.group(1)
    mo = _MONTHS.get(m.group(3)[:3].lower())
    if not mo:
        return ''
    try:
        return f"{int(day):02d}/{mo:02d}/{m.group(4)}"
    except ValueError:
        return ''

# ── column mapping ─────────────────────────────────────────────────────────
def detect_cols(header_rows):
    """Accept one or two header rows (manage2sail has a split header)."""
    if not header_rows:
        return {}
    if isinstance(header_rows[0], (list, tuple)):
        n = max(len(r) for r in header_rows)
        merged = []
        for i in range(n):
            cells = [str(r[i] or '').strip() if i < len(r) else '' for r in header_rows]
            non_empty = [c for c in cells if c]
            # If any single cell is already a race header on its own, use it directly
            # (avoids 'Points per Race O1' swallowing the O1 race column identity)
            race_cells = [c for c in non_empty if is_race_hdr(c)]
            if race_cells:
                merged.append(race_cells[0])
            else:
                merged.append(' '.join(non_empty))
    else:
        merged = header_rows

    cols = {}
    for i, cell in enumerate(merged):
        h = hdr_key(cell)
        if h in ('rank','rk','rk.','pos','pl','place','position','#'):
            cols.setdefault('rank', i)
        elif h in ('helmname','helm','helmsname','skipper'):
            cols.setdefault('helm', i)
        elif h in ('crewname','crew','crewsname','mate'):
            cols['crew'] = i
        elif h in ('sailors','name','helmcrew','name(s)','helmandsailors','team'):
            # Sailwave-native "Team" holds the stacked helm/crew names.
            cols.setdefault('sailors', i)
        elif h in ('sailno','sail','sailnum','sailnumber','no','boatno','number'):
            cols.setdefault('sail', i)
        elif h in ('division','div','category','agegroup','agecategory','agecat',
                   'group','catgory'):
            cols.setdefault('category', i)
        elif h in ('class','boat','type','boatclass','boattype'):
            # A per-row "Class"/"Boat"/"Type" column: the class is read PER ROW
            # (mixed-handicap / multi-class events). Tracked as its own column
            # (row_class) and also as div so genuine multi-class tables still
            # split; an Open/handicap division clears div but keeps row_class.
            cols.setdefault('rowclass', i)
            cols.setdefault('div', i)
        elif h in ('fleet','dinghyclassfleet','dinghyclass/fleet','fleetclass',
                   'fleet/class','dinghyclass'):
            cols.setdefault('div', i)
        elif h in ('gender','sex','boatgender','gender(skipper)','genderskipper',
                   'gendersksipper','helmgender','skippergender','helmsex',
                   'skippersex','sexskipper'):
            cols.setdefault('gender', i)
        elif h in ('crewgender','gender(crew)','gendercrew','crewsex','sexcrew'):
            cols['crewgender'] = i
        elif h in ('nat','nationality','country','sailnationalletter','nationalletter'):
            cols.setdefault('nat', i)
        elif h in ('club','clubs','clubname','club/association','clubassociation','club/org'):
            cols.setdefault('club', i)
        elif h in ('total','totalpts','totalpoints','pts','points','totalpts.'):
            cols['total'] = i
        elif h in ('nett','net','netpts','netpoints','nettpts','nettpoints','nett.',
                   'netpts.','netpoints','score'):
            # pya-events uses a single "Score" column for the net total.
            cols['net'] = i
        elif h in ('yob','yearofbirth','birthyear','born','dob','helmyob'):
            cols.setdefault('yob', i)
        elif h in ('crewyob','crewyearofbirth','crewbirthyear','crewborn','crewdob'):
            cols['crewyob'] = i
        elif h in ('age','optiage','helmage','years'):
            cols.setdefault('age', i)
        elif h in ('crewage',):
            cols['crewage'] = i
        elif h in ('cf','cfps','ps','carryforward','cfpts'):
            # Sailti carry-forward / points-situation columns are cumulative,
            # NOT individual races — mark them to skip in the race loop.
            cols.setdefault('_skip', set()).add(i)
        if is_race_hdr(cell):
            cols.setdefault('race_start', i)
            cols['race_end'] = i
    # A lone "Crew" column (no Helm/Name/Sailors) actually holds both sailors —
    # treat it as the combined names column (Sailti "Crew", some 49er pages).
    if 'crew' in cols and 'helm' not in cols and 'sailors' not in cols:
        cols['sailors'] = cols.pop('crew')
    return cols

# ── row parsing ────────────────────────────────────────────────────────────
def parse_row_with_cols(row, cols, open_division=False):
    def get(key, default=''):
        idx = cols.get(key)
        if idx is None or idx >= len(row):
            return default
        return str(row[idx] or '').strip()

    helm_raw = get('helm')
    crew_raw = get('crew')
    sail_raw = get('sail')
    nat_raw  = get('nat')
    div_raw  = re.sub(r'\s+', ' ', get('div')).strip()
    cat_raw  = get('category')
    # Per-row boat class from a "Class"/"Boat"/"Type" column (mixed-handicap
    # divisions). Kept on every entry so the frontend can create custom classes.
    row_class = re.sub(r'\s+', ' ', get('rowclass')).strip()

    # Gender: prefer a boat/skipper gender column; else combine helm + crew gender.
    gender = norm_gender(get('gender'))
    if 'crewgender' in cols:
        gender = combine_boat_gender(get('gender'), get('crewgender'))
    # Sailwave often packs gender into the Division column ("Junior, Men",
    # "Women", "Mixed") with no separate gender column — recover it here.
    if not gender and 'gender' not in cols:
        gender = gender_from_text(cat_raw) or gender_from_text(div_raw)
    category = norm_category(cat_raw)

    # A "Fleet"/"Division" column sometimes holds an age group ("U23") or a
    # placeholder ("---") rather than a real boat class. Route those away from
    # div (which drives grouping); keep any other label as a genuine fleet name.
    if div_raw in ('---', '--', '—', '–', '-', 'n/a', 'N/A'):
        div_raw = ''
    elif div_raw and not _looks_like_class(div_raw) and norm_category(div_raw):
        if not category:
            category = norm_category(div_raw)
        div_raw = ''

    # FINAL fleet routing: a "Division" column may name a BOAT CLASS / scoring
    # FLEET ("Optimist Intermediate Fleet", "2.4 mR", "Laser Radial", "Waszp")
    # rather than a demographic group. When there's no separate fleet column, use
    # the RAW value as the fleet key (div) so the event splits per class. Runs
    # last so the demotion above can't strip an unrecognised-but-valid class.
    if not div_raw and cat_raw and _looks_like_fleet_label(cat_raw):
        div_raw  = re.sub(r'\s+', ' ', cat_raw).strip()
        category = ''

    # Mixed-handicap "Open Division": every boat is a different class but they all
    # race as ONE fleet — never split by the per-row class. Clear div (the section
    # label fills it uniformly later) while keeping row_class as a tag.
    if open_division:
        div_raw = ''

    if 'sailors' in cols and not helm_raw and 'crew' not in cols:
        # A single combined "Name" column with NO separate crew column → split
        # it into helm + crew (SailingResults.net, some 49er.org pages).
        helm_raw, crew_raw = split_combined_names(get('sailors'))
    else:
        # Dedicated columns. "Name" is the helm when a separate "Crew" column
        # exists (manage2sail, pya.org.pl); otherwise use the helm column.
        if not helm_raw and 'sailors' in cols:
            helm_raw = get('sailors')
        helm_src = helm_raw
        if helm_raw:
            helm_raw = join_wrapped(helm_raw)
        if crew_raw:
            crew_raw = join_wrapped(crew_raw)
        # A helm cell that itself stacks two people, with no crew column at all
        # (manage2sail combined-in-one-column variant).
        if helm_raw and '\n' in helm_src and not crew_raw and 'crew' not in cols:
            h, c = split_combined_names(helm_src)
            helm_raw, crew_raw = h, c

    extracted_nat, clean_sail = parse_sail_country(sail_raw)
    if not nat_raw and extracted_nat:
        nat_raw = extracted_nat

    race_start = cols.get('race_start')
    race_end   = cols.get('race_end')
    races = []
    race_codes = []  # parallel array: code annotation when a numeric score had a code label
    _disc_count = 0  # number of bracketed (discarded) scores in this row
    if race_start is not None and race_end is not None:
        skip_cols = {cols.get('total'), cols.get('net')} | set(cols.get('_skip', set()))
        for i in range(race_start, race_end + 1):
            if i >= len(row) or i in skip_cols:
                continue
            sc, code_ann = clean_score_with_code(row[i])
            if sc is not None:
                races.append(sc)
                race_codes.append(code_ann)  # None for plain scores, "STP" etc for annotated
                # A score wrapped in parentheses is a discard, e.g. "(7)" or
                # "(28) DNF". Count them so the event's discard total can be read
                # from the results themselves, not a header rule label.
                if re.match(r'^\s*\(', str(row[i] or '')):
                    _disc_count += 1

    # Extract PDF rank (first column) and net score (last meaningful column)
    # Get rank from dedicated column, or fall back to first column
    if 'rank' in cols:
        rank_raw = get('rank')
    else:
        rank_raw = str(row[0] or '').strip() if row else ''

    # Strip ordinal suffixes ("1st" → "1", "42nd" → "42") then parse
    rank_raw = re.sub(r'(st|nd|rd|th)$', '', rank_raw.strip(), flags=re.IGNORECASE)

    pdf_rank = None
    if rank_raw:
        try:
            pdf_rank = int(rank_raw)
        except ValueError:
            pass

    # Extract net score from the net column if present
    pdf_net = None
    if 'net' in cols:
        net_raw = get('net')
        if net_raw:
            try:
                pdf_net = float(net_raw)
                if pdf_net == int(pdf_net):
                    pdf_net = int(pdf_net)
            except ValueError:
                pass

    # ── Birth year / age extraction ──
    def _year(v):
        m = re.search(r'\b(19[3-9]\d|20[0-2]\d)\b', str(v or ''))
        return int(m.group(0)) if m else None
    def _age(v):
        m = re.search(r'\b(\d{1,2})\b', str(v or ''))
        n = int(m.group(0)) if m else None
        return n if (n is not None and 5 <= n <= 99) else None

    birth_year      = _year(get('yob'))
    crew_birth_year = _year(get('crewyob'))
    age_h           = _age(get('age'))
    age_c           = _age(get('crewage'))

    # Manage2sail / combined-cell birth years e.g. "Seb Menzies (2005)" — the
    # name cleaner strips these, so capture them here before they're lost.
    if birth_year is None or crew_birth_year is None:
        src = get('sailors') if 'sailors' in cols else get('helm')
        yrs = re.findall(r'\b(19[3-9]\d|20[0-2]\d)\b', str(src or ''))
        if yrs:
            if birth_year is None:
                birth_year = int(yrs[0])
            if crew_birth_year is None and len(yrs) > 1:
                crew_birth_year = int(yrs[1])

    return {
        'helm':       clean_name(helm_raw),
        'crew':       clean_name(crew_raw),
        'sail':       clean_sail or '—',
        'nat':        flag_from_ioc(nat_raw),
        'div':        div_raw,
        'row_class':  row_class,
        'gender':     gender,
        'category':   category,
        'races':      races,
        'race_codes': race_codes,
        '_disc':      _disc_count,
        'pdf_rank':   pdf_rank,
        'pdf_net':    pdf_net,
        'birth_year':      birth_year,
        'crew_birth_year': crew_birth_year,
        '_age': age_h, '_crew_age': age_c,   # resolved to birth_year once event year is known
    }

# ── table parser ───────────────────────────────────────────────────────────
def parse_table(tbl, fleet_hint=''):
    if not tbl or len(tbl) < 2:
        return None

    # Find header row(s)
    header_end = None
    header_rows = None
    for idx, row in enumerate(tbl[:6]):
        text = ' '.join(fix_doubled(str(c or '')) for c in row).lower()
        if any(k in text for k in ('helm', 'name', 'sailor', 'rank', 'rk', 'pos')):
            # Check for two-row header (manage2sail)
            if idx + 1 < len(tbl):
                # Two-row header only for manage2sail: second row is ONLY race-col headers (O1,F1...)
                next_row = tbl[idx+1]
                next_non_empty = [str(c).strip() for c in next_row if str(c or '').strip()]
                import re as _re
                is_pure_race_row = bool(next_non_empty) and all(is_race_hdr(c) for c in next_non_empty)
                if is_pure_race_row:
                    header_rows = [tbl[idx], tbl[idx+1]]
                    header_end  = idx + 2
                else:
                    header_rows = [tbl[idx]]
                    header_end  = idx + 1
            else:
                header_rows = [tbl[idx]]
                header_end  = idx + 1
            break

    if header_end is None:
        header_rows = [tbl[0]]
        header_end  = 1

    cols = detect_cols(header_rows)

    has_name  = ('helm' in cols or 'sailors' in cols)
    has_races = ('race_start' in cols)
    if not (has_name and has_races):
        return None

    # Recover an UNLABELLED age-category column. Some exports (e.g. the Sailwave
    # 'Group' column in the ILCA Youth Worlds) render category values — U16/U18 —
    # under a blank header cell, so detect_cols never maps them. If no category
    # column was found, scan the body for an unclaimed column whose non-empty
    # values are overwhelmingly bare age tokens and adopt it, so the per-row
    # division survives (it was silently dropped before).
    if 'category' not in cols:
        claimed = set()
        for _k, _v in cols.items():
            if isinstance(_v, int):
                claimed.add(_v)
            elif _k == '_skip' and isinstance(_v, set):
                claimed |= _v
        _rs, _re = cols.get('race_start'), cols.get('race_end')
        if _rs is not None and _re is not None:
            claimed |= set(range(_rs, _re + 1))
        _body  = tbl[header_end:]
        _width = max((len(r) for r in _body if r), default=0)
        _best_idx, _best_hits = None, 0
        for _ci in range(_width):
            if _ci in claimed:
                continue
            _vals = [str(r[_ci]).strip() for r in _body
                     if _ci < len(r) and str(r[_ci] or '').strip()]
            if len(_vals) < 2:
                continue
            _hits = sum(1 for v in _vals if _is_age_cat_token(v))
            if _hits >= 2 and _hits >= 0.8 * len(_vals) and _hits > _best_hits:
                _best_idx, _best_hits = _ci, _hits
        if _best_idx is not None:
            cols['category'] = _best_idx

    # An "Open Division" / handicap / PY section is ONE fleet of mixed classes —
    # tell the row parser not to split it by its per-row class column.
    open_division = _is_open_division(fleet_hint)

    entries = []
    for row in tbl[header_end:]:
        if not row or not any(str(c or '').strip() for c in row):
            continue
        first = fix_doubled(str(row[0] or '')).strip().lower()
        if first in ('rank','rk','pos','pl','name','helm','helmname','sailor'):
            continue
        if len([c for c in row if str(c or '').strip()]) < 3:
            continue
        e = parse_row_with_cols(row, cols, open_division=open_division)
        if not e['helm'] or not e['races']:
            continue
        if fleet_hint and not e['div']:
            e['div'] = fleet_hint
        e['_tbl_class'] = _class_of(fleet_hint)   # class from the section heading
        e['_nat_col']   = ('nat' in cols)         # a Nat column existed for this row
        entries.append(e)

    return {'entries': entries} if entries else None

# ── excel-print-pdf (Excel sheets printed to PDF) ───────────────────────────
# Header-cell text seen in these club sheets → the canonical label detect_cols
# already understands. A pre-processing shim, NOT a new line parser: we clean the
# header row and drop merged-title rows, then hand the table to parse_table.
_EXCEL_HDR_MAP = {
    'no': 'Rank', 'no.': 'Rank', 'pos': 'Rank', 'place': 'Rank', 'rank': 'Rank',
    'skipper': 'Helm', 'skippername': 'Helm', "skipper'sname": 'Helm',
    'helm': 'Helm', 'helmname': 'Helm', "helm'sname": 'Helm',
    'crew': 'Crew', 'crewname': 'Crew', "crew'sname": 'Crew',
    'sailnumber': 'Sail', 'sailno': 'Sail', 'sailno.': 'Sail', 'sail': 'Sail',
    'club': 'Club', 'boatclub': 'Club',
    'nettotal': 'Nett', 'nett': 'Nett', 'net': 'Nett', 'net total': 'Nett',
    'total': 'Total', 'totalpts': 'Total',
    'dinghy': 'Class', 'class': 'Class',
}
# Header keys that identify a real (non-title) header row.
_EXCEL_HDR_KEYS = {'no', 'no.', 'rank', 'pos', 'place', 'skipper', 'skippername',
                   'helm', 'helmname', 'crew', 'crewname', 'sail', 'sailno',
                   'sailnumber', 'club', 'class', 'dinghy', 'total', 'nett',
                   'net', 'nettotal'}

def _excel_is_titleish(row):
    """A merged-title row: ≤2 non-empty cells AND none of them is a header key or
    a race header (so a genuine header row is never mistaken for a title)."""
    non_empty = [str(c).strip() for c in row if str(c or '').strip()]
    if len(non_empty) > 2:
        return False
    for c in non_empty:
        if hdr_key(c) in _EXCEL_HDR_KEYS or is_race_hdr(c):
            return False
    return True

def _excel_normalise_header(header):
    """Rewrite header cells to canonical labels parse_table's detect_cols reads.
    'Discard'/'1 Discard' and 'Place' (when a rank col exists) are cleared so
    they don't get mistaken for a race/rank column — the discard info already
    lives in the race cells' brackets."""
    out = []
    has_rank = any(hdr_key(c) in ('no', 'no.', 'rank', 'pos') for c in header)
    for c in header:
        k = hdr_key(c)
        if re.search(r'discard', str(c or ''), re.IGNORECASE):
            out.append('')                         # drop the discarded-score column
        elif k == 'place' and has_rank:
            out.append('')                         # redundant with the rank column
        elif k in _EXCEL_HDR_MAP:
            out.append(_EXCEL_HDR_MAP[k])
        else:
            out.append(c if c is not None else '')
    return out

def try_excel_print(all_tables, full_text, pdf_meta):
    """Pre-processing shim for Excel-printed-to-PDF club result sheets (ABC/HKSF
    office: GPL Ghostscript + PScript5; federation sheets: Microsoft Excel). The
    generic table path fails or mis-parses these because row 1 is a merged 2-line
    title cell, the rank header may be blank, and columns use labels detect_cols
    doesn't know ('Skipper Name', 'Net total', '1 Discard', 'Place'). We strip
    the title rows, normalise the header, then feed the cleaned tables straight
    through the existing parse_table. Returns (entries, event_name) or (None,'')."""
    prod  = _meta_get(pdf_meta, 'Producer').lower()
    title = _meta_get(pdf_meta, 'Title').lower()
    is_family = ('gpl ghostscript' in prod or 'pscript5' in prod
                 or 'microsoft® excel®' in prod or 'microsoft(r) excel' in prod
                 or title.endswith('.xls') or title.endswith('.xlsx'))
    if not is_family or not all_tables:
        return None, ''

    ev_name = ''
    all_ents = []
    last_header = None                     # carried forward to header-less pages
    for tbl in all_tables:
        if not tbl or len(tbl) < 1:
            continue
        # Strip leading merged-title rows; remember the first as the event name.
        rows = list(tbl)
        while rows and _excel_is_titleish(rows[0]):
            cell = next((str(c).strip() for c in rows[0] if str(c or '').strip()), '')
            if cell and not ev_name:
                # A merged title cell often stacks 'Event\nSub-result' — take the
                # first line as the event name.
                ev_name = re.sub(r'\s+', ' ', cell.split('\n')[0]).strip()
            rows = rows[1:]
        if not rows:
            continue
        # Find the header row (first row carrying ≥2 header keys) and normalise it.
        hidx = None
        for i, r in enumerate(rows[:3]):
            if sum(1 for c in r if hdr_key(c) in _EXCEL_HDR_KEYS) >= 2:
                hidx = i; break
        if hidx is None:
            # A continuation table on a later page has no header — reuse the last
            # one when the widths line up; otherwise skip (legend/notes tables).
            if last_header is None or len(rows[0]) != len(last_header):
                continue
            header = last_header
            data = rows
        else:
            header = _excel_normalise_header(rows[hidx])
            last_header = header
            data = rows[hidx + 1:]
        # Drop legend rows (e.g. 'OCS DNS DNF RET' spelling out penalty codes) —
        # no rank and every cell is a bare code.
        body = []
        for r in data:
            vals = [str(c).strip() for c in r if str(c or '').strip()]
            if vals and all(re.sub(r'[^A-Z]', '', v.upper()) in CODES for v in vals):
                continue
            body.append(r)
        parsed = parse_table([header] + body, '')
        if parsed and parsed['entries']:
            all_ents.extend(parsed['entries'])
    return (all_ents or None), ev_name

# ── Clubspot ───────────────────────────────────────────────────────────────
def try_clubspot(full_text):
    sailors_match = re.search(r'\bSAILORS\b', full_text, re.IGNORECASE)
    if not sailors_match:
        return None

    sailors_text = full_text[sailors_match.end():]
    name_lines = []
    for line in sailors_text.split('\n'):
        line = line.strip()
        if not line or re.search(r'[\d/:]', line) or 'http' in line.lower():
            continue
        if re.match(r'^[A-Z][a-z]', line):
            name_lines.append(line)

    sailors = []
    i = 0
    while i + 1 < len(name_lines):
        first = name_lines[i]
        last  = name_lines[i+1]
        if re.match(r'^[A-Z][a-z]+$', first) and re.match(r'^[A-Z][a-z]+', last):
            sailors.append(f"{first} {last}")
            i += 2
        else:
            i += 1

    rows = []
    main_text = full_text[:sailors_match.start()]
    for line in main_text.split('\n'):
        line = line.strip()
        if re.match(r'^(\d+)\s+([A-Z]{3}\s+\d+|\d+)', line):
            rows.append(line)

    entries = []
    for i2, row in enumerate(rows):
        parts = row.split()
        nat = ''; sail = '—'
        if len(parts) >= 3 and re.match(r'^[A-Z]{3}$', parts[1]) and parts[2].isdigit():
            nat, sail = parts[1], parts[2]
        elif len(parts) >= 2:
            _, sail = parse_sail_country(parts[1])
        score_vals = [clean_score(p) for p in parts[2:] if clean_score(p) is not None]
        helm = sailors[i2*2]     if i2*2 < len(sailors) else ''
        crew = sailors[i2*2+1]   if i2*2+1 < len(sailors) else ''
        if score_vals:
            entries.append({'helm':helm,'crew':crew,'sail':sail,'nat':nat,'div':'','gender':'','category':'','races':score_vals,'race_codes':[None]*len(score_vals),'pdf_rank':i2+1,'pdf_net':None})

    return entries if entries else None

# ── Text-line parsers (raw extract_text, not pdfplumber tables) ──────────────
# Some formats defeat pdfplumber's table grid (SailingResults.net spreads one
# boat over several visual lines; multi-page flighted Sailwave shatters into
# dozens of 1-row fragments). For these the *raw text lines* are clean, so we
# reconstruct rows from them. These run only as signature-gated fallbacks (see
# _rule_based_parse) so the table path for clean Sailwave/manage2sail is untouched.

_SCORE_RE = re.compile(r'^\(?-?\d+(?:\.\d+)?\)?$')
_SCORE_CODES = {'UFD','DNF','DNS','DNC','OCS','BFD','RET','DSQ','DNE','RDG',
                'ZFP','NSC','SCP','STP','DPI','DGM'}

def _trailing_score_run(toks):
    n = 0
    for t in reversed(toks):
        if _SCORE_RE.match(t):
            n += 1
        else:
            break
    return n

def _leading_name_pair(toks):
    """A forename (Titlecase, ≥1 token) followed by an ALL-CAPS surname.
    Returns 'Forename SURNAME' or '' if the run doesn't form a name."""
    fore = []
    for t in toks:
        if re.match(r"^[A-Z][a-z][A-Za-z'’-]*$", t):
            fore.append(t)
        elif re.match(r"^[A-Z][A-Z'’-]+$", t) and len(t) >= 2 and fore:
            return ' '.join(fore + [t])
        else:
            if fore:
                break
    return ''

def _text_line_entry(rank, helm, crew, sail, nat, div, race_tokens, net_token=None):
    races, race_codes, disc = [], [], 0
    for tok in race_tokens:
        sc, code = clean_score_with_code(tok)
        if sc is not None:
            races.append(sc); race_codes.append(code)
            if str(tok).strip().startswith('('):
                disc += 1
    ex_nat, clean_sail = parse_sail_country(str(sail or ''))
    if not nat and ex_nat:
        nat = ex_nat
    pdf_net = None
    if net_token is not None:
        try:
            v = float(str(net_token).strip('()'))
            pdf_net = int(v) if v == int(v) else v
        except (ValueError, TypeError):
            pass
    return {
        'helm': clean_name(helm), 'crew': clean_name(crew),
        'sail': clean_sail or '—', 'nat': flag_from_ioc(nat),
        'div': div, 'row_class': '', 'gender': '', 'category': '',
        'races': races, 'race_codes': race_codes, '_disc': disc,
        'pdf_rank': rank, 'pdf_net': pdf_net,
        'birth_year': None, 'crew_birth_year': None, '_age': None, '_crew_age': None,
    }

def try_sailingresults(full_text):
    """SailingResults.net: rank + (Forename SURNAME) + boat + sail + club + races
    + Total + Net on one line, with the crew (and sometimes the helm) on the
    following continuation line(s). Two sailors per boat (49er/49erFX etc.)."""
    if 'sailingresults.net' not in full_text.lower():
        return None
    raw = full_text.split('\n')
    cm = re.search(r'(?:Overall\s+)?Results?\s*[-–—]\s*([0-9A-Za-z][0-9A-Za-z ]*)', full_text)
    div = re.sub(r'\s+', ' ', cm.group(1)).strip() if cm else ''

    helm_idx = []
    for i, l in enumerate(raw):
        toks = l.split()
        if toks and toks[0].isdigit() and _trailing_score_run(toks) >= 5:
            helm_idx.append(i)

    entries = []
    for j, i in enumerate(helm_idx):
        toks = raw[i].split()
        tr = _trailing_score_run(toks)
        scores = toks[len(toks) - tr:]
        if len(scores) < 3:
            continue
        races, total, net = scores[:-2], scores[-2], scores[-1]
        middle = toks[1:len(toks) - tr]
        sail, sidx = '', None
        for k, t in enumerate(middle):
            if re.match(r'^\d{1,6}$', t):
                sail, sidx = t, k; break
        left = middle[:sidx] if sidx is not None else middle
        names = []
        nm = _leading_name_pair(left)
        if nm:
            names.append(nm)
        end = helm_idx[j + 1] if j + 1 < len(helm_idx) else len(raw)
        for k in range(i + 1, end):
            low = raw[k].lower()
            if not raw[k].strip() or 'sailingresults' in low or 'http' in low or low.startswith('created'):
                continue
            nm = _leading_name_pair(raw[k].split())
            if nm:
                names.append(nm)
        if not names:
            continue
        helm = names[0]
        crew = names[1] if len(names) > 1 else ''
        entries.append(_text_line_entry(int(toks[0]), helm, crew, sail, '', div, races, net))
    return entries or None

def try_sailwave_text(full_text):
    """Multi-page / flighted Sailwave where the table grid shatters. Each entry
    line starts with an ordinal rank ("1st"); wrapped surnames and score codes
    spill onto the next line. Single-handed layout (Optimist etc.)."""
    low = full_text.lower()
    if 'sailwave results for' not in low and not re.search(r'sailed:\s*\d+.*entries:\s*\d+', low):
        return None
    raw = full_text.split('\n')
    ORD = re.compile(r'^(\d+)(?:st|nd|rd|th)$', re.IGNORECASE)
    NAT = re.compile(r'^[A-Z]{3}$')
    _HDR = {'rank','bow','sail','helmname','helm','prefix','age','opti','total',
            'nett','no','no.','#','flight','fleet','sailed','discards','entries',
            'scoring','provisional','results','sailwave','of','at'}

    helm_idx = [i for i, l in enumerate(raw)
                if l.split() and ORD.match(l.split()[0]) and _trailing_score_run(l.split()) >= 3]

    entries = []
    for j, i in enumerate(helm_idx):
        toks = raw[i].split()
        rank = int(ORD.match(toks[0]).group(1))
        net, total = toks[-1], toks[-2]
        sail = toks[2] if len(toks) > 2 else ''
        nidx = None
        for k in range(3, len(toks) - 2):
            if NAT.match(toks[k]):
                nidx = k; break
        if nidx is not None:
            name_toks = toks[3:nidx]
            races = toks[nidx + 2:-2]          # skip the age column after nat
            nat = toks[nidx]
        else:
            sidx = next((k for k in range(3, len(toks)) if _SCORE_RE.match(toks[k])), len(toks) - 2)
            name_toks, races, nat = toks[3:sidx], toks[sidx:-2], ''
        # Continuation lines: append genuine wrapped name fragments only.
        end = helm_idx[j + 1] if j + 1 < len(helm_idx) else len(raw)
        extra = []
        for k in range(i + 1, end):
            line = raw[k]
            if not line.strip() or re.search(r'[\d:]', line):
                continue
            lt = line.split()
            if any(t.strip('.').lower() in _HDR for t in lt):
                continue
            for t in lt:
                if re.match(r"^[A-Za-z][A-Za-z'’-]+$", t) and t.upper() not in _SCORE_CODES:
                    extra.append(t)
        helm = ' '.join(name_toks + extra).strip()
        if not helm:
            continue
        entries.append(_text_line_entry(rank, helm, '', sail, nat, '', races, net))
    return entries or None

def try_sailwave_geometry(pdf_bytes):
    """Two-person Sailwave (29er / 49er / 49erFX / Nacra): a helm+crew boat spans
    several lines — helm + first club line on the rank line, crew + wrapped
    name/club stacked below, Nat on the second line. pdfplumber's flat text
    interleaves these columns unusably, so we parse by WORD X-POSITION: read the
    'Rank Tally Fleet Nat Sail Boat Division Helm Club Sponsor … Total Nett'
    header to fix each column's x, assign every word to a column, then take helm
    from the rank line and crew from the lines below (same Helm/Crew column).
    Fleet colour splits (1-Gold, 2-Silver, …) are tagged as div and merged
    downstream. Gated on a Helm+Crew header, so single-hander Sailwave is
    untouched."""
    if pdfplumber is None:
        return None
    import bisect
    NUM = re.compile(r'^\(?-?\d+(?:\.\d+)?\)?$')
    COLOUR = re.compile(r'(\d+\s*-\s*)?(Gold|Silver|Bronze|Emerald|Sapphire)\s*Fleet', re.IGNORECASE)
    entries = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        # Confirm this is the two-person template before doing anything.
        head_probe = ' '.join(fix_doubled(w) for w in
                              re.findall(r'\S+', (pdf.pages[0].extract_text() or '')))
        if 'Helm' not in head_probe or 'Crew' not in head_probe or 'Tally' not in head_probe:
            return None
        anchors = None            # {col_name: x0} from the most recent header
        current_fleet = ''
        for page in pdf.pages:
            words = page.extract_words()
            from collections import defaultdict
            rows = defaultdict(list)
            for w in words:
                rows[round(w['top'])].append(w)
            tops = sorted(rows)
            for i, t in enumerate(tops):
                line = sorted(rows[t], key=lambda x: x['x0'])
                texts = [fix_doubled(w['text']) for w in line]
                joined = ' '.join(texts)
                # Fleet section header (e.g. "1-Gold Fleet")
                cm = COLOUR.search(joined)
                if cm and len(line) <= 4:
                    current_fleet = re.sub(r'\s+', ' ', cm.group(0)).strip()
                    continue
                # Column header row → (re)learn anchors
                if 'Rank' in texts and 'Helm' in texts and 'Nett' in texts:
                    a = {}
                    for w in line:
                        a[fix_doubled(w['text'])] = w['x0']
                    anchors = a
                    continue
                if not anchors:
                    continue
                # Is this a rank (block-start) line? integer left of the Tally col
                tally_x = anchors.get('Tally', 60)
                rank_word = next((w for w in line
                                  if re.match(r'^\d+$', w['text']) and w['x0'] < tally_x), None)
                if not rank_word:
                    continue
                # Gather this competitor's block: this line + following lines
                # until the next rank line (or page end).
                block = [(t, line)]
                for t2 in tops[i + 1:]:
                    l2 = sorted(rows[t2], key=lambda x: x['x0'])
                    if next((w for w in l2 if re.match(r'^\d+$', w['text']) and w['x0'] < tally_x), None):
                        break
                    if COLOUR.search(' '.join(fix_doubled(w['text']) for w in l2)):
                        break
                    block.append((t2, l2))

                def col_range(name, nxt):
                    lo = anchors.get(name)
                    hi = anchors.get(nxt)
                    return (lo, hi)

                helm_lo, helm_hi = col_range('Helm', 'Club')
                nat_lo,  nat_hi  = col_range('Nat', 'Sail')
                sail_lo, sail_hi = col_range('Sail', 'Boat')
                boat_lo, boat_hi = col_range('Boat', 'Division')
                div_lo,  div_hi  = col_range('Division', 'Helm')
                race_lo = anchors.get('F1') or anchors.get('Club')
                cf_x    = anchors.get('CarriedFwd') or anchors.get('Total')
                if helm_lo is None or helm_hi is None:
                    continue

                def in_col(w, lo, hi):
                    return lo is not None and hi is not None and (lo - 4) <= w['x0'] < (hi - 4)

                helm = ' '.join(w['text'] for w in line if in_col(w, helm_lo, helm_hi))
                crew_parts = []
                for (_, l2) in block[1:]:
                    seg = ' '.join(w['text'] for w in l2 if in_col(w, helm_lo, helm_hi))
                    if seg:
                        crew_parts.append(seg)
                crew = ' '.join(crew_parts)
                nat = ''
                for (_, l2) in block:
                    for w in l2:
                        if re.match(r'^[A-Z]{3}$', w['text']) and in_col(w, nat_lo, nat_hi):
                            nat = w['text']; break
                    if nat:
                        break
                sail = ' '.join(w['text'] for w in line if in_col(w, sail_lo, sail_hi)).strip()
                gender_raw = ' '.join(w['text'] for w in line if in_col(w, boat_lo, boat_hi))
                div_raw = ' '.join(w['text'] for w in line if in_col(w, div_lo, div_hi))
                # numeric columns on the rank line
                nums = [w for w in line if NUM.match(w['text']) and w['x0'] >= (race_lo - 6 if race_lo else 380)]
                nums.sort(key=lambda x: x['x0'])
                if len(nums) < 2:
                    continue
                net_tok = nums[-1]['text']
                race_toks = [w['text'] for w in nums[:-2]
                             if cf_x is None or w['x0'] < cf_x - 4]
                e = _text_line_entry(int(rank_word['text']), helm, crew, sail, nat,
                                     current_fleet, race_toks, net_tok)
                g = norm_gender(gender_raw)
                if g:
                    e['gender'] = g
                if div_raw.strip():
                    e['category'] = norm_category(div_raw)
                entries.append(e)
    return entries or None

def try_sailti(full_text):
    """Sailti Scoring Soft results (TCPDF 'HTML2PDF'). One fleet, layout:
        Pos | NAT sail | SURNAME, Forename | Cat | race scores | TOTAL | NET
    The column header appears once (page 1); rows run continuously across pages
    (footer 'Sailti Scoring Soft  Page x/y'). Penalty-coded scores (STP, BFD,
    DNC, DNS, DSQ…) wrap onto the lines above/below the row, leaving that one
    cell blank on the row line — but Pos, name, sail, Cat, TOTAL and NET are
    always intact on the row line, so we anchor on those and read the row-line
    race cells best-effort (a wrapped cell is left blank for manual review)."""
    if 'sailti' not in full_text.lower():
        return None
    RACE = re.compile(r'^\(?-?\d+(?:\.\d+)?\)?$')
    CAT = {'M', 'W', 'F', 'X'}
    row_re = re.compile(r'^\s*\d+\s+[A-Z]{3}\s+\S')
    entries = []
    for l in full_text.split('\n'):
        if not row_re.match(l):
            continue
        toks = l.split()
        try:
            pos = int(toks[0])
        except ValueError:
            continue
        if not re.match(r'^[A-Z]{3}$', toks[1]) or len(toks) < 6:
            continue
        nat, sail, rest = toks[1], toks[2], toks[3:]
        ridx = next((k for k, t in enumerate(rest) if RACE.match(t)), None)
        if not ridx:                       # need ≥1 name token before races
            continue
        if rest[ridx - 1] in CAT:
            cat, name_toks = rest[ridx - 1], rest[:ridx - 1]
        else:
            cat, name_toks = '', rest[:ridx]
        tail = rest[ridx:]
        # TOTAL and NET are the last two numeric tokens; strip them off races.
        seen, cut = 0, len(tail)
        for i in range(len(tail) - 1, -1, -1):
            if RACE.match(tail[i]):
                seen += 1
                if seen == 2:
                    cut = i; break
        if seen < 2:
            continue
        race_tokens, net_tok = tail[:cut], tail[-1]
        name = ' '.join(name_toks)
        if ',' in name:                    # "SURNAME, Forename" → "Forename Surname"
            sur, _, fore = name.partition(',')
            name = (fore.strip() + ' ' + sur.strip()).strip()
        if not name:
            continue
        e = _text_line_entry(pos, name, '', sail, nat, '', race_tokens, net_tok)
        e['gender'] = 'F' if cat in ('W', 'F') else ('M' if cat == 'M' else '')
        entries.append(e)
    return entries or None

# ── sailti-web (scoring.sailti.com / SailOptimist browser prints) ───────────
_SAILTI_WEB_COLOURS = ('gold', 'silver', 'bronze', 'emerald', 'sapphire',
                       'yellow', 'blue', 'red', 'green', 'white')

def try_sailti_web(full_text, pdf_bytes=None):
    """scoring.sailti.com / SailOptimist live-results browser prints. The flat
    text reading order is jumbled — NAT sits over the sail number in the SAIL#
    cell, wrapped names interleave, and penalty codes (STP/BFD/UFD/DPI) and
    discarded scores stack on lines above/below the row. So parse by WORD
    X-POSITION: learn each column's x from the header (SAIL#, CREW=name, CAT,
    NET, TOTAL, and race headers 1Q…nF), then for each competitor block (rank
    line → next rank line) bucket every word into its column and read the race
    cells from all block lines. Category-filtered docs keep non-contiguous
    overall ranks (never renumbered). Returns entries or None."""
    if pdfplumber is None or not pdf_bytes:
        return None
    low = full_text.lower()
    if not re.search(r'last update:\s*\d', low):
        return None
    from collections import defaultdict
    RANK  = re.compile(r'^(\d{1,3})([A-Z]{3})?$')     # '9' or glued '122KOR'
    NAT3  = re.compile(r'^[A-Z]{3}$')
    SCORE = re.compile(r'^\(?-?\d+(?:\.\d+)?\)?$')
    CATOK = {'M', 'W', 'F', 'X'}
    entries = []

    def _is_code(txt):
        return re.sub(r'[^A-Z]', '', txt.upper()) in CODES

    # Left-rail / footer navigation chrome that can share the name column x.
    NAV = {'HOME', 'ENTRY', 'LIST', 'RESULTS', 'LIVE', 'ONB', 'NEWS',
           'GALLERY', 'NEW', 'FACEBOOK', 'INSTAGRAM', 'TWITTER', 'PRINT',
           'PDF', 'OUTPUT'}

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            if not words:
                continue
            rows = defaultdict(list)
            for w in words:
                rows[round(w['top'])].append(w)
            tops = sorted(rows)
            n = len(tops)

            # ── Learn stable per-page anchors: how many race columns, and the
            # name/sail column x. Header labels DON'T align with the data grid on
            # these responsive web prints (columns reflow per page), so we key on
            # the header only for the race COUNT and the name/sail x, and derive
            # the race-column CENTRES from the data rows themselves. ──
            n_races = 0
            name_x = sail_x = None
            for t in tops:
                line = sorted(rows[t], key=lambda x: x['x0'])
                by_txt = {w['text']: w['x0'] for w in line}
                rc = sum(1 for w in line if is_race_hdr(w['text']))
                if rc:
                    n_races = max(n_races, rc)
                if 'CREW' in by_txt:
                    name_x = by_txt['CREW']
                if 'SAIL' in by_txt:
                    sail_x = by_txt['SAIL']
            if not n_races or name_x is None:
                continue
            if sail_x is None:
                sail_x = name_x - 40

            # ── Detect rank lines and split each into (rank, nat, head-tokens).
            # A rank line's leftmost token is a rank (bare int or int glued to a
            # NAT) sitting left of the name column, followed by a trailing run of
            # ≥3 score-shaped tokens (NET + TOTAL + races on the line). ──
            def trailing_scores(line):
                run = []
                for w in reversed(line):
                    if SCORE.match(w['text']) or _is_code(w['text']):
                        run.append(w)
                    else:
                        break
                run.reverse()
                return run

            def is_rankline(idx):
                ln = sorted(rows[tops[idx]], key=lambda x: x['x0'])
                if not ln or not RANK.match(ln[0]['text']) or ln[0]['x0'] >= name_x - 8:
                    return False
                return len(trailing_scores(ln)) >= 3

            block_starts = [idx for idx in range(n) if is_rankline(idx)]
            if not block_starts:
                continue

            # ── Learn race-column CENTRES from the data: cluster the x-positions
            # of every rank line's race tokens (the trailing run minus NET+TOTAL).
            # A row with all races present pins all n_races centres. ──
            xs = []
            for sidx in block_starts:
                ln = sorted(rows[tops[sidx]], key=lambda x: x['x0'])
                run = trailing_scores(ln)
                races = run[2:] if len(run) >= 2 else []   # drop NET, TOTAL
                xs.extend(w['x0'] for w in races)
            race_x = []
            if xs:
                xs.sort()
                clusters = [[xs[0]]]
                for x in xs[1:]:
                    if x - clusters[-1][-1] <= 12:
                        clusters[-1].append(x)
                    else:
                        clusters.append([x])
                clusters.sort(key=len, reverse=True)
                centres = sorted(sum(c) / len(c) for c in clusters[:n_races])
                race_x = centres
            if not race_x:
                continue
            first_race_x = race_x[0]

            def nearest_race(x):
                best, bd = None, 1e9
                for ci, rx in enumerate(race_x):
                    d = abs(x - rx)
                    if d < bd:
                        bd, best = d, ci
                return best if bd <= 16 else None

            # A long name wraps so its FIRST line prints ABOVE the rank line (which
            # then carries no name token). Pull one such preceding orphan line into
            # the block; cap each block's range at the next block's true start so a
            # wrapped-above line is never double-counted.
            def has_name(line):
                return any(sail_x + 20 <= w['x0'] < first_race_x - 20
                           and re.search(r'[A-Za-z]', w['text'])
                           and w['text'] not in CATOK
                           and w['text'].upper() not in NAV
                           and not _is_code(w['text'])
                           for w in line)

            pre = []
            for sidx in block_starts:
                pi = sidx
                head_line = sorted(rows[tops[sidx]], key=lambda x: x['x0'])
                if not has_name(head_line):
                    k = sidx - 1
                    if k >= 0 and not is_rankline(k):
                        ln = sorted(rows[tops[k]], key=lambda x: x['x0'])
                        if has_name(ln) and len(trailing_scores(ln)) < 3:
                            pi = k
                pre.append(pi)

            for bi, sidx in enumerate(block_starts):
                pre_idx = pre[bi]
                end_idx = pre[bi + 1] if bi + 1 < len(block_starts) else n
                head = sorted(rows[tops[sidx]], key=lambda x: x['x0'])
                head_top = tops[sidx]
                m = RANK.match(head[0]['text'])
                rank = int(m.group(1))
                nat = m.group(2) or ''

                # Split the head line into the trailing score run and the left
                # part (rank, nat/sail, name tokens, CAT letter).
                run = trailing_scores(head)
                left = head[:len(head) - len(run)]
                net_tok = run[0]['text'] if run else None

                # NAT + sail from the left part (or from block lines below).
                sail = ''
                name_words = []
                for w in left[1:]:               # skip the rank token itself
                    txt = w['text']
                    if NAT3.match(txt) and not nat and w['x0'] < first_race_x - 40:
                        nat = txt
                    elif re.match(r'^\d{2,7}$', txt) and not sail \
                            and w['x0'] < name_x - 4:
                        sail = txt
                    elif txt in CATOK:
                        pass                     # CAT letter — captured below
                    elif txt.upper() in NAV:
                        pass
                    elif re.search(r'[A-Za-z]', txt):
                        name_words.append(txt)

                # CAT (gender): the lone M/W/F/X letter in the left part, right of
                # the name.
                cat = ''
                for w in left:
                    if w['text'] in CATOK and w['x0'] > name_x:
                        cat = w['text']; break

                # Pull wrapped-name fragments from adjacent block lines (≤26px from
                # the head), name column only, skipping nav/footer chrome.
                name_parts = [' '.join(name_words)] if name_words else []
                for kk in range(pre_idx, end_idx):
                    if kk == sidx:
                        continue
                    if abs(tops[kk] - head_top) > 26:
                        continue
                    ln = sorted(rows[tops[kk]], key=lambda x: x['x0'])
                    seg = [w['text'] for w in ln
                           if sail_x + 20 <= w['x0'] < first_race_x - 20
                           and re.search(r'[A-Za-z]', w['text'])
                           and w['text'] not in CATOK
                           and w['text'].upper() not in NAV
                           and not _is_code(w['text'])
                           and not NAT3.match(w['text'])]
                    if seg:
                        if tops[kk] < head_top:
                            name_parts.insert(0, ' '.join(seg))   # wrapped-above
                        else:
                            name_parts.append(' '.join(seg))
                    # NAT/sail may sit on a line below the rank line.
                    for w in ln:
                        if sail_x - 14 <= w['x0'] < name_x - 4:
                            if NAT3.match(w['text']) and not nat:
                                nat = w['text']
                            elif re.match(r'^\d{2,7}$', w['text']) and not sail:
                                sail = w['text']
                name = ' '.join(p for p in name_parts if p).strip()
                name = re.sub(r'-\s+', '-', name)   # rejoin "NGUYEN-" + "MINH"

                # Race cells: bucket every score/code token right of the first race
                # column across ALL block lines by nearest race centre.
                buckets = defaultdict(list)
                for kk in range(pre_idx, end_idx):
                    for w in sorted(rows[tops[kk]], key=lambda x: x['x0']):
                        if w['x0'] < first_race_x - 16:
                            continue
                        txt = w['text']
                        if SCORE.match(txt) or _is_code(txt):
                            ci = nearest_race(w['x0'])
                            if ci is not None:
                                buckets[ci].append(txt)
                race_toks = []
                for ci in range(len(race_x)):
                    cell = buckets.get(ci)
                    if not cell:
                        continue
                    nums = [c for c in cell if SCORE.match(c)]
                    codes = [c for c in cell if _is_code(c)]
                    if nums:
                        race_toks.append(nums[0] + (' ' + codes[0] if codes else ''))
                    elif codes:
                        race_toks.append(codes[0])

                if not name or not race_toks:
                    continue
                e = _text_line_entry(rank, name, '', sail, nat, '', race_toks,
                                     net_tok)
                e['gender'] = 'F' if cat in ('W', 'F') else ('M' if cat == 'M' else '')
                entries.append(e)

    return entries or None

# ── TopYacht (Australian club scoring) ──────────────────────────────────────
# Default TopYacht legend letter → full code. The doc's own legend line ("Penalties:
# A=ARB/MED B=BFD C=DNC …") is parsed per-document when present and overrides this.
_TOPYACHT_CODES = {
    'A': 'ARB', 'B': 'BFD', 'C': 'DNC', 'D': 'DNE', 'E': 'ESP', 'F': 'DNF',
    'G': 'RDG', 'H': 'NSC', 'I': 'DPI', 'L': 'LATE', 'M': 'DGM', 'N': 'ENP',
    'O': 'OCS', 'P': 'PRO', 'Q': 'DSQ', 'R': 'RET', 'S': 'DNS', 'T': 'TLE',
    'U': 'UFP', 'V': 'AVG', 'W': 'DUT', 'X': 'EXC', 'Y': 'SCP', 'Z': 'ZFP',
}

def _topyacht_legend(full_text):
    """Read the per-document 'Penalties: A=ARB/MED B=BFD …' legend into a
    {letter: CODE} map; fall back to _TOPYACHT_CODES for any letter not printed."""
    m = re.search(r'Penalties:\s*(.+?)\)', full_text, re.DOTALL | re.IGNORECASE)
    mapping = dict(_TOPYACHT_CODES)
    if m:
        for lm in re.finditer(r'\b([A-Z#])\s*=\s*([A-Za-z/ ]+?)(?=\s+[A-Z#]\s*=|\s*$)',
                              m.group(1)):
            letter, val = lm.group(1), lm.group(2).strip()
            # Take the first token of a multi-word value (ARB/MED → ARB;
            # "Late Entrant" → LATE) and upper-case it into a compact code.
            first = re.split(r'[/\s]', val)[0].upper()
            if letter != '#':
                mapping[letter] = first
    return mapping

def _topyacht_cell(raw, legend):
    """Normalise a TopYacht score cell into a form clean_score_with_code reads:
      '11.0'      → '11'
      '[4.0]'     → '(4)'          (discard: parens, so _disc counts it)
      '19.0C'     → '19 DNC'       (suffixed letter → legend code)
      '[19.0O]'   → '(19 OCS)'     (discarded + coded)
    Returns None for empty cells."""
    s = str(raw or '').strip()
    if not s:
        return None
    disc = s.startswith('[') and s.endswith(']')
    inner = s[1:-1] if disc else s
    m = re.match(r'^(-?\d+(?:\.\d+)?)\s*([A-Za-z#])?$', inner)
    if not m:
        return None
    num = m.group(1)
    if num.endswith('.0'):
        num = num[:-2]
    code = ''
    letter = m.group(2)
    if letter and letter != '#':
        code = legend.get(letter.upper(), '')
    cell = num + (' ' + code if code else '')
    return '(' + cell + ')' if disc else cell

def try_topyacht(full_text):
    """TopYacht results. Per-class sections headed
        'Series Results [<class>] up to Race N (Drops = D)'
    then a header 'Place Ties Sail No Boat Name Skipper Sers Score Race N … Race 1'
    with the RACE COLUMNS IN REVERSE ORDER (Race N first). Rows are single lines:
        <place> [ties] <sail> <BOAT NAME…> <Skipper Name…> <Sers> <r_N> … <r_1>
    Sers Score is the total (no separate nett). Discards are '[x.y]'; penalty
    codes are single letters suffixed to the score ('[19.0O]') mapped via the
    legend line. div = the class from the section heading; races reordered to
    ascending (R1 first) because downstream assumes races[0]=R1."""
    low = full_text.lower()
    if 'results by : topyacht' not in low and 'results by: topyacht' not in low \
       and 'results by :topyacht' not in low:
        if not ('series results [' in low and 'updated:' in low):
            return None
    legend = _topyacht_legend(full_text)
    lines = full_text.split('\n')
    entries = []
    cur_class = ''
    n_races = 0
    _SCORE = re.compile(r'^\[?-?\d+(?:\.\d+)?[A-Za-z#]?\]?$')
    for l in lines:
        sh = re.search(r'Series Results\s*\[([^\]]+)\]', l)
        if sh:
            cur_class = re.sub(r'\s+', ' ', sh.group(1)).strip()
            rc = re.search(r'up to Race\s*(\d+)', l, re.IGNORECASE)
            n_races = int(rc.group(1)) if rc else 0
            continue
        toks = l.split()
        if len(toks) < 4 or not toks[0].isdigit():
            continue
        # The trailing run is: [Sers Score] + n_races score cells. Count the
        # trailing score-shaped tokens; the last (n_races+1) are Sers + races.
        run = 0
        for t in reversed(toks):
            if _SCORE.match(t):
                run += 1
            else:
                break
        want = (n_races + 1) if n_races else run
        if run < want or want < 2:
            continue
        tail = toks[len(toks) - want:]
        sers, race_cells = tail[0], tail[1:]
        head = toks[:len(toks) - want]           # place [ties] sail boat… skipper…
        place = int(head[0])
        idx = 1
        # Optional Ties column: a lone letter/number token before the sail. Sail No
        # is the next token that is a bare number or nat-prefixed number.
        sail = ''
        sidx = None
        for k in range(idx, len(head)):
            if re.match(r'^[A-Z]{0,3}\d{2,7}$', head[k]):
                sail, sidx = head[k], k; break
        if sidx is None:
            continue
        rest = head[sidx + 1:]                    # BOAT NAME… then Skipper Name…
        # Skipper (helm) = trailing Titlecase name run; boat name = the ALL-CAPS
        # run before it. Skipper cell may stack two names (303 Double) — join them.
        sk = []
        for t in reversed(rest):
            if re.match(r"^[A-Z][a-z][A-Za-z'’.\-]*$", t) or re.match(r"^[A-Z]\.?$", t):
                sk.insert(0, t)
            else:
                break
        skipper = ' '.join(sk)
        # Reverse the race cells to ascending (doc prints Race N … Race 1).
        race_cells = list(reversed(race_cells))
        race_toks = [_topyacht_cell(c, legend) for c in race_cells]
        race_toks = [c for c in race_toks if c is not None]
        e = _text_line_entry(place, skipper, '', sail, '', cur_class, race_toks,
                             net_token=None)
        # Sers Score is the total; set total from it, nett equal to it (no recompute).
        try:
            sv = float(sers.strip('[]'))
            e['pdf_net'] = int(sv) if sv == int(sv) else sv
        except (ValueError, TypeError):
            pass
        entries.append(e)
    return entries or None

# ── "Overall Results of <division>" championship books ──────────────────────
# Bilingual multi-division layout (e.g. the ILCA Asian Championships): one PDF,
# many divisions, each headed "Overall Results of …". pdfplumber finds no ruled
# table, and rows carry an optional age-category ("Group") column, multi-token
# score codes ("(42 BFD)", "6 SP1", "16.6 SCP30%") and names that wrap onto the
# lines above/below the rank line.
_WSID_RE  = re.compile(r'^[A-Z]{3}[A-Z]{1,4}\d{1,4}$')   # CHNYC14, MASMA27, HKGNH5
_OR_GROUP = re.compile(r'^(U\d{2}|Masters?|Master|Youth|Junior|Jr|Veteran|Open)$', re.IGNORECASE)
_OR_ROW   = re.compile(r'^\s*\d+\s+[A-Z]{3}\s?\d{2,7}\b')  # nat+sail glued or spaced
_OR_NAMEFRAG = re.compile(r"^[A-Za-z][A-Za-z '’\-]+$")

def _or_race_cells(toks):
    """Segment the trailing token run into race cells, re-joining a numeric
    score with its following penalty code so clean_score_with_code sees one
    cell: '42','UFD' → '42 UFD'; '(42','BFD)' → '(42 BFD)'; '16.6','SCP30%'."""
    code_re = re.compile(r'^\(?[A-Za-z]{2,5}\d*%?\)?$')
    cells, i = [], 0
    while i < len(toks):
        t = toks[i]
        if re.search(r'\d', t):                      # numeric → start a cell
            cell = t; i += 1
            while i < len(toks) and code_re.match(toks[i]):
                cell += ' ' + toks[i]; i += 1
            cells.append(cell)
        else:                                        # stray code → attach to prev
            if cells:
                cells[-1] += ' ' + t
            i += 1
    return cells

def try_overall_results(full_text):
    low = full_text.lower()
    if 'overall results of' not in low:
        return None
    lines = full_text.split('\n')
    hdr = re.compile(r'overall results of\s+(.+)', re.IGNORECASE)
    heads = [(i, re.sub(r'\s+', ' ', hdr.search(l).group(1)).strip())
             for i, l in enumerate(lines) if hdr.search(l)]
    if not heads:
        return None
    heads.append((len(lines), None))

    entries = []
    for hi in range(len(heads) - 1):
        start, label = heads[hi]
        end = heads[hi + 1][0]
        block = lines[start:end]
        gender = ('F' if re.search(r'\b(girls?|women|female|ladies)\b', label, re.I)
                  else 'M' if re.search(r'\b(boys?|men|male)\b', label, re.I) else '')
        idxs = [j for j, l in enumerate(block) if _OR_ROW.match(l)]
        idxset = set(idxs)
        for j in idxs:
            toks = block[j].split()
            try:
                rank = int(toks[0])
            except ValueError:
                continue
            # nat+sail: glued ("CHN200777") or spaced ("CHN 200777")
            if re.match(r'^[A-Z]{3}\d{2,7}$', toks[1]):
                nat, sail, rest = toks[1][:3], toks[1][3:], toks[2:]
            elif re.match(r'^[A-Z]{3}$', toks[1]) and len(toks) > 2 and re.match(r'^\d{2,7}$', toks[2]):
                nat, sail, rest = toks[1], toks[2], toks[3:]
            else:
                continue
            widx = next((k for k, t in enumerate(rest) if _WSID_RE.match(t)), None)
            if widx is None or widx + 2 >= len(rest):
                continue
            head_toks = rest[:widx]
            total_tok, net_tok = rest[widx + 1], rest[widx + 2]
            race_cells = _or_race_cells(rest[widx + 3:])
            cat, name_toks = '', []
            for t in head_toks:
                if _OR_GROUP.match(t):
                    if t.lower() != 'open':          # "Open" is not an age category
                        cat = t.upper() if t[0] in 'Uu' else t.title()
                else:
                    name_toks.append(t)
            # Names wrap onto the nearest text-only line above and/or below the
            # rank line — pull them in when the rank line has no inline name.
            if not name_toks:
                above = below = ''
                k = j - 1
                while k >= 0 and not block[k].strip():
                    k -= 1
                if k >= 0 and k not in idxset and _OR_NAMEFRAG.match(block[k].strip()):
                    above = block[k].strip()
                k = j + 1
                while k < len(block) and not block[k].strip():
                    k += 1
                if k < len(block) and k not in idxset and _OR_NAMEFRAG.match(block[k].strip()):
                    below = block[k].strip()
                name = (above + ' ' + below).strip()
            else:
                name = ' '.join(name_toks)
            if not name:
                continue
            e = _text_line_entry(rank, name, '', sail, nat, label, race_cells, net_tok)
            e['gender'] = gender
            if cat:
                e['category'] = norm_category(cat)
            entries.append(e)
    return entries or None

# ── aspose-bilingual-cn (Aspose.PDF Chinese notice-board results) ────────────
# Qinhuangdao ILCA events printed by "Aspose.PDF for .NET". The results grid is
# the SAME bilingual "Overall Results of <division>" layout that try_overall_results
# already reads verbatim (nat+sail fused CHN200777, Group→category, wrapped names,
# multi-token codes "(42 BFD)"/"16.6 SCP30%", WS-ID noise column dropped). So this
# extractor delegates row parsing to that proven core and adds only the two aspose-
# specific pieces the generic heuristics miss: the ENGLISH event line (the top of
# each page is a CN title over an EN title) and the CJK date line
# ("Date日期Y/M/D：2025年6月8日" → 08/06/2025).
def _aspose_cn_date(full_text):
    """Convert the aspose CJK date stamp '2025年6月8日' to dd/mm/yyyy. Returns ''
    when absent."""
    m = re.search(r'(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日', full_text)
    if not m:
        return ''
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if 1 <= mo <= 12 and 1 <= d <= 31:
        return f"{d:02d}/{mo:02d}/{y}"
    return ''

def _aspose_cn_event(full_text):
    """The event name is the first ALL-CAPS English title line near the top
    (e.g. '2025 ILCA ASIAN OPEN CHAMPIONSHIPS'), sitting under the CN title.
    Returns '' when not found."""
    for l in full_text.split('\n')[:12]:
        s = l.strip()
        if len(s) < 6:
            continue
        if re.search(r'[A-Za-z]', s) and not re.search(r'[一-鿿]', s) \
           and re.search(r'(?i)(championship|regatta|cup|open|series|trophy)', s):
            return s[:120]
    return ''

def try_aspose_cn(full_text):
    """aspose-bilingual-cn results. Same grid as try_overall_results; returns its
    entries (or None). Event name / date are recovered by the cascade caller via
    _aspose_cn_event / _aspose_cn_date."""
    return try_overall_results(full_text)

# ── bornan (Asian Games 2022 official timing, Stimulsoft) ────────────────────
# Word-geometry parse: the flat text reading order scrambles the stacked score
# codes (OCS/DSQ/UFD print BENEATH the numeric score in the same race cell) and,
# for two-person skiffs, the helm/crew names + H/C Pos markers. So bucket every
# token by its column X, learned from the race-header row.
#   layout: <rank glued to first name token> <helm name…> [Pos=H] <NOC> r1..rN
#           [Medal] then on the next line(s): [crew name… Pos=C] [stacked codes]
#           <Total> <Net>. Codes on the line just below the helm row align by X to
#           the helm's race cells → joined as 'score CODE' verbatim. NOC→nat.
_BORNAN_CODES = {'OCS', 'DSQ', 'UFD', 'DNF', 'DNS', 'DNC', 'BFD', 'RET', 'DNE',
                 'RDG', 'SCP', 'STP', 'DPI', 'NSC', 'ZFP', 'DGM'}

def try_bornan(full_text, pdf_bytes=None):
    """AG2022 Bornan/Stimulsoft results. Returns entries or None."""
    if pdfplumber is None or not pdf_bytes:
        return None
    if 'timing and results provided by bornan' not in full_text.lower():
        return None
    from collections import defaultdict
    NUM = re.compile(r'^\(?-?\d+(?:\.\d+)?\)?$')

    def _is_code(t):
        return re.sub(r'[^A-Z]', '', t.upper()) in _BORNAN_CODES

    entries = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        # Event name from the English title line (bilingual CN/EN stacked titles).
        ev = ''
        for page in pdf.pages:
            words = page.extract_words()
            if not words:
                continue
            rows = defaultdict(list)
            for w in words:
                rows[round(w['top'])].append(w)
            tops = sorted(rows)

            # ── Learn the race-column centres from the header row: the run of
            # bare ascending integers 1,2,…,N. Also learn the NOC-code column x,
            # the Total/Net x's, and the optional Medal-race x. ──
            race_x = []
            hdr_top = None
            for t in tops:
                ln = sorted(rows[t], key=lambda x: x['x0'])
                ints = [w for w in ln if re.match(r'^\d{1,2}$', w['text'])]
                if len(ints) >= 5:
                    seq = [int(w['text']) for w in ints]
                    if seq == list(range(1, len(seq) + 1)):
                        race_x = [w['x0'] for w in ints]
                        hdr_top = t
                        break
            if not race_x:
                continue
            n_races = len(race_x)
            first_race_x = race_x[0]

            # Total/Net column x: from a "Pts Pts" header line, else the two
            # right-most numeric columns. NOC column x from the 'Code' label
            # ("NOC Code" stacked header) or the 'NOC' label. Pos column x from
            # 'Pos.' (two-person skiffs only).
            tot_x = net_x = None
            medal_x = None
            noc_x = None
            pos_x = None
            for t in tops:
                ln = sorted(rows[t], key=lambda x: x['x0'])
                pts = [w for w in ln if w['text'] == 'Pts']
                if len(pts) >= 2:
                    net_x = pts[-1]['x0']
                    tot_x = pts[-2]['x0']
                    if len(pts) >= 3:
                        medal_x = pts[-3]['x0']
                for w in ln:
                    if w['text'] in ('Code', 'NOC') and noc_x is None:
                        noc_x = w['x0']
                    if w['text'] in ('Pos.', 'Pos') and pos_x is None:
                        pos_x = w['x0']
            if tot_x is None:
                tot_x = race_x[-1] + 30
                net_x = race_x[-1] + 55
            if noc_x is None:
                noc_x = first_race_x - 40

            def nearest_race(x):
                best, bd = None, 1e9
                for ci, rx in enumerate(race_x):
                    d = abs(x - rx)
                    if d < bd:
                        bd, best = d, ci
                return best if bd <= 12 else None

            # Rank lines: leftmost token is <digits glued to a name> at far left
            # (x < noc_x). Scores may WRAP to the line above, so a rank line is NOT
            # required to carry the score run itself.
            rank_re = re.compile(r'^(\d{1,3})([A-Za-z].*)$')
            rank_idxs = []
            for i, t in enumerate(tops):
                if t <= hdr_top:
                    continue
                ln = sorted(rows[t], key=lambda x: x['x0'])
                if not ln:
                    continue
                m = rank_re.match(ln[0]['text'])
                if m and ln[0]['x0'] < noc_x - 4:
                    rank_idxs.append(i)

            def _is_footer_line(ln):
                s = ' '.join(w['text'] for w in ln).lower()
                return ('legend' in s or 'timing and results' in s
                        or 'report created' in s or 'excluded score' in s)

            for ri, i in enumerate(rank_idxs):
                end = rank_idxs[ri + 1] if ri + 1 < len(rank_idxs) else len(tops)
                head = sorted(rows[tops[i]], key=lambda x: x['x0'])
                m = rank_re.match(head[0]['text'])
                rank = int(m.group(1))
                first_name_frag = m.group(2)

                # Helm name = tokens between the rank column and the NOC column,
                # excluding a lone Pos marker 'H'. NOC = the 3-caps token nearest
                # the NOC column x.
                nat = ''
                best_nat_d = 1e9
                helm_toks = [first_name_frag]
                for w in head[1:]:
                    txt = w['text']
                    if w['x0'] >= first_race_x - 8:
                        break
                    if txt in ('H', 'C'):
                        continue
                    if re.match(r'^[A-Z]{3}$', txt) and abs(w['x0'] - noc_x) <= 20:
                        d = abs(w['x0'] - noc_x)
                        if d < best_nat_d:
                            nat, best_nat_d = txt, d
                    elif w['x0'] < noc_x - 4:
                        helm_toks.append(txt)

                # Race cells by X: the head line's numeric scores, plus any that
                # wrapped to the line immediately ABOVE the rank line.
                buckets = defaultdict(lambda: {'num': None, 'code': None})
                score_lines = [head]
                if i - 1 >= 0 and (ri == 0 or (i - 1) != rank_idxs[ri - 1]):
                    prev = sorted(rows[tops[i - 1]], key=lambda x: x['x0'])
                    # Only borrow when the previous line has no rank token and
                    # carries scores in the race band (a wrapped score row).
                    if not _is_footer_line(prev) and prev \
                       and not rank_re.match(prev[0]['text']) \
                       and any(NUM.match(w['text']) and w['x0'] >= first_race_x - 8
                               for w in prev):
                        score_lines.append(prev)
                for sl in score_lines:
                    for w in sl:
                        if w['x0'] < first_race_x - 12:
                            continue
                        if medal_x and abs(w['x0'] - medal_x) <= 12:
                            continue
                        if abs(w['x0'] - tot_x) <= 12 or abs(w['x0'] - net_x) <= 12:
                            continue
                        ci = nearest_race(w['x0'])
                        if ci is not None and NUM.match(w['text']) and buckets[ci]['num'] is None:
                            buckets[ci]['num'] = w['text']

                # Continuation lines (rank line → next rank line): stacked codes
                # aligned by X to the helm's race cells, the crew name (Pos 'C'
                # line), and Total/Net. Stop before any Legend/footer line.
                crew_toks = []
                tot_tok = net_tok = None
                for k in range(i + 1, end):
                    ln = sorted(rows[tops[k]], key=lambda x: x['x0'])
                    if _is_footer_line(ln):
                        break
                    for w in ln:
                        txt = w['text']
                        if abs(w['x0'] - tot_x) <= 12 and NUM.match(txt) and tot_tok is None:
                            tot_tok = txt; continue
                        if abs(w['x0'] - net_x) <= 12 and NUM.match(txt) and net_tok is None:
                            net_tok = txt; continue
                        if _is_code(txt) and w['x0'] >= first_race_x - 12:
                            ci = nearest_race(w['x0'])
                            if ci is not None and buckets[ci]['code'] is None:
                                buckets[ci]['code'] = re.sub(r'[^A-Z]', '', txt.upper())
                    # Crew name fragments: alpha tokens in the name band (left of
                    # NOC), excluding a lone Pos 'C'/'H' and any 3-caps NOC.
                    for w in ln:
                        txt = w['text']
                        if w['x0'] < noc_x - 4 and re.search(r'[A-Za-z]', txt) \
                           and txt not in ('H', 'C') and not re.match(r'^[A-Z]{3}$', txt):
                            crew_toks.append(txt)

                for w in head:
                    if tot_tok is None and abs(w['x0'] - tot_x) <= 12 and NUM.match(w['text']):
                        tot_tok = w['text']
                    elif net_tok is None and abs(w['x0'] - net_x) <= 12 and NUM.match(w['text']):
                        net_tok = w['text']

                race_toks = []
                for ci in range(n_races):
                    cell = buckets.get(ci)
                    if not cell or cell['num'] is None:
                        # A cell with only a code (rare) — keep the code alone.
                        if cell and cell['code']:
                            race_toks.append(cell['code'])
                        continue
                    num = cell['num']
                    race_toks.append(num + (' ' + cell['code'] if cell['code'] else ''))

                # Medal race value (append last, verbatim) if present on the head
                # line at medal_x.
                if medal_x:
                    for w in head:
                        if abs(w['x0'] - medal_x) <= 12 and NUM.match(w['text']):
                            race_toks.append(w['text']); break

                helm = ' '.join(helm_toks).strip()
                crew = ' '.join(crew_toks).strip()
                if not helm or not race_toks:
                    continue
                e = _text_line_entry(rank, helm, crew, '', nat, '', race_toks, net_tok)
                # Names are printed surname-first ALL-CAPS; keep as-is (clean_name
                # in _text_line_entry already title-cases). Preserve trailing '.'.
                entries.append(e)
        # end page loop
    return entries or None

# ── worldsailing-resultscentre → VISION ONLY ───────────────────────────────
# The World Sailing "Results Centre" microsite prints (Allianz Hague 2023,
# Youth Worlds Garda 2024) are DELIBERATELY left to vision AI (registry
# extractor=None). A word-geometry parse reads the rows, but: the docs carry no
# sail number (nation-only ID, so the confidence gate can never clear 0.6); the
# MNA/nat column x-offset drifts between documents; and 3-line wrapped crew names
# split ambiguously. Shipping a deterministic parser here would be flaky, so the
# family routes to vision (its PDF Title still names the family as a prompt hint).

# ── asiansailing-wordpress (asiansailing.org article print w/ Sailwave tables) ─
# A WordPress news-article print. Results tables are embedded on the middle pages,
# anchored by 'Sailed: … Scoring system: Appendix A' blocks each headed by a fleet
# name ('Optimist Main Fleet', 'Laser Radial Fleet', '420 (Open) Fleet' …). The
# WordPress narrow columns force heavy word-wrap, so parse by WORD GEOMETRY:
#   header 'Pos [Sail No|SailNo] Sex [Helm ]Name [Name] R1…Rn Total [Nett]'.
#   The 3-letter nat sits ABOVE the sail number in the same column; Sex M/F →
#   gender; helm/crew names wrap onto the sail-number line; codes wrap too and
#   align by X to their race cell. div = fleet heading. When Nett is absent set
#   nett=total. Returns entries or None.
def try_asiansailing(full_text, pdf_bytes=None):
    if pdfplumber is None or not pdf_bytes:
        return None
    if 'asiansailing.org' not in full_text.lower():
        return None
    from collections import defaultdict
    NUM = re.compile(r'^\(?-?\d+(?:\.\d+)?\)?$')
    NAT3 = re.compile(r'^[A-Z]{3}$')
    CODES_LOCAL = {'DNF', 'DNS', 'DNC', 'OCS', 'DSQ', 'BFD', 'UFD', 'RET', 'NSC',
                   'RDG', 'SCP', 'STP', 'DPI', 'DNE', 'ZFP', 'DGM'}

    def _is_code(t):
        return re.sub(r'[^A-Z]', '', t.upper()) in CODES_LOCAL

    entries = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        cur_fleet = ''
        cols = None   # dict once a header row is seen: pos_x, natsail_x, sex_x,
                      # name_x, crew_x(optional), race_x[], total_x, nett_x
        for page in pdf.pages:
            words = page.extract_words()
            if not words:
                continue
            rows = defaultdict(list)
            for w in words:
                rows[round(w['top'])].append(w)
            tops = sorted(rows)

            for i, t in enumerate(tops):
                ln = sorted(rows[t], key=lambda x: x['x0'])
                txts = [w['text'] for w in ln]
                line_str = ' '.join(txts)

                # Fleet heading — a line naming a fleet ('… Fleet'). Keep verbatim.
                fh = re.search(r'([A-Za-z0-9.\-()/ ]+?Fleet)\b', line_str)
                if fh and 'Pos' not in txts and len(txts) <= 5:
                    cur_fleet = re.sub(r'\s+', ' ', fh.group(1)).strip()
                    continue

                # Header row establishes the column geometry for the section.
                if 'Pos' in txts and ('Sex' in txts or 'Name' in txts) \
                   and any(re.match(r'^R\d+$', x) for x in txts):
                    by = [(w['text'], w['x0']) for w in ln]
                    race_x = [x for tx, x in by if re.match(r'^R\d+$', tx)]
                    pos_x = next((x for tx, x in by if tx == 'Pos'), None)
                    sex_x = next((x for tx, x in by if tx == 'Sex'), None)
                    # Sail-number column: 'No'/'No.'/'SailNo' label; else the
                    # column between Pos and Sex.
                    natsail_x = next((x for tx, x in by if tx in ('No', 'No.', 'SailNo')), None)
                    if natsail_x is None:
                        natsail_x = next((x for tx, x in by if tx == 'Sail'), None)
                    total_x = next((x for tx, x in by if tx in ('Total', 'Tot')), None)
                    nett_x = next((x for tx, x in by if tx in ('Nett', 'Net')), None)
                    # Name column(s): 'Name' labels right of Sex.
                    name_xs = [x for tx, x in by if tx == 'Name' and (sex_x is None or x > sex_x)]
                    name_x = name_xs[0] if name_xs else (sex_x + 18 if sex_x else None)
                    crew_x = name_xs[1] if len(name_xs) > 1 else None
                    if race_x and pos_x is not None and name_x is not None:
                        cols = {'pos_x': pos_x, 'natsail_x': natsail_x, 'sex_x': sex_x,
                                'name_x': name_x, 'crew_x': crew_x, 'race_x': race_x,
                                'total_x': total_x, 'nett_x': nett_x,
                                'has_sail': natsail_x is not None}
                    continue

                if cols is None:
                    continue
                race_x = cols['race_x']
                first_race_x = race_x[0]

                # Rank line: leftmost token a bare integer near pos_x, carrying a
                # run of numeric race scores.
                if not ln or not re.match(r'^\d{1,3}$', ln[0]['text']) \
                   or abs(ln[0]['x0'] - cols['pos_x']) > 16:
                    continue
                nscore = sum(1 for w in ln if NUM.match(w['text'])
                             and w['x0'] >= first_race_x - 8)
                if nscore < 3:
                    continue
                rank = int(ln[0]['text'])

                def nearest_race(x):
                    best, bd = None, 1e9
                    for ci, rxx in enumerate(race_x):
                        d = abs(x - rxx)
                        if d < bd:
                            bd, best = d, ci
                    return best if bd <= 12 else None

                nat = ''
                sail = ''
                sex = ''
                helm_toks = []
                crew_toks = []
                buckets = defaultdict(lambda: {'num': None, 'code': None})
                total_tok = nett_tok = None

                def _classify(w, is_head):
                    nonlocal nat, sail, sex, total_tok, nett_tok
                    txt = w['text']
                    x = w['x0']
                    # Total / Nett columns.
                    if cols['total_x'] is not None and abs(x - cols['total_x']) <= 12 \
                       and NUM.match(txt):
                        if total_tok is None:
                            total_tok = txt
                        return
                    if cols['nett_x'] is not None and abs(x - cols['nett_x']) <= 12 \
                       and NUM.match(txt):
                        if nett_tok is None:
                            nett_tok = txt
                        return
                    # Race grid.
                    if x >= first_race_x - 12:
                        ci = nearest_race(x)
                        if ci is not None:
                            if NUM.match(txt) and buckets[ci]['num'] is None:
                                buckets[ci]['num'] = txt
                            elif _is_code(txt) and buckets[ci]['code'] is None:
                                buckets[ci]['code'] = re.sub(r'[^A-Z]', '', txt.upper())
                        return
                    # Sail/nat column.
                    if cols['has_sail'] and abs(x - cols['natsail_x']) <= 16:
                        if NAT3.match(txt) and not nat:
                            nat = txt
                        elif re.match(r'^\d{1,6}$', txt) and not sail:
                            sail = txt
                        elif NAT3.match(txt):
                            pass
                        return
                    # Sex column.
                    if cols['sex_x'] is not None and abs(x - cols['sex_x']) <= 10 \
                       and txt in ('M', 'F', 'X'):
                        sex = txt
                        return
                    # Name / crew columns (alpha tokens). Skip article/site chrome
                    # that shares the name band: the footer URL, the browser print
                    # header and 'Asian Sailing'/'Sailing' page furniture.
                    if re.search(r'[A-Za-z]', txt):
                        if ('asiansailing.org' in txt.lower() or txt.lower().startswith('http')
                                or txt.lower() in ('asian', 'sailing')):
                            return
                        if not cols['has_sail'] and NAT3.match(txt) and not nat \
                           and abs(x - cols['natsail_x'] if cols['natsail_x'] else 1e9) <= 16:
                            nat = txt
                            return
                        if cols['crew_x'] is not None and x >= cols['crew_x'] - 10:
                            crew_toks.append((x, txt))
                        else:
                            helm_toks.append((x, txt))

                # Head line + continuation lines until the next rank line. Also
                # stop at any section boundary — a new 'Pos' header, a fleet
                # heading ('… Fleet'), or a 'Sailed:'/'Scoring system' block line —
                # so the next section's chrome never bleeds into this row's name.
                nxt = None
                for k in range(i + 1, len(tops)):
                    lk = sorted(rows[tops[k]], key=lambda x: x['x0'])
                    if lk and re.match(r'^\d{1,3}$', lk[0]['text']) \
                       and abs(lk[0]['x0'] - cols['pos_x']) <= 16 \
                       and sum(1 for w in lk if NUM.match(w['text'])
                               and w['x0'] >= first_race_x - 8) >= 3:
                        nxt = tops[k]; break
                    lk_str = ' '.join(w['text'] for w in lk)
                    if any(w['text'] == 'Pos' for w in lk) \
                       or re.search(r'\bFleet\b', lk_str) \
                       or 'Sailed:' in lk_str or 'Scoring' in lk_str:
                        nxt = tops[k]; break

                block_tops = [t]
                for k in range(i + 1, len(tops)):
                    if nxt is not None and tops[k] >= nxt:
                        break
                    block_tops.append(tops[k])

                for bt in block_tops:
                    is_head = (bt == t)
                    for w in sorted(rows[bt], key=lambda x: x['x0']):
                        if is_head and w is ln[0]:
                            continue   # the Pos integer itself
                        # skip the leading rank integer on the head line
                        if is_head and w['x0'] == ln[0]['x0'] and w['text'] == ln[0]['text']:
                            continue
                        _classify(w, is_head)

                helm = ' '.join(tx for _, tx in sorted(helm_toks))
                crew = ' '.join(tx for _, tx in sorted(crew_toks))

                race_toks = []
                for ci in range(len(race_x)):
                    cell = buckets.get(ci)
                    if not cell:
                        continue
                    if cell['num'] is not None:
                        race_toks.append(cell['num'] + (' ' + cell['code'] if cell['code'] else ''))
                    elif cell['code'] is not None:
                        race_toks.append(cell['code'])

                if not helm or not race_toks:
                    continue
                # Nett: printed when present, else = total.
                net_use = nett_tok if nett_tok is not None else total_tok
                e = _text_line_entry(rank, helm, crew, sail, nat, cur_fleet,
                                     race_toks, net_use)
                e['gender'] = 'F' if sex == 'F' else ('M' if sex == 'M' else '')
                entries.append(e)
    return entries or None

# ── Fleet detection ────────────────────────────────────────────────────────
FLEET_PATTERNS = re.compile(
    r'(?i)\b(29er|49erFX|49er|Nacra\s*\d+|ILCA\s*\d?'
    r'|Optimist\s*(?:Main|Intermediate|Green|Junior|Novice)?'
    r'|Laser|RS\w+|2\.4\s*mR|Finn|470|420|Topper)\b'
)

def _class_of(text):
    """
    Normalise free text (a section heading / fleet label) to a canonical boat
    class for grouping. Order matters: 49erFX before 49er, Nacra before others.
    Returns '' when no class is recognised.
    """
    s = (text or '').lower()
    if 'nacra' in s:
        m = re.search(r'nacra\s*(\d+)', s)
        return 'Nacra ' + m.group(1) if m else 'Nacra'
    if '49erfx' in s or '49er fx' in s or '49fx' in s:
        return '49erFX'
    if '49er' in s:
        return '49er'
    if '29er' in s:
        return '29er'
    m = re.search(r'ilca\s*([4-7])', s)
    if m:
        return 'ILCA ' + m.group(1)
    if 'ilca' in s or 'laser' in s:
        return 'ILCA'
    if 'opti' in s or re.search(r'\bop\b', s):
        m = re.search(r'(main|intermediate|green|junior|novice)', s)
        return 'Optimist ' + m.group(1).title() if m else 'Optimist'
    if re.search(r'2\.4\s*mr', s):
        return '2.4mR'
    if '470' in s:  return '470'
    if '420' in s:  return '420'
    if 'finn' in s: return 'Finn'
    return ''

def _looks_like_class(label):
    """A per-row div value that genuinely names a boat class / colour fleet."""
    if not label:
        return False
    return bool(_class_of(label)) or _is_colour_fleet(label) or bool(
        re.search(r'\bfleet\b', label, re.IGNORECASE))

def detect_fleets_in_text(text):
    found = []; seen = set()
    for m in FLEET_PATTERNS.finditer(text):
        name = re.sub(r'\s+', ' ', m.group(0).strip())
        key = name.lower()
        if key not in seen:
            seen.add(key); found.append(name)
    return found

# ── Boat-class auto-detection ───────────────────────────────────────────────
def _canon_class(name):
    """Map a class LABEL (e.g. from a per-row Class column) to a canonical id.
    Known one-designs collapse to their id; anything unrecognised (RS Feva,
    Laser 2000, 2.4 mR, Waszp, …) is returned VERBATIM so the frontend can
    create a custom class. Note: only ILCA-family lasers map to 'ilca' — a bare
    or numbered "Laser 2000" is a different boat and stays a custom class."""
    s = re.sub(r'\s+', ' ', str(name or '')).strip()
    low = s.lower()
    if not low:
        return ''
    if re.search(r'\boptimist[s]?\b|\bopti\b', low):
        return 'optimist'
    if re.search(r'\b29er\b', low):
        return '29er'
    if re.search(r'\b49er\b', low):
        return '49er'
    if re.search(r'\bilca\b', low) or re.search(r'laser\s*(?:radial|standard|4\.7)', low):
        return 'ilca'
    return s   # unknown → raw name (custom class)

def _class_in_text(text):
    """Find a KNOWN canonical class mentioned anywhere in free text (title /
    headings). Returns '' when none of the known classes are present (unknown
    classes are only trusted from an explicit per-row Class column)."""
    low = str(text or '').lower()
    if not low:
        return ''
    if re.search(r'\boptimist[s]?\b|\bopti\b', low):
        return 'optimist'
    if re.search(r'\b29er\b', low):
        return '29er'
    if re.search(r'\b49er\b', low):
        return '49er'
    if re.search(r'\bilca\b', low) or re.search(r'laser\s*(?:radial|standard|4\.7)', low):
        return 'ilca'
    return ''

def detect_class(entries, title='', headings=''):
    """Infer the event's boat class, in priority order:
        1. the per-row Class column (entry['row_class']) — most reliable,
        2. the event title,
        3. section / fleet headings.
    Returns a canonical id ('optimist'/'29er'/'ilca'/'49er'), or the raw class
    name for a single unknown class (custom), or '' when undeterminable / mixed.
    Never defaults to 29er."""
    rcs = [_canon_class(e.get('row_class')) for e in (entries or [])
           if (e.get('row_class') or '').strip()]
    rcs = [c for c in rcs if c]
    if rcs:
        uniq = list(dict.fromkeys(rcs))
        if len(uniq) == 1:
            return uniq[0]
        # Several different per-row classes → mixed/handicap; defer to title.
    c = _class_in_text(title)
    if c:
        return c
    return _class_in_text(headings)

def _is_open_division(label):
    """True for a mixed-class 'Open Division' / handicap / PY / IRC section,
    where every boat is a different class but they race as ONE fleet."""
    low = str(label or '').lower()
    return bool(re.search(
        r'open\s+division|open\s+fleet|handicap|performance\s+handicap'
        r'|\bpy\b|portsmouth|\birc\b', low))

# ── Host club auto-detection ────────────────────────────────────────────────
# Distinctive names + abbreviations. Matched case-insensitively, punctuation
# ignored. Order matters only for overlapping aliases (none here).
_HOST_ALIASES = [
    (r'royal\s+hong\s+kong\s+yacht\s+club|\brhkyc\b', 'Royal Hong Kong Yacht Club'),
    (r'aberdeen\s+boat\s+club|\babclub\b',            'Aberdeen Boat Club'),
    (r'hebe\s+haven\s+yacht\s+club|\bhhyc\b',         'Hebe Haven Yacht Club'),
    (r'royal\s+yacht\s+club\s+victoria|\brycv\b',     'Royal Yacht Club Victoria'),
    (r'hong\s+kong\s+sailing\s+federation|\bhksf\b',  'Hong Kong Sailing Federation'),
]

def detect_host(text):
    """Detect the organizing host (club/federation) from the document title,
    header or footer. Returns the readable name string, or None if nothing is
    found. Matching is loose (case-insensitive, punctuation ignored). Does NOT
    map to an AthLink host id — the frontend handles that."""
    raw = str(text or '')
    if not raw.strip():
        return None
    norm = re.sub(r'[^a-z0-9\s]', ' ', raw.lower())
    norm = re.sub(r'\s+', ' ', norm)
    for pat, name in _HOST_ALIASES:
        if re.search(pat, norm):
            return name
    # Generic "<Something> Yacht/Boat/Sailing Club" phrase as a fallback.
    m = re.search(r'([A-Z][A-Za-z&\'.]*(?:\s+[A-Z][A-Za-z&\'.]*){0,4}\s+'
                  r'(?:Yacht|Boat|Sailing)\s+Club)\b', raw)
    if m:
        return re.sub(r'\s+', ' ', m.group(1)).strip()
    return None

# ── Vision parse providers ──────────────────────────────────────────────────
_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
# Haiku 4.5 reads PDFs natively (visual + text). It is now the universal FALLBACK
# for the vision parse: PDFs route to Gemini 3, image uploads to Kimi, and any
# provider error / rate-limit (429) / empty response degrades gracefully here.
_AI_MODEL = "claude-haiku-4-5"
# Gemini 3 Flash ingests PDFs natively (no rasterisation) and is the recommended
# high-volume free model. Override via env without a code change if Google bumps
# the id (e.g. "gemini-flash-latest") or you move to a paid tier.
_PARSE_GEMINI_MODEL = os.environ.get("PARSE_GEMINI_MODEL", "gemini-3-flash-preview")
# Kimi handles IMAGES natively (png/jpeg/webp/gif) — but NOT PDFs — so it only
# serves image uploads. k2.5 is vision-capable.
_VISION_KIMI_MODEL = os.environ.get("VISION_KIMI_MODEL", "kimi-k2.5")
_KIMI_BASE_URL = "https://api.moonshot.ai/v1"

_GEMINI_PROMPT = """Parse this sailing regatta results file. Return ONLY a JSON object, no markdown/explanation.

Structure:
{"name":"event name","division":"section heading or empty","date":"dd/mm/yyyy or empty","discards":1,"entries":[{"helm":"First Last","crew":"First Last or empty","sail":"88 or NZL 7","nat":"3-letter IOC or empty","div":"fleet/division or empty","gender":"M/F/Mix or empty","category":"U17/U19/U23/Jr or empty","pdf_rank":1,"pdf_net":67.0,"birth_year":2005,"crew_birth_year":2004,"races":[5,12,50,"DNF",7],"race_codes":[null,null,"BFD",null,null]}]}

RULES:
- division: the results TABLE's own section heading if it has one, e.g. "Overall Results of ILCA4 Youth Girls U18" -> "ILCA4 Youth Girls U18", or "Gold Fleet". This is the specific fleet/division/class this table ranks, NOT the overall event name. Empty if the table has no heading of its own (e.g. a continuation page).
- Use the OVERALL/FINAL table (skip preliminary per-fleet tables).
- helm/crew: title case "First Last"; convert "SMITH, John" to "John Smith".
- IGNORE club, team, and sponsor text entirely. The name cell often lists a sailor's name followed by " / Club / Sponsor / Sponsor". Keep ONLY the person's name; never put club/sponsor text in any field.
- sail: country prefix + number if present ("NZL 7"), else number only.
- nat: 3-letter IOC code, empty if unknown.
- gender: "M"/"F"/"Mix" from any Gender/Sex/Boat Gender column. Two-person boat with separate helm+crew gender: both male->"M", both female->"F", mixed->"Mix". Empty if none.
- category: age group only - "U17"/"U19"/"U23"/"Jr". Normalise "Under 17"/"U-17"->"U17", "Junior"->"Jr". Never put fleet colours (Gold/Silver/Bronze) or "Open" here.
- birth_year/crew_birth_year: 4-digit YOB if shown; if only AGE shown compute (event year - age); else null.
- races: ONLY per-race scores in order, as numbers or string codes (DNF,DNC,DNS,UFD,BFD,DSQ,OCS,RET,NSC,SCP,STP,RDG). Discards as plain numbers (no parentheses). Do NOT include carry-forward (CF), points-series (PS), TOTAL or NET columns in races.
- race_codes: null for plain scores; the code string when a numeric score has a code annotation. Codes often print on a SEPARATE line below/beside the score (e.g. "(50.0)" with "BFD" under it) — you MUST attach that code at the same index in race_codes; never drop it.
- pdf_rank: finishing position integer (1=winner). pdf_net: net score (the NET column, after discards) — usually the LAST numeric column; TOTAL is the second-to-last. discards: integer (usually 1).
"""

# Appended when parsing a single page of a multi-page table (the page may have no header row).
_GEMINI_PAGE_HINT = """
THIS IS ONE PAGE of a larger multi-page results table. It may have NO header row.
The column order for every row on this page is:
{header}
Parse EVERY data row on this page. Return ONLY the rows visible on this page.
"""

def _downscale_image(file_bytes: bytes, mime_type: str, max_dim: int = 2200, quality: int = 82):
    """Shrink oversized images before the AI call to cut upload + token cost.
    Returns (new_bytes, new_mime). No-op (returns originals) if Pillow is
    missing, the image is already small, or anything goes wrong."""
    try:
        from PIL import Image
    except ImportError:
        return file_bytes, mime_type
    try:
        img = Image.open(io.BytesIO(file_bytes))
        w, h = img.size
        if max(w, h) <= max_dim:
            return file_bytes, mime_type
        scale = max_dim / float(max(w, h))
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue(), "image/jpeg"
    except Exception:
        return file_bytes, mime_type


# ── vision-parse provider backends ──────────────────────────────────────────
# Each returns (raw_text, stop_reason) where stop_reason is normalised so that a
# truncated response reads "max_tokens" regardless of provider. They RAISE on any
# error (incl. an empty/blocked response) so _vision_raw can fall back.
def _anthropic_vision_raw(file_bytes: bytes, mime_type: str, prompt: str, timeout: int = 50):
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY not configured.")
    if mime_type == "application/pdf":
        media_block = {"type": "document",
                       "source": {"type": "base64", "media_type": "application/pdf",
                                  "data": base64.b64encode(file_bytes).decode()}}
    else:
        media_block = {"type": "image",
                       "source": {"type": "base64", "media_type": mime_type,
                                  "data": base64.b64encode(file_bytes).decode()}}
    payload = json.dumps({
        "model": _AI_MODEL, "max_tokens": 8192, "temperature": 0,
        "messages": [{"role": "user", "content": [media_block, {"type": "text", "text": prompt}]}],
    }).encode()
    req = UrlRequest(_ANTHROPIC_URL, data=payload,
                     headers={"Content-Type": "application/json", "x-api-key": key,
                              "anthropic-version": "2023-06-01"}, method="POST")
    try:
        with urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read())
            msg = detail.get("error", {}).get("message", str(detail))
        except Exception:
            msg = getattr(exc, "reason", None) or str(exc)
        raise ValueError(f"AI service error ({exc.code}): {msg}")
    stop = result.get("stop_reason", "")
    raw = "".join(b.get("text", "") for b in (result.get("content") or [])
                  if b.get("type") == "text").strip()
    if not raw:
        raise ValueError(f"Anthropic returned no text (stop_reason={stop or 'unknown'}).")
    return raw, stop


def _vision_model():
    """Resolve the vision-parse model via llm's route('vision') (honours the
    GEMINI_VISION_MODEL env override), falling back to the module default if the
    llm helper isn't importable in this environment."""
    if _llm_route is not None:
        try:
            cfg = _llm_route("vision")
            m = (cfg or {}).get("model")
            if m:
                return m
        except Exception:
            pass
    return _PARSE_GEMINI_MODEL


def _gemini_vision_raw(file_bytes: bytes, prompt: str, key: str, timeout: int = 30,
                       mime_type: str = "application/pdf"):
    """Vision parse via Gemini (native PDF/image ingest, no rasterisation)."""
    parts = [{"inline_data": {"mime_type": mime_type,
                              "data": base64.b64encode(file_bytes).decode()}},
             {"text": prompt}]
    # Model ladder: the free tier caps each model PER DAY, so a busy import day
    # can exhaust the primary. Quota 429s fail in <1s, so stepping down the
    # ladder costs nothing; real errors/timeouts still raise immediately.
    ladder = [_vision_model()]
    for m in ("gemini-3-flash-preview", "gemini-2.5-flash"):
        if m not in ladder:
            ladder.append(m)
    resp = None
    for i, model in enumerate(ladder):
        try:
            # 16k output: a dense 60-row page overflows 8k and used to
            # hard-fail with "too much data".
            resp = call_gemini(key, model, parts, max_tokens=16384, timeout=timeout)
            break
        except Exception as exc:
            s = str(exc)
            quota = "429" in s or "quota" in s.lower() or "RESOURCE_EXHAUSTED" in s
            if quota and i < len(ladder) - 1:
                continue
            raise
    raw = (gemini_text(resp) or "").strip()
    try:
        fr = resp["candidates"][0].get("finishReason", "")
    except (KeyError, IndexError, TypeError):
        fr = ""
    if not raw:
        raise ValueError(f"Gemini returned no text (finishReason={fr or 'unknown'}).")
    return raw, ("max_tokens" if fr == "MAX_TOKENS" else fr)


def _kimi_vision_raw(file_bytes: bytes, mime_type: str, prompt: str, key: str, timeout: int = 30):
    """Image parse via Kimi vision (base64 image_url; Kimi can't take PDFs)."""
    data_url = f"data:{mime_type};base64,{base64.b64encode(file_bytes).decode()}"
    messages = [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": data_url}},
        {"type": "text", "text": prompt}]}]
    resp = call_openai_compat(_KIMI_BASE_URL, key, _VISION_KIMI_MODEL,
                              messages, max_tokens=8192, timeout=timeout)
    raw = (openai_text(resp) or "").strip()
    try:
        fr = resp["choices"][0].get("finish_reason", "")
    except (KeyError, IndexError, TypeError):
        fr = ""
    if not raw:
        raise ValueError(f"Kimi returned no text (finish_reason={fr or 'unknown'}).")
    return raw, ("max_tokens" if fr == "length" else fr)


def _vision_raw(file_bytes: bytes, mime_type: str, prompt: str):
    """Route the vision parse to its provider, falling back to Anthropic on ANY
    error (rate-limit/429, timeout, blocked, malformed). The fallback is what
    lets parsing absorb Gemini's free-tier volume limits without ever failing.
    Timeouts are bounded so a primary-then-fallback retry still fits the 60s
    Vercel ceiling; the Anthropic-only path (no primary key) keeps the full 50s."""
    if mime_type.startswith("image/"):
        # Image branch: Gemini first (native image ingest; bake-off 2026-07-04:
        # 30s vs Kimi's 48s on the same screenshot, equal accuracy — and only
        # Gemini can also take PDFs). A full-table read needs ~30s, so the old
        # 25s budget made Gemini time out and silently degrade to fallbacks;
        # give it 38s. Kimi (~48s) can never fit as a mid-chain fallback inside
        # the 50s self-timeout, so it is only the primary when Gemini has no key.
        gkey = os.environ.get("GEMINI_API_KEY", "")
        kkey = os.environ.get("KIMI_API_KEY", "")
        if gkey and call_gemini is not None:
            try:
                return _gemini_vision_raw(file_bytes, prompt, gkey, timeout=38,
                                          mime_type=mime_type)
            except Exception:
                pass
            return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=12)
        if kkey and call_openai_compat is not None:
            try:
                return _kimi_vision_raw(file_bytes, mime_type, prompt, kkey, timeout=40)
            except Exception:
                return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=10)
        return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=50)
    # application/pdf (and any non-image) → Gemini, else Anthropic. Whole-file
    # calls only happen for small PDFs; big ones arrive page-chunked (?page=N).
    gkey = os.environ.get("GEMINI_API_KEY", "")
    if gkey and call_gemini is not None:
        try:
            return _gemini_vision_raw(file_bytes, prompt, gkey, timeout=35)
        except Exception:
            return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=14)
    return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=50)


def _image_band_boxes(file_bytes: bytes):
    """For a very tall page-capture image (a full-page web screenshot, e.g. a
    157-row results page at 1742x6431), return the crop boxes [(top, bottom)]
    that slice it into overlapping horizontal bands. Returns None for normal
    images (parse in one shot). Bands are served like PDF pages through
    ?count=1 / ?page=N — measured 2026-07-04: a dense band costs ~1.4s/row of
    Gemini output + ~13s overhead, so anything much beyond ~15 rows per
    request cannot finish inside the 60s Vercel ceiling. band_h 800px keeps a
    dense table around that size; 100px overlap keeps every row whole in at
    least one band (the client dedupes by sail|helm|crew)."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(file_bytes))
        w, h = img.size
    except Exception:
        return None
    if h <= 2400 or h <= 1.8 * w:
        return None
    import math
    band_h, overlap = 800, 100
    n = min(12, max(2, math.ceil(h / band_h)))
    step = math.ceil((h - overlap) / n)
    return [(i * step, min(h, i * step + step + overlap)) for i in range(n)]


def _image_band_count(file_bytes: bytes) -> int:
    boxes = _image_band_boxes(file_bytes)
    return len(boxes) if boxes else 1


def _extract_image_band(file_bytes: bytes, page_index: int):
    """Crop band page_index of a tall image as JPEG bytes, or None when the
    image isn't tall / the index is out of range (caller parses whole image)."""
    boxes = _image_band_boxes(file_bytes)
    if not boxes or not (0 <= page_index < len(boxes)):
        return None
    from PIL import Image
    img = Image.open(io.BytesIO(file_bytes))
    top, bottom = boxes[page_index]
    crop = img.crop((0, top, img.size[0], bottom))
    buf = io.BytesIO()
    crop.convert("RGB").save(buf, "JPEG", quality=85)
    return buf.getvalue()


def _gemini_parse(file_bytes: bytes, mime_type: str = "application/pdf", header_hint: str = "") -> dict:
    if urlopen is None:
        raise ValueError("urllib not available.")

    # Downscale large images before sending (PDFs pass through untouched).
    # NOTE: very tall screenshots never reach this whole-file path from the
    # import flow — ?count=1 reports their band count and the client fetches
    # bands via ?page=N (see _image_band_boxes), exactly like PDF pages.
    if mime_type.startswith("image/"):
        file_bytes, mime_type = _downscale_image(file_bytes, mime_type)

    prompt = _GEMINI_PROMPT
    if header_hint:
        prompt = prompt + _GEMINI_PAGE_HINT.format(header=header_hint)

    # PDF → Gemini 3, image → Kimi, with automatic Anthropic fallback.
    raw, stop = _vision_raw(file_bytes, mime_type, prompt)
    raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw.strip())
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        if stop == "max_tokens":
            raise ValueError("This page returned too much data for the AI parser. Try the built-in parser, or a Sailwave/Manage2sail export.")
        raise ValueError("AI parser returned malformed JSON.")

    entries = []
    for e in (data.get("entries") or []):
        helm = clean_name(str(e.get("helm") or ""))
        crew = clean_name(str(e.get("crew") or ""))
        sail_raw = str(e.get("sail") or "").strip()
        nat_raw  = str(e.get("nat")  or "").strip()

        extracted_nat, clean_sail = parse_sail_country(sail_raw)
        if not nat_raw and extracted_nat:
            nat_raw = extracted_nat
        if not clean_sail:
            clean_sail = sail_raw

        races, race_codes = [], []
        for r in (e.get("races") or []):
            if r is None:
                continue
            sc, code = clean_score_with_code(str(r))
            if sc is not None:
                races.append(sc)
                race_codes.append(code)

        if not helm or not races:
            continue

        pdf_rank = None
        try:
            pdf_rank = int(e.get("pdf_rank") or 0) or None
        except (ValueError, TypeError):
            pass

        pdf_net = None
        try:
            n = float(e.get("pdf_net") or 0)
            pdf_net = int(n) if n == int(n) else round(n, 2)
        except (ValueError, TypeError):
            pass

        def _yob(v):
            try:
                y = int(v)
                return y if 1930 <= y <= 2030 else None
            except (ValueError, TypeError):
                return None

        entries.append({
            "helm": helm, "crew": crew,
            "sail": clean_sail or "—",
            "nat":  flag_from_ioc(nat_raw),
            "div":  str(e.get("div") or ""),
            "gender":   norm_gender(e.get("gender")),
            "category": norm_category(e.get("category")),
            "races": races, "race_codes": race_codes,
            "pdf_rank": pdf_rank, "pdf_net": pdf_net,
            "birth_year": _yob(e.get("birth_year")),
            "crew_birth_year": _yob(e.get("crew_birth_year")),
        })

    if not entries:
        raise ValueError("AI parser returned no valid entries.")

    n_gender = sum(1 for e in entries if e.get('gender'))
    n_cat    = sum(1 for e in entries if e.get('category'))
    notes = [
        "Sent the file to Gemini for analysis.",
        f"Gemini returned {len(entries)} competitor rows.",
    ]
    if n_gender:
        notes.append(f"Detected gender on {n_gender} of {len(entries)} rows.")
    if n_cat:
        notes.append(f"Detected age category on {n_cat} of {len(entries)} rows.")

    ev_name = str(data.get("name") or "Imported Competition")
    return {
        "ok": True, "multi": False,
        "name": ev_name,
        # The table's own section heading (per page), used by the client to
        # group multi-page scans into divisions and collapse subset tables.
        "division": str(data.get("division") or "").strip(),
        "date": str(data.get("date") or ""),
        # Never invent discards: default to 0 when the model didn't report one.
        "discards": int(data.get("discards") or 0),
        "entries": entries,
        "ai_parsed": True,
        "notes": notes,
        "detected_class": detect_class(entries, ev_name, ""),
        "detected_host": detect_host(ev_name),
    }


# ── main parse ─────────────────────────────────────────────────────────────
# ── fleet grouping ──────────────────────────────────────────────────────────
def _is_colour_fleet(label):
    """True for qualifying/final splits of ONE championship (Gold/Silver/…)."""
    return bool(re.search(r'gold|silver|bronze|emerald|sapphire', label or '', re.IGNORECASE))

_COLOUR_ORDER = {'gold': 0, 'silver': 1, 'bronze': 2, 'emerald': 3, 'sapphire': 4}

def _colour_rank(label):
    """Sort order for colour splits so a merged fleet reads Gold→Silver→Bronze
    (Silver boats genuinely place below all Gold boats)."""
    m = re.search(r'\b(gold|silver|bronze|emerald|sapphire)\b', str(label or ''), re.IGNORECASE)
    return _COLOUR_ORDER.get(m.group(1).lower(), 9) if m else 9

def _fleet_base(label):
    """The base championship a colour split belongs to: strip the colour word
    and 'fleet' but KEEP gender/age so 'Boys ILCA 4 Gold Fleet' and
    'Girls ILCA 4 Gold Fleet' stay distinct ('Boys ILCA 4' vs 'Girls ILCA 4')."""
    s = re.sub(r'^\s*\d+\s*-\s*', ' ', str(label or ''))     # "1-Gold Fleet" → "Gold Fleet"
    s = re.sub(r'\b(gold|silver|bronze|emerald|sapphire)\b', ' ', s, flags=re.IGNORECASE)
    s = re.sub(r'\b(fleet|flight)\b', ' ', s, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', s).strip()

def _sailwave_fleet_map(full_text):
    """Map each sail number → its fleet-section name for a multi-fleet Sailwave
    PDF ('Boys ILCA 4 Gold Fleet', 'Girls ILCA 4 Silver Fleet', …). The table
    extractor can't attach these centred fleet headings to their rows, so every
    fleet arrives with a blank div and collapses into one table with duplicate
    ranks. Fleet sections are delimited by the per-fleet 'Sailed: N … Entries:
    E …' summary line; the name is the nearest heading line above it, and the
    sail numbers listed under it belong to that fleet. Returns {} unless ≥2
    distinct fleets are present."""
    lines = full_text.split('\n')
    summ = [i for i, l in enumerate(lines)
            if re.search(r'sailed:\s*\d+.*entries:\s*\d+', l, re.IGNORECASE)]
    if len(summ) < 2:
        return {}

    def section_name(si):
        for k in range(si - 1, max(-1, si - 6), -1):
            t = lines[k].strip()
            if not t:
                continue
            tl = t.lower()
            if tl.startswith('rank') or 'sailed:' in tl or tl.startswith('contents'):
                continue
            return re.sub(r'\s+', ' ', t)
        return ''

    # NAT + sail number, anchored so a glued WS_id (e.g. GREKP16) can't match.
    sail_re = re.compile(r'(?:^|\s)[A-Z]{3}\s?(\d{2,7})\b')
    out = {}
    for n, si in enumerate(summ):
        name = section_name(si)
        if not name:
            continue
        end = summ[n + 1] if n + 1 < len(summ) else len(lines)
        for l in lines[si + 1:end]:
            for m in sail_re.finditer(l):
                out.setdefault(m.group(1), name)
    if len(set(out.values())) < 2:
        return {}
    return out

def _resolve_birth_years(entries, ev_year):
    for e in entries:
        if e.get('birth_year') is None and e.get('_age') and ev_year:
            e['birth_year'] = ev_year - e['_age']
        if e.get('crew_birth_year') is None and e.get('_crew_age') and ev_year:
            e['crew_birth_year'] = ev_year - e['_crew_age']
        e.pop('_age', None); e.pop('_crew_age', None)

def _discards_from_brackets(ents, fallback):
    """The number of discards in effect = the most common non-zero count of
    bracketed scores across competitors (a fully-raced sailor shows exactly the
    discard-rule number of brackets). Falls back to the header value when no
    bracket data is present (e.g. AI-parsed rows)."""
    from collections import Counter
    counts = [e.get('_disc', 0) for e in ents if e.get('races')]
    nonzero = [c for c in counts if c > 0]
    if not nonzero:
        return fallback
    return Counter(nonzero).most_common(1)[0][0]

_FLEET_STRIP_RE = re.compile(
    r'\b(men|man|male|women|woman|female|boys?|girls?|mixed|mix|junior|jr|'
    r'youth|cadet|master|veteran|senior|open|overall|main|all|ladies|lady|'
    r'gold|silver|bronze|emerald|sapphire|fleet|division|'
    r'u\d{1,2}|under\s*\d{1,2})\b', re.IGNORECASE)

def _looks_like_fleet_label(value):
    low = str(value or '').strip().lower()
    if not low:
        return False
    stripped = _FLEET_STRIP_RE.sub(' ', low)
    stripped = re.sub(r'[\s,]+', ' ', stripped).strip()
    return len(stripped) >= 2

def _finalize(all_entries, ev_name, ev_date, discards, base_notes, source_label="the built-in parser",
              detected_class='', detected_host=None):
    """
    Group entries and decide single vs multi. Grouping key:
      1. the per-row fleet/class label (div) when those values name real classes
         (Southside's "Dinghy Class / Fleet" column, or Gold/Silver splits), else
      2. the per-table class context (_tbl_class, from each table's section
         heading) when several tables carry distinct classes (e.g. a page with
         separate 49er / 49erFX / Nacra tables), else
      3. everything in one result.
    Then: a single group → single; all-colour-split groups → merged championship;
    otherwise → multi, one competition per group.
    """
    from collections import OrderedDict

    div_vals  = [(e.get('div') or '').strip() for e in all_entries]
    distinct_div = [v for v in dict.fromkeys(div_vals) if v]

    tbl_vals  = [(e.get('_tbl_class') or '').strip() for e in all_entries]
    distinct_tbl = [v for v in dict.fromkeys(tbl_vals) if v]

    if len(distinct_div) >= 2:
        # per-row fleet/class column distinguishes the fleets (Southside, Euro)
        key_fn = lambda e: (e.get('div') or '').strip() or '__main__'
    elif len(distinct_tbl) >= 2:
        # per-row column is uniform/blank, but separate tables carry distinct
        # classes (e.g. a page with 49er / 49erFX / Nacra tables)
        key_fn = lambda e: (e.get('_tbl_class') or '').strip() or '__main__'
    else:
        key_fn = lambda e: (e.get('div') or '').strip() or '__main__'

    groups, seen = OrderedDict(), {}
    for e in all_entries:
        key = key_fn(e)
        if key not in groups:
            groups[key] = []; seen[key] = set()
        sk = (e['helm'].lower(), e.get('sail', ''))
        if sk in seen[key]:
            continue
        seen[key].add(sk); groups[key].append(e)
    for k in groups:
        groups[k].sort(key=lambda e: (e.get('pdf_rank') if e.get('pdf_rank') is not None else 9999))
        for e in groups[k]:
            e.pop('_tbl_class', None)   # internal-only, never reaches client/DB

    # A Nat column that came back empty on every row → nationalities are flag
    # images (no text). Flag this so the client can read them with a small AI pass.
    nat_from_flags = (any(e.get('_nat_col') for e in all_entries)
                      and not any((e.get('nat') or '').strip() for e in all_entries))
    for e in all_entries:
        e.pop('_nat_col', None)
    real = [k for k in groups if groups[k]]
    n_total = sum(len(groups[k]) for k in real)
    n_gender = sum(1 for k in real for e in groups[k] if e.get('gender'))
    n_cat    = sum(1 for k in real for e in groups[k] if e.get('category'))
    notes = list(base_notes)
    if n_gender: notes.append(f"Detected gender on {n_gender} of {n_total} rows.")
    if n_cat:    notes.append(f"Detected age category on {n_cat} of {n_total} rows.")

    # Single fleet (or only the unlabelled bucket) → one result
    if len(real) <= 1:
        ents = groups[real[0]] if real else []
        g_disc = _discards_from_brackets(ents, discards)
        for e in ents: e.pop('_disc', None)
        return {'ok':True,'multi':False,'name':ev_name,'date':ev_date,
                'discards':g_disc,'entries':ents,'notes':notes,'nat_from_flags':nat_from_flags,
                'detected_class':detected_class,'detected_host':detected_host}

    # Group fleets by their base championship. Colour splits (Gold/Silver/Bronze)
    # of the SAME base merge into one result (Silver places below Gold); different
    # bases stay separate. This keeps a single-gender Gold/Silver championship as
    # one event, while Boys-Gold/Boys-Silver/Girls-Gold/Girls-Silver become two
    # (Boys, Girls) — not one merged blob with duplicate ranks. Non-colour keys
    # (distinct classes / handicap divisions) are each their own base.
    bases = OrderedDict()
    for k in real:
        b = _fleet_base(k) if (k != '__main__' and _is_colour_fleet(k)) else k
        bases.setdefault(b, []).append(k)

    def _merge_keys(keys):
        merged, mseen = [], set()
        for kk in sorted(keys, key=_colour_rank):
            for e in groups[kk]:
                sk = (e['helm'].lower(), e.get('sail', ''))
                if sk not in mseen:
                    mseen.add(sk); merged.append(e)
        # Colour splits are qualifying/final fleets of ONE championship: Silver
        # boats place below all Gold boats, but each fleet's ranks restart at 1.
        # Renumber to the true overall standing (Gold order, then Silver order).
        if len(keys) > 1 and all(_is_colour_fleet(k) for k in keys):
            for pos, e in enumerate(merged, 1):
                e['pdf_rank'] = pos
        return merged

    # Exactly one base, made of ≥2 colour splits → one merged championship.
    if len(bases) == 1:
        only_keys = next(iter(bases.values()))
        if len(only_keys) > 1 and all(_is_colour_fleet(k) for k in only_keys):
            merged = _merge_keys(only_keys)
            notes.append(f"Merged {len(only_keys)} qualifying/final fleets into one result.")
            g_disc = _discards_from_brackets(merged, discards)
            for e in merged: e.pop('_disc', None)
            return {'ok':True,'multi':False,'name':ev_name,'date':ev_date,
                    'discards':g_disc,'entries':merged,'notes':notes,'nat_from_flags':nat_from_flags,
                    'detected_class':detected_class,'detected_host':detected_host}

    # Otherwise: one competition per base (colour splits merged within each base).
    fleets = []
    for b, keys in bases.items():
        ents = _merge_keys(keys) if len(keys) > 1 else groups[keys[0]]
        g_disc = _discards_from_brackets(ents, discards)
        for e in ents: e.pop('_disc', None)
        fleets.append({'name': (b if b != '__main__' else ''),
                       'entries': ents, 'discards': g_disc, 'count': len(ents)})
    labels = [f['name'] or 'Main' for f in fleets]
    notes.append(f"Separated into {len(fleets)} fleets: {', '.join(labels)}.")
    return {'ok':True,'multi':True,'name':ev_name,'date':ev_date,'notes':notes,'fleets':fleets,
            'nat_from_flags':nat_from_flags,'detected_class':detected_class,'detected_host':detected_host}


# ── Format registry (detection layer) ──────────────────────────────────────
# An explicit, ordered map from a format FAMILY to the signatures that identify
# it and the existing extractor (if any) that handles it. This is a *detection*
# layer only — it re-labels what the cascade in _rule_based_parse already does,
# so a `detected_format` verdict can ride along on every result for diagnostics
# and future routing WITHOUT changing any parse semantics. Signatures come from
# docs/parser-formats.md.

def _meta_get(pdf_meta, key):
    """Case-tolerant lookup into a pdfplumber metadata dict (keys are usually
    title-cased: Title/Producer/Creator, but be defensive)."""
    if not isinstance(pdf_meta, dict):
        return ''
    v = pdf_meta.get(key)
    if v is None:
        for k, vv in pdf_meta.items():
            if str(k).lower() == key.lower():
                v = vv
                break
    return str(v or '')


def _sig_sailwave(fb, low, meta):
    if 'sailwave scoring software' in low:
        return True
    if _meta_get(meta, 'Title').lower().startswith('sailwave results for'):
        return True
    if 'sailwave results for' in low:
        return True
    return bool(re.search(r'sailed:\s*\d+.*entries:\s*\d+', low))


def _sig_manage2sail(fb, low, meta):
    return ('powered by www.manage2sail.com' in low
            or 'manage2sail report' in _meta_get(meta, 'Title').lower())


def _sig_sailti(fb, low, meta):
    return 'sailti scoring soft' in low


def _sig_sailwave_html_native(fb, low, meta):
    """Sailwave's own 'publish to HTML' (NOT the ourclubadmin re-host): the title
    starts 'Sailwave results for …', headers are tablesorter <th> divs, and there
    is no ourclubadmin stamp."""
    if 'ourclubadmin' in low:
        return False
    has_title = (_meta_get(meta, 'Title').lower().startswith('sailwave results for')
                 or 'sailwave results for' in low)
    return has_title and 'tablesorter-header-inner' in low


def _sig_sailti_web(fb, low, meta):
    # Live sailti.com / SailingGrandSlam / Somvela page: either the classic
    # 'Last update:' + colour-fleet stamp, or the hidden 'punt_<Fleet>' sort spans
    # / SailingGrandSlam / Somvela markers in the saved HTML.
    if 'punt_' in low or 'sailinggrandslam' in low or 'somvela' in low:
        return True
    return bool(re.search(r'last update:\s*\d', low)) and bool(
        re.search(r'\b(gold|silver|bronze|emerald|sapphire|yellow|blue|red|green|white)\b', low))


def _sig_sailingresults(fb, low, meta):
    return 'results by sailingresults.net' in low or 'sailingresults.net' in low


def _sig_clubspot(fb, low, meta):
    return 'theclubspot.com' in low


def _sig_overall_results(fb, low, meta):
    return 'overall results of' in low


def _sig_topyacht(fb, low, meta):
    if re.search(r'results by\s*:\s*topyacht', low):
        return True
    return 'series results [' in low and 'updated:' in low


def _sig_bornan(fb, low, meta):
    return 'timing and results provided by bornan' in low


def _sig_hubsail(fb, low, meta):
    return 'hubsail' in _meta_get(meta, 'Title').lower()


def _sig_aspose(fb, low, meta):
    return 'aspose.pdf' in _meta_get(meta, 'Producer').lower()


def _sig_cn_games(fb, low, meta):
    return 'pdftools sdk' in _meta_get(meta, 'Producer').lower()


def _sig_ws_resultscentre(fb, low, meta):
    return ('results centre' in _meta_get(meta, 'Title').lower()
            or 'results centre' in low)


def _sig_asiansailing(fb, low, meta):
    return 'asiansailing.org' in low


def _sig_excel_print(fb, low, meta):
    prod = _meta_get(meta, 'Producer').lower()
    title = _meta_get(meta, 'Title').lower()
    if 'gpl ghostscript' in prod or 'microsoft® excel®' in prod or 'microsoft(r) excel' in prod:
        return True
    return title.endswith('.xls') or title.endswith('.xlsx')


def _sig_pya(fb, low, meta):
    return 'events.pya.org.pl' in low


def _sig_ourclubadmin(fb, low, meta):
    return 'ourclubadmin' in low


# Ordered registry. `input_types` is the set of input kinds a family is seen in;
# `detect(file_bytes, full_text_lower, pdf_meta) -> bool`; `extractor` points at
# the EXISTING rule function for families with a rule path today, else None.
FORMAT_REGISTRY = [
    # Domain/markup-specific HTML families first — the pya-events and native
    # Sailwave pages also carry generic Sailwave stamps ('sailwave scoring
    # software', 'Sailed:/Entries:'), so their precise signatures must win over
    # the generic `sailwave` family below.
    {"family": "sailwave-html-native", "input_types": ["html"],
     "detect": _sig_sailwave_html_native, "extractor": None},
    {"family": "pya-events",   "input_types": ["html"],
     "detect": _sig_pya,            "extractor": None},
    {"family": "sailwave",     "input_types": ["pdf-text", "pdf-scanned", "html"],
     "detect": _sig_sailwave,       "extractor": try_sailwave_text},
    {"family": "manage2sail",  "input_types": ["pdf-text"],
     "detect": _sig_manage2sail,    "extractor": None},
    {"family": "sailti",       "input_types": ["pdf-text"],
     "detect": _sig_sailti,         "extractor": try_sailti},
    {"family": "sailti-web",   "input_types": ["html", "pdf-text", "pdf-scanned"],
     "detect": _sig_sailti_web,     "extractor": try_sailti_web},
    {"family": "sailingresults", "input_types": ["pdf-text"],
     "detect": _sig_sailingresults, "extractor": try_sailingresults},
    {"family": "clubspot",     "input_types": ["pdf-text"],
     "detect": _sig_clubspot,       "extractor": try_clubspot},
    {"family": "overall-results", "input_types": ["pdf-text"],
     "detect": _sig_overall_results, "extractor": try_overall_results},
    {"family": "topyacht",     "input_types": ["pdf-text"],
     "detect": _sig_topyacht,       "extractor": try_topyacht},
    {"family": "bornan",       "input_types": ["pdf-text"],
     "detect": _sig_bornan,         "extractor": try_bornan},
    {"family": "hubsail",      "input_types": ["pdf-text"],
     "detect": _sig_hubsail,        "extractor": None},
    {"family": "aspose-bilingual-cn", "input_types": ["pdf-text", "pdf-scanned"],
     "detect": _sig_aspose,         "extractor": try_aspose_cn},
    {"family": "cn-games-book", "input_types": ["pdf-text"],
     "detect": _sig_cn_games,       "extractor": None},
    {"family": "worldsailing-resultscentre", "input_types": ["pdf-text"],
     "detect": _sig_ws_resultscentre, "extractor": None},
    {"family": "asiansailing-wordpress", "input_types": ["pdf-text"],
     "detect": _sig_asiansailing,   "extractor": try_asiansailing},
    {"family": "excel-print-pdf", "input_types": ["pdf-text"],
     "detect": _sig_excel_print,    "extractor": try_excel_print},
    {"family": "ourclubadmin", "input_types": ["html", "pdf-text"],
     "detect": _sig_ourclubadmin,   "extractor": None},
]


def detect_format(file_bytes, full_text_lower, pdf_meta):
    """Classify a document into (family, input_type, confidence).

    input_type ∈ 'pdf-text'|'pdf-scanned'|'image'|'html'|'xlsx'|'csv'|'blw'.
    Detection is cheap and pure: it only reads the (already-extracted) lower-cased
    text and the PDF metadata dict. `confidence` is a coarse signal: 0.9 for a
    matched family, 0.3 for 'unknown'. Never raises."""
    low = full_text_lower or ''
    meta = pdf_meta if isinstance(pdf_meta, dict) else {}

    # ── input_type ──
    fb = file_bytes or b''
    if fb[:4] == b'%PDF' or (not fb and (low or meta)):
        # PDF (or a caller that only handed us extracted text) → text vs scanned.
        input_type = 'pdf-text'
        # pdf-scanned = near-zero extractable text. Approximate the per-page
        # average from the metadata page count when available, else fall back to
        # a small absolute threshold.
        try:
            npages = int(meta.get('_page_count') or 0)
        except (TypeError, ValueError):
            npages = 0
        nchars = len((full_text_lower or '').strip())
        if npages > 0:
            if nchars / max(1, npages) < 40:
                input_type = 'pdf-scanned'
        elif nchars < 40:
            input_type = 'pdf-scanned'
    elif fb[:8] == b'\x89PNG\r\n\x1a\n' or fb[:3] == b'\xff\xd8\xff' \
            or (fb[:4] == b'RIFF' and fb[8:12] == b'WEBP') or fb[:6] in (b'GIF87a', b'GIF89a'):
        input_type = 'image'
    elif fb[:4] == b'PK\x03\x04':
        input_type = 'xlsx'
    elif fb[:4] == b'\xd0\xcf\x11\xe0':
        input_type = 'xlsx'
    elif fb[:4] == b'"ser':
        input_type = 'blw'
    else:
        head = fb[:512].lstrip().lower()
        if head[:5] == b'<html' or head[:9] == b'<!doctype' or b'<table' in fb[:4000].lower():
            input_type = 'html'
        else:
            input_type = 'pdf-text'

    # ── family ──
    for spec in FORMAT_REGISTRY:
        try:
            if spec["detect"](fb, low, meta):
                return spec["family"], input_type, 0.9
        except Exception:
            continue
    return 'unknown', input_type, 0.3


def _rule_based_parse(pdf_bytes: bytes) -> dict:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        _pdf_meta = dict(pdf.metadata or {})
        _npages = len(pdf.pages)
        full_text = '\n'.join(p.extract_text() or '' for p in pdf.pages)
        all_tables = []
        for page in pdf.pages:
            for strategy in (
                {'vertical_strategy': 'lines',  'horizontal_strategy': 'lines'},
                {'vertical_strategy': 'text',   'horizontal_strategy': 'text'},
            ):
                tbls = page.extract_tables(strategy) or []
                if tbls:
                    all_tables.extend(tbls); break

    ev_name  = extract_event_name(full_text)
    discards = extract_discards(full_text)
    ev_date  = extract_date(full_text)
    results  = []

    # Classify the document once (detection layer only — does not alter parsing).
    _meta_for_detect = dict(_pdf_meta); _meta_for_detect['_page_count'] = _npages
    _fam, _itype, _conf = detect_format(pdf_bytes, full_text.lower(), _meta_for_detect)
    _detected_format = {"family": _fam, "input_type": _itype, "confidence": _conf}

    # ── pdfplumber table extraction ───────────────────────────────
    all_parsed = []
    if all_tables:
        detected_fleets = detect_fleets_in_text(full_text)
        current_fleet = detected_fleets[0] if len(detected_fleets) == 1 else ''

        for tbl in all_tables:
            if not tbl: continue
            first_text = ' '.join(str(c or '') for c in (tbl[0] or []))
            for fleet in detected_fleets:
                if fleet.lower() in first_text.lower():
                    current_fleet = fleet; break
            fleet_sec = re.search(
                r'(\d+-(?:Gold|Silver|Bronze|Emerald)\s+Fleet|Gold Fleet|Silver Fleet|Bronze Fleet)',
                first_text, re.IGNORECASE
            )
            if fleet_sec:
                current_fleet = fleet_sec.group(1)
            # An "Open Division" / handicap / PY section heading marks a mixed-class
            # one-fleet boundary (kept together; rows tagged with row_class).
            open_sec = re.search(
                r'(Open\s+Division|Handicap\s+Division|Performance\s+Handicap'
                r'|Open\s+Fleet|Handicap\s+Fleet|PY\s+Division)',
                first_text, re.IGNORECASE)
            if open_sec:
                current_fleet = re.sub(r'\s+', ' ', open_sec.group(1)).strip()

            # fleet_hint fills e['div'] only when the row has no class/fleet column,
            # so a per-row "Dinghy Class / Fleet" column always wins.
            parsed = parse_table(tbl, current_fleet)
            if parsed and parsed['entries']:
                all_parsed.extend(parsed['entries'])

    # ── excel-print-pdf shim ──────────────────────────────────────
    # Excel sheets printed to PDF (GPL Ghostscript/PScript5, or a .xls(x) Title)
    # carry a merged 2-line title row and a blank/odd-labelled header that the
    # generic table path mis-parses. Clean the tables and re-run parse_table;
    # prefer the result whenever it reads at least as many rows. The merged
    # title row also yields a better event name than the generic heuristic.
    _excel_prod  = _meta_get(_pdf_meta, 'Producer').lower()
    _excel_title = _meta_get(_pdf_meta, 'Title').lower()
    if ('gpl ghostscript' in _excel_prod or 'pscript5' in _excel_prod
            or 'microsoft® excel®' in _excel_prod or 'microsoft(r) excel' in _excel_prod
            or _excel_title.endswith('.xls') or _excel_title.endswith('.xlsx')):
        _ex_ents, _ex_name = try_excel_print(all_tables, full_text, _pdf_meta)
        if _ex_ents and len(_ex_ents) >= len(all_parsed):
            all_parsed = _ex_ents
            if _ex_name:
                ev_name = _ex_name
            # The dropped 'Discard' column bleeds into extract_discards' header
            # match (no colon after the word), giving a bogus count. The bracket
            # count in the race cells is authoritative here; when no cell is
            # bracketed we simply don't know, so fall back to 0 rather than noise.
            discards = 0

    # ── Clubspot fallback ─────────────────────────────────────────
    if not all_parsed:
        cs = try_clubspot(full_text)
        if cs:
            all_parsed.extend(cs)

    # ── Text-line fallbacks (formats pdfplumber can't cleanly tabulate) ──
    # Signature-gated and only when the table path is empty or clearly deficient,
    # so clean Sailwave/manage2sail tables are never disturbed.
    sig = full_text.lower()
    if 'sailingresults.net' in sig and len(all_parsed) < 3:
        sr = try_sailingresults(full_text)
        if sr and len(sr) > len(all_parsed):
            all_parsed = sr
    if 'sailwave results for' in sig or re.search(r'sailed:\s*\d+.*entries:\s*\d+', sig):
        declared = max([int(x) for x in re.findall(r'[Ee]ntries:\s*(\d+)', full_text)] or [0])
        deficient = (not all_parsed) or len(all_parsed) < 5 or (declared and len(all_parsed) < 0.5 * declared)
        if deficient:
            # Two-person Sailwave (helm+crew, wrapped) needs word-geometry; the
            # flat-text parser handles the single-hander ordinal layout.
            gw = try_sailwave_geometry(pdf_bytes)
            if gw and len(gw) > len(all_parsed):
                all_parsed = gw
            else:
                sw = try_sailwave_text(full_text)
                if sw and len(sw) > len(all_parsed):
                    all_parsed = sw

    # Sailti Scoring Soft (TCPDF): pdfplumber finds no usable table, so parse
    # from text. Deterministic + complete (reads every page) — replaces the slow,
    # token-heavy AI path that truncated long fields and misaligned rows.
    if 'sailti scoring soft' in sig:
        declared = max([int(x) for x in re.findall(r'Entries\s*:\s*(\d+)', full_text)] or [0])
        deficient = (not all_parsed) or len(all_parsed) < max(5, 0.5 * declared)
        if deficient:
            st = try_sailti(full_text)
            if st and len(st) > len(all_parsed):
                all_parsed = st

    # TopYacht (Australian club scoring): pdfplumber DOES find a grid, but it
    # mis-parses this family — race columns print in REVERSE (Race N…Race 1),
    # penalty codes are single-letter suffixes ('[19.0O]'), and the per-class
    # section heading (div) and Sers Score (total) are lost. So the signature-
    # gated text parse is authoritative here: prefer it whenever it reads at
    # least as many rows as the grid did.
    if re.search(r'results by\s*:\s*topyacht', sig) or ('series results [' in sig and 'updated:' in sig):
        ty = try_topyacht(full_text)
        if ty and len(ty) >= len(all_parsed):
            all_parsed = ty
            ev_date = ''      # only the 'Updated:' stamp is printed — not an event date

    # sailti-web (scoring.sailti.com / SailOptimist browser prints): text reading
    # order is jumbled (NAT stacked over sail, wrapped names, penalty codes on
    # neighbouring lines), so parse by word geometry when the table path is thin.
    if re.search(r'last update:\s*\d', sig) and re.search(
            r'\b(gold|silver|bronze|emerald|sapphire|yellow|blue|red|green|white)\b', sig):
        if (not all_parsed) or len(all_parsed) < 5:
            sw = try_sailti_web(full_text, pdf_bytes)
            if sw and len(sw) > len(all_parsed):
                all_parsed = sw
                # Event name = PDF Title metadata / big heading (better than the
                # generic heuristic here). Date: the only stamp in these prints is
                # 'Last update' which is NOT the event date — leave it empty unless
                # a real date range was printed AND it isn't the update stamp.
                _title = _meta_get(_pdf_meta, 'Title').strip()
                if _title:
                    ev_name = _title
                if ev_date and re.search(
                        r'last update:\s*\d{1,2}/\d{1,2}/' + re.escape(ev_date[-4:]), sig):
                    ev_date = ''

    # aspose-bilingual-cn (Aspose.PDF Chinese notice-board results): the results
    # grid is the same bilingual "Overall Results of …" layout, so try_aspose_cn
    # delegates rows to that core. Signature-gated on the Aspose Producer (threaded
    # via _pdf_meta). Also recover the ENGLISH event line and the CJK date stamp
    # ("2025年6月8日" → dd/mm/yyyy) that the generic heuristics miss.
    if 'aspose.pdf' in _meta_get(_pdf_meta, 'Producer').lower():
        if (not all_parsed) or len(all_parsed) < 3:
            ac = try_aspose_cn(full_text)
            if ac and len(ac) > len(all_parsed):
                all_parsed = ac
        if all_parsed:
            _aev = _aspose_cn_event(full_text)
            if _aev:
                ev_name = _aev
            _adate = _aspose_cn_date(full_text)
            if _adate:
                ev_date = _adate

    # bornan (AG2022 Bornan/Stimulsoft timing): stacked score codes + H/C crew
    # cells need word geometry, so parse by X-position. The Stimulsoft grid path
    # mis-reads these cells, so this extractor wins whenever it reads at least as
    # many rows.
    if 'timing and results provided by bornan' in sig:
        bn = try_bornan(full_text, pdf_bytes)
        if bn and len(bn) >= len(all_parsed):
            all_parsed = bn
            # Event name = the English class/title line (bilingual CN/EN stacked,
            # e.g. "Women's Single Dinghy - ILCA6" / "Men's Skiff - 49er").
            for _l in full_text.split('\n')[:8]:
                _s = _l.strip()
                if re.search(r'[A-Za-z]', _s) and not re.search(r'[一-鿿]', _s) \
                   and re.search(r'(?i)(single|skiff|dinghy|men|women|ilca|49er|470|420|nacra)', _s):
                    ev_name = _s[:120]; break
            # Date from the "As of <DOW> DD MON YYYY" stamp → dd/mm/yyyy.
            _bd = re.search(r'As of\s+(?:[A-Z]{3}\s+)?(\d{1,2})\s+([A-Za-z]{3})\s+(20\d\d)',
                            full_text, re.IGNORECASE)
            if _bd:
                _bm = _MONTHS.get(_bd.group(2)[:3].lower())
                if _bm:
                    ev_date = f"{int(_bd.group(1)):02d}/{_bm:02d}/{_bd.group(3)}"

    # worldsailing-resultscentre (World Sailing "Results Centre" microsite print):
    # DELIBERATELY LEFT TO VISION (extractor=None). The thin text layer parses by
    # word geometry, but these docs carry NO sail number (nation-only ID → the
    # confidence gate can never clear 0.6), the MNA/nat column offset drifts per
    # document, and 3-line wrapped crew names split ambiguously. A deterministic
    # parse here would be flaky, so the family routes to vision AI (its PDF Title
    # still names the family as a hint). See the detection registry (extractor
    # None) and docs/parser-formats.md.

    # asiansailing-wordpress (asiansailing.org article print w/ Sailwave tables):
    # heavy web-column word-wrap + nat-over-sail stacking → word geometry. The
    # 'Sailed:' fleet blocks also match the generic Sailwave path, which mis-reads
    # the wrapped web layout, so this specific extractor wins whenever it reads at
    # least as many rows (nat stacked over sail + per-fleet div are only recovered
    # here). Signature = the asiansailing.org URL stamp.
    if 'asiansailing.org' in sig:
        asn = try_asiansailing(full_text, pdf_bytes)
        if asn and len(asn) >= len(all_parsed):
            all_parsed = asn
            # Event name = the '<...> Cup (2016 – 17) Series' run from the article
            # title (PDF Title or the first in-text occurrence), truncated at the
            # article-headline suffix ('– Esctasy…'). Date from the article's own
            # date line; the browser print-header timestamp ('23/06/2026, 10:30')
            # is NOT the event date.
            _src = _meta_get(_pdf_meta, 'Title') or full_text
            _am = re.search(r'([A-Z][A-Za-z0-9 ]*?Cup\s*\(20\d\d\s*[–\-]\s*\d{2}\)(?:\s+Series)?)', _src)
            if _am:
                ev_name = re.sub(r'\s+', ' ', _am.group(1)).replace('–', '-').strip()
            _adm = re.search(r'\b([A-Za-z]+)\s+(\d{1,2}),\s*(20\d\d)\b', full_text)
            if _adm:
                _mo = _MONTHS.get(_adm.group(1)[:3].lower())
                if _mo:
                    ev_date = f"{int(_adm.group(2)):02d}/{_mo:02d}/{_adm.group(3)}"

    # "Overall Results of <division>" books (bilingual, no ruled table) — parse
    # from text and tag div per section so divisions stay separate.
    if not all_parsed and 'overall results of' in sig:
        orr = try_overall_results(full_text)
        if orr:
            all_parsed = orr

    # Sailwave multi-fleet: the table extractor drops the fleet headings, so
    # rows from every fleet arrive with a blank div and collapse into one table
    # with duplicate ranks. Recover each row's fleet from the text sections
    # (sail number → fleet), then carry that assignment forward in document
    # order to fill any row whose sail didn't match. Only split when the map
    # covers a strong majority (else leave as-is — safe), and only fill a blank
    # div (a real per-row class/fleet column still wins).
    if ('sailwave results for' in sig or re.search(r'sailed:\s*\d+.*entries:\s*\d+', sig)) \
       and not any((e.get('div') or '').strip() for e in all_parsed) and all_parsed:
        fleet_map = _sailwave_fleet_map(full_text)
        if fleet_map:
            cand = [fleet_map.get(re.sub(r'\D', '', str(e.get('sail') or ''))) for e in all_parsed]
            hit = sum(1 for c in cand if c)
            distinct = len({c for c in cand if c})
            if distinct >= 2 and hit >= 0.6 * len(all_parsed):
                # Fill gaps by carrying the last seen fleet forward, then
                # back-fill any leading gap with the first fleet seen.
                last = None
                for i, c in enumerate(cand):
                    if c:
                        last = c
                    elif last:
                        cand[i] = last
                first = next((c for c in cand if c), None)
                for i in range(len(cand)):
                    if cand[i] is None:
                        cand[i] = first
                    else:
                        break
                for e, c in zip(all_parsed, cand):
                    if c and not (e.get('div') or '').strip():
                        e['div'] = c

    if not all_parsed:
        raise ValueError(
            'No results table found. Supported: Sailwave, Manage2sail, SailingResults.net, Clubspot. '
            'For other formats use Manual entry.'
        )

    # Resolve age → birth year now that the event year is known.
    ym = re.search(r'\b(20[0-2]\d|19[5-9]\d)\b', (ev_date or '') + ' ' + (ev_name or '') + ' ' + full_text[:400])
    ev_year = int(ym.group(0)) if ym else None
    _resolve_birth_years(all_parsed, ev_year)

    base_notes = [
        "Recognised a known results format — used the built-in parser.",
        f"Read {len(all_parsed)} competitor rows.",
    ]
    headings_text = ' '.join(detect_fleets_in_text(full_text)) + ' ' + full_text[:1500]
    detected_class = detect_class(all_parsed, ev_name, headings_text)
    detected_host  = detect_host(full_text)
    res = _finalize(all_parsed, ev_name, ev_date, discards, base_notes,
                    detected_class=detected_class, detected_host=detected_host)
    # Stash document size so the confidence gate can spot silent row-dropping
    # (a big PDF that produced almost no entries).
    if isinstance(res, dict):
        res["_text_lines"] = len(full_text.splitlines())
        res["detected_format"] = _detected_format
    return res


def _detect_mime(data: bytes) -> str:
    """Sniff file type from magic bytes. Returns a mime type string."""
    if data[:4] == b"%PDF":
        return "application/pdf"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    # ── ZIP container (PK) — xlsx is a zip; peek the namelist for 'xl/' parts.
    # Checked BEFORE the HTML sniff so an .xlsx never falls through to pdfplumber.
    if data[:4] == b"PK\x03\x04":
        try:
            import zipfile
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                if any(n.startswith('xl/') for n in zf.namelist()):
                    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        except Exception:
            pass
        return "application/zip"
    # ── OLE2 compound file (legacy .xls) ──
    if data[:4] == b"\xd0\xcf\x11\xe0":
        return "application/vnd.ms-excel"
    # ── Sailwave project export (.blw): first line begins "ser… ──
    if data[:4] == b'"ser':
        return "application/x-sailwave-blw"
    head = data[:512].lstrip().lower()
    if head[:5] == b"<html" or head[:9] == b"<!doctype" or b"<table" in data[:4000].lower():
        return "text/html"
    # ── CSV: ≥2 commas or semicolons on ≥3 of the first 5 non-empty lines, no tags.
    try:
        sample = data[:8000].decode('utf-8', errors='replace')
    except Exception:
        sample = ''
    if '<' not in sample:
        lines = [l for l in sample.splitlines() if l.strip()][:5]
        delim_hits = sum(1 for l in lines
                         if l.count(',') >= 2 or l.count(';') >= 2)
        if len(lines) >= 3 and delim_hits >= 3:
            return "text/csv"
    return "application/pdf"  # default — let pdfplumber try


# ── xlsx / csv / blw ingestion ──────────────────────────────────────────────
def _finalize_flow(all_parsed, title_text, full_text, source_notes, source_label,
                   date_hint=None):
    """Shared tail for the xlsx/csv/blw parsers: resolve ages → birth years,
    detect class/host, and run the standard grouping/_finalize. Mirrors the flow
    at the end of _rule_based_parse so these formats produce identical result
    dicts. `date_hint` is a caller-supplied fallback date (e.g. a textual
    '9 & 10 September 2017' from an xlsx A1 title) used only when the standard
    numeric extractor finds nothing."""
    ev_name = extract_event_name(title_text) if title_text.strip() else 'Imported Regatta'
    ev_date = extract_date(full_text) or extract_date(title_text) or (date_hint or '')
    discards = extract_discards(full_text)
    ym = re.search(r'\b(20[0-2]\d|19[5-9]\d)\b',
                   (ev_date or '') + ' ' + (ev_name or '') + ' ' + (full_text or '')[:400])
    ev_year = int(ym.group(0)) if ym else None
    _resolve_birth_years(all_parsed, ev_year)
    headings_text = title_text + ' ' + (full_text or '')[:1500]
    detected_class = detect_class(all_parsed, ev_name, headings_text)
    detected_host  = detect_host(title_text + ' ' + (full_text or '')[:2000])
    return _finalize(all_parsed, ev_name, ev_date, discards, source_notes,
                     source_label=source_label,
                     detected_class=detected_class, detected_host=detected_host)


def _xlsx_split_blocks(grid):
    """Split a sheet (list-of-lists of strings) into blocks at rows that are
    empty or single-cell (merged title rows). Returns a list of
    (title, rows) where title is the raw text of the nearest preceding
    single-cell row and rows is the list of data/header rows in that block."""
    blocks = []
    cur_title = ''
    cur_rows = []
    def flush():
        if cur_rows:
            blocks.append((cur_title, list(cur_rows)))
    for row in grid:
        nonempty = [c for c in row if c.strip()]
        if not nonempty:
            flush(); cur_rows = []                 # blank row → block boundary
            continue
        if len(nonempty) == 1:
            # single-cell row = merged title. Boundary; adopt as the new title.
            flush(); cur_rows = []
            cur_title = nonempty[0].strip()
            continue
        cur_rows.append(row)
    flush()
    return blocks


def _xlsx_division_label(title, sheet_name):
    """The fleet label for an overall block. Prefer the sheet name (club
    workbooks name each sheet by fleet: 'Div A', 'Div B', 'OP'); fall back to a
    division name pulled from the block title 'Overall Result (Division A)'."""
    sn = (sheet_name or '').strip()
    if sn:
        return sn
    m = re.search(r'\(([^)]+)\)', title or '')
    if m:
        return re.sub(r'\s+', ' ', m.group(1)).strip()
    return re.sub(r'\s+', ' ', (title or '')).strip()


_XLSX_RACE_HDR = re.compile(r'^\s*(race|r)\s*\d+\s*$', re.IGNORECASE)
_XLSX_TIME_HDR = {'starttime', 'finishtime', 'elapsedtime', 'correctedtime',
                  'start', 'finish', 'elapsed', 'corrected'}


def _parse_xlsx_bytes(file_bytes: bytes) -> dict:
    """Parse a club workbook (.xlsx/.xls). Each sheet may carry merged title
    rows and stacked 'Race N (Division X)' blocks; the header row is NOT
    necessarily row 1. Strategy: split each sheet into blocks at empty/single-
    cell rows, detect a header per block, and PREFER an overall/series block
    (Total/Nett + race columns) over per-race time blocks."""
    try:
        import openpyxl
    except ImportError:
        raise ValueError("Excel parsing requires openpyxl — not installed on this deployment.")
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    except Exception as exc:
        raise ValueError(f"Couldn't read the Excel workbook: {exc}")

    all_parsed = []
    title_bits = []
    top_titles = []                 # sheet A1 merged titles (workbook-level name)
    for ws in wb.worksheets:
        grid = []
        for row in ws.iter_rows(values_only=True):
            grid.append(['' if c is None else str(c).strip() for c in row])
        # The workbook-level title is the FIRST single-cell (merged) row at the
        # very top of the sheet, above the per-block 'Race N (Division X)' rows.
        # Prefer it over block titles for the event name.
        for row in grid[:4]:
            ne = [c for c in row if c.strip()]
            if not ne:
                continue
            if len(ne) == 1:
                t = re.sub(r'\s+', ' ', ne[0]).strip()
                if t and not re.match(r'(?i)^race\s*\d', t) and t not in top_titles:
                    top_titles.append(t)
            break
        blocks = _xlsx_split_blocks(grid)
        if not blocks:
            continue

        # Classify each block by its header, tracking whether it's an overall
        # (series) block (Total/Nett/Net/Points + race columns) or a per-race
        # time block (Start/Finish/Elapsed/Corrected) which is noise when an
        # overall exists.
        overall_blocks, race_only_blocks = [], []
        for title, rows in blocks:
            # header is one of the first two rows; find it via detect_cols.
            hdr_idx = None
            for hi in range(min(2, len(rows))):
                if detect_cols([rows[hi]]):
                    cols = detect_cols([rows[hi]])
                    if 'rank' in cols or 'sail' in cols or 'helm' in cols or 'sailors' in cols:
                        hdr_idx = hi; break
            if hdr_idx is None:
                continue
            header = rows[hdr_idx]
            keys = [hdr_key(c) for c in header]
            has_total = any(k in ('total', 'totalpts', 'totalpoints', 'nett', 'net',
                                  'netpts', 'netpoints', 'points', 'pts') for k in keys)
            has_race  = any(_XLSX_RACE_HDR.match(c) or is_race_hdr(c) for c in header)
            has_time  = any(k in _XLSX_TIME_HDR for k in keys)
            data_rows = rows[hdr_idx + 1:]
            block_rec = (title, header, data_rows)
            if has_total and has_race:
                overall_blocks.append(block_rec)
            elif has_time and not (has_total and has_race):
                race_only_blocks.append(block_rec)          # per-race time noise
            else:
                # a per-race Points block with no overall — keep as a fallback
                race_only_blocks.append(block_rec)

        # Prefer overall/series blocks. Only fall back to per-race blocks when a
        # sheet has NO overall block at all — but never fabricate a series from
        # scattered per-race blocks: skip the sheet in that case.
        chosen = overall_blocks
        if not chosen:
            continue

        for title, header, data_rows in chosen:
            if not data_rows:
                continue
            fleet_hint = title  # nearest preceding single-cell title (raw value)
            tbl = [header] + data_rows
            parsed = parse_table(tbl, fleet_hint)
            if not (parsed and parsed['entries']):
                continue
            # An overall block is ONE scoring fleet (the sheet's division), even
            # though it mixes boat classes (420 + Laser 2000, etc.). Force every
            # row's fleet to the block's division label and demote the per-row
            # boat class to row_class (a tag) so the mixed classes don't split the
            # division into per-class sub-fleets.
            fleet_label = _xlsx_division_label(title, ws.title)
            for e in parsed['entries']:
                if (e.get('div') or '').strip() and not e.get('row_class'):
                    e['row_class'] = e['div']
                e['div'] = fleet_label
            all_parsed.extend(parsed['entries'])
        # Remember title rows for event-name extraction.
        for title, _rows in blocks:
            if title and title not in title_bits:
                title_bits.append(title)

    if not all_parsed:
        raise ValueError("No overall-results table found in this workbook.")

    # Prefer the workbook-level A1 title (event name) over block titles; the
    # block titles still follow it so date/division heuristics can read them.
    title_text = '\n'.join(top_titles + title_bits)
    base_notes = [
        "Read a club results workbook (Excel).",
        f"Read {len(all_parsed)} competitor rows.",
    ]
    # A club A1 title often carries a textual date range ('9 & 10 September 2017').
    date_hint = _textual_date('\n'.join(top_titles))
    return _finalize_flow(all_parsed, title_text, title_text, base_notes,
                          "the built-in Excel reader", date_hint=date_hint)


def _parse_csv_bytes(file_bytes: bytes) -> dict:
    """Parse a plain CSV of results as a single table."""
    import csv as _csv
    try:
        text = file_bytes.decode('utf-8')
    except UnicodeDecodeError:
        text = file_bytes.decode('latin-1', errors='replace')
    rows = list(_csv.reader(io.StringIO(text)))
    tbl = [['' if c is None else str(c).strip() for c in r] for r in rows if any(str(c or '').strip() for c in r)]
    parsed = parse_table(tbl)
    all_parsed = list(parsed['entries']) if parsed and parsed['entries'] else []
    if not all_parsed:
        raise ValueError("No results table found in this CSV.")
    base_notes = [
        "Read a CSV results file.",
        f"Read {len(all_parsed)} competitor rows.",
    ]
    return _finalize_flow(all_parsed, text[:400], text, base_notes,
                          "the built-in CSV reader")


def _parse_blw_bytes(file_bytes: bytes) -> dict:
    """Parse a raw Sailwave project file (.blw): CRLF lines of quoted 4-field
    CSV records "field","value","compid","raceid". Reconstructs competitors
    (comp* fields) and per-race scores (r* records) into the parser's entry
    shape. The uploaded file is ground truth — scores/codes are preserved
    verbatim, nothing is re-ranked."""
    import csv as _csv
    try:
        text = file_bytes.decode('utf-8')
    except UnicodeDecodeError:
        text = file_bytes.decode('latin-1', errors='replace')
    lines = re.split(r'\r\n|\r|\n', text)

    ser = {}                    # serevent, servenue, ...
    comp = {}                   # compid -> {field: value}
    comp_order = []             # first-seen order of compids
    rrec = {}                   # (compid, raceid) -> {field: value}
    seen_keys = set()           # (field, compid, raceid) dedupe — keep FIRST

    for l in lines:
        if not l.strip():
            continue
        try:
            rec = next(_csv.reader([l]))
        except Exception:
            continue
        if not rec:
            continue
        field = rec[0]
        value = rec[1] if len(rec) > 1 else ''
        compid = rec[2] if len(rec) > 2 else ''
        raceid = rec[3] if len(rec) > 3 else ''
        dk = (field, compid, raceid)
        if dk in seen_keys:
            continue            # dedupe duplicate records, keep first
        seen_keys.add(dk)

        if field.startswith('ser'):
            ser.setdefault(field, value)
        elif field.startswith('comp') and compid:
            if compid not in comp:
                comp[compid] = {}; comp_order.append(compid)
            comp[compid].setdefault(field, value)
        elif field in ('rpts', 'rdisc', 'rrestyp', 'rcod', 'rpos') and compid and raceid:
            rrec.setdefault((compid, raceid), {}).setdefault(field, value)

    if not comp:
        raise ValueError("No competitors found in this Sailwave (.blw) file.")

    # Race id ordering: numeric ascending.
    race_ids = sorted({rid for (_cid, rid) in rrec}, key=lambda x: (int(x) if x.isdigit() else 9999, x))

    def _num(v):
        try:
            n = float(v)
            return int(n) if n == int(n) else round(n, 2)
        except (TypeError, ValueError):
            return None

    entries = []
    for cid in comp_order:
        c = comp[cid]
        helm = clean_name(c.get('comphelmname', ''))
        crew = clean_name(c.get('compcrewname', ''))
        sail_raw = c.get('compsailno', '')
        nat_raw = c.get('compnat', '')
        div_raw = c.get('compdivision', '')
        ex_nat, clean_sail = parse_sail_country(sail_raw)
        if not nat_raw and ex_nat:
            nat_raw = ex_nat
        try:
            rank = int(c.get('comprank', '') or 0) or None
        except (ValueError, TypeError):
            rank = None
        total = _num(c.get('comptotal'))
        nett = _num(c.get('compnett'))

        races, race_codes, disc = [], [], 0
        for rid in race_ids:
            r = rrec.get((cid, rid))
            if not r or 'rpts' not in r:
                continue
            pts = _num(r.get('rpts'))
            if pts is None:
                continue
            code = (r.get('rcod') or '').strip() or None   # verbatim penalty code
            races.append(pts)
            race_codes.append(code)
            if (r.get('rdisc') or '') == '1':
                disc += 1

        if not helm or not races:
            continue
        # compdivision in a single-class Sailwave project is a demographic overlay
        # ("Open", "Open and Female"), NOT a scoring fleet — comprank already ranks
        # all competitors together. Only keep it as a fleet when it names a real
        # boat class; a gender word derives boat gender instead.
        div = div_raw if _looks_like_class(div_raw) else ''
        gender = combine_boat_gender(gender_from_text(div_raw), '') or gender_from_text(div_raw)
        entries.append({
            'helm': helm, 'crew': crew,
            'sail': clean_sail or '—', 'nat': flag_from_ioc(nat_raw),
            'div': div,
            'row_class': '', 'gender': gender, 'category': '',
            'races': races, 'race_codes': race_codes, '_disc': disc,
            'pdf_rank': rank, 'pdf_net': nett,
            'birth_year': None, 'crew_birth_year': None, '_age': None, '_crew_age': None,
        })

    if not entries:
        raise ValueError("No scored competitors found in this Sailwave (.blw) file.")

    # Sort by comprank (ascending; None last).
    entries.sort(key=lambda e: (e.get('pdf_rank') if e.get('pdf_rank') is not None else 9999))

    ev_name_raw = ser.get('serevent', '') or ser.get('sernoticetitle', '')
    venue = ser.get('servenue', '')
    title_text = ev_name_raw + '\n' + venue
    base_notes = [
        "Read a Sailwave project file (.blw).",
        f"Read {len(entries)} competitor rows.",
    ]
    return _finalize_flow(entries, title_text, title_text, base_notes,
                          "the built-in Sailwave (.blw) reader")


# ── HTML parsing (server-side, stdlib only) ─────────────────────────────────
from html.parser import HTMLParser as _HTMLParser
from html import unescape as _unescape

class _TableHarvester(_HTMLParser):
    """
    Minimal HTML table extractor. Produces a list of tables, each a list of
    rows, each a list of cell strings — the same shape pdfplumber yields — so
    the existing detect_cols / parse_table machinery can be reused verbatim.
    A flag image inside a cell contributes its title/alt (Sailwave nat codes).
    Headings (h1/h3) are captured for the event name + fleet section labels.
    """
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.headings = []        # (tag, text) for h1/h3
        self._tbl = None
        self._row = None
        self._cell = None
        self._heading_tag = None
        self._heading_buf = []
        self._table_anchor_text = []   # text seen just before each table (fleet label)
        self._recent_text = []
        self._last_heading = ''        # most recent heading (best fleet/class anchor)
        self._hidden_depth = 0         # >0 while inside a display:none element
        self._hidden_stack = []        # tag names that opened a hidden region

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        # Drop content of visually-hidden elements. Sailti-web (Grand Slam)
        # prefixes every race cell with a `<span style="display:none;">punt_Blue
        # _0000003</span>` sort key BEFORE the visible score — harvesting it would
        # corrupt the score. Track hidden container tags on a stack (void tags
        # like img/br carry no text so they never open a region).
        if tag not in ('br', 'img', 'hr', 'input', 'meta', 'link', 'wbr'):
            style = (a.get('style') or '').replace(' ', '').lower()
            hide = 'display:none' in style or 'visibility:hidden' in style
            self._hidden_stack.append(tag if hide else None)
            if hide:
                self._hidden_depth += 1
        if tag == 'table':
            self._tbl = []
            # The closest preceding heading (e.g. "Klasa: 49erFX") is the most
            # reliable fleet/class label; fall back to recent stray text.
            self._table_anchor_text.append(
                self._last_heading or ' '.join(self._recent_text[-4:]))
        elif tag == 'tr' and self._tbl is not None:
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = []
        elif tag == 'br' and self._cell is not None:
            # a line break inside a cell separates stacked content (e.g. helm
            # on one line, crew on the next, or a score and its code).
            self._cell.append('\n')
        elif tag in ('div', 'p', 'li') and self._cell is not None and any(
                c.strip() for c in self._cell):
            # block elements inside a cell also start a new visual line
            self._cell.append('\n')
        elif tag == 'img' and self._cell is not None:
            t = (a.get('title') or a.get('alt') or '').strip()
            if t:
                self._cell.append(' ' + t + ' ')
        elif tag in ('h1', 'h2', 'h3', 'h4'):
            self._heading_tag = tag
            self._heading_buf = []

    def handle_endtag(self, tag):
        if tag not in ('br', 'img', 'hr', 'input', 'meta', 'link', 'wbr') \
                and self._hidden_stack:
            if self._hidden_stack.pop() is not None:
                self._hidden_depth = max(0, self._hidden_depth - 1)
        if tag in ('td', 'th') and self._cell is not None:
            # collapse runs of spaces/tabs but KEEP newlines (they mark stacked
            # helm/crew names or score+code), then trim each line.
            raw = ''.join(self._cell)
            lines = [re.sub(r'[ \t]+', ' ', ln).strip() for ln in raw.split('\n')]
            txt = '\n'.join(ln for ln in lines if ln)
            self._row.append(txt)
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if any(c for c in self._row):
                self._tbl.append(self._row)
            self._row = None
        elif tag == 'table' and self._tbl is not None:
            if self._tbl:
                self.tables.append(self._tbl)
            self._tbl = None
        elif tag in ('h1', 'h2', 'h3', 'h4') and self._heading_tag == tag:
            txt = re.sub(r'\s+', ' ', ''.join(self._heading_buf)).strip()
            if txt:
                self.headings.append((tag, txt))
                self._recent_text.append(txt)
                self._last_heading = txt
            self._heading_tag = None

    def handle_data(self, data):
        if self._hidden_depth > 0:
            return                      # inside a display:none region — drop it
        if self._cell is not None:
            self._cell.append(data)
        elif self._heading_tag is not None:
            self._heading_buf.append(data)
        else:
            t = data.strip()
            if t:
                self._recent_text.append(t)
                # "Klasa: 49erFX" / "Class: ILCA 6" act as a fleet/class label even
                # when they aren't a formal heading element.
                if re.match(r'(?i)^(klasa|class)\b\s*[:\-]', t):
                    self._last_heading = t


def _parse_html_string(html_text: str) -> dict:
    """Parse an HTML results page into the standard result dict."""
    html_text = _unescape(html_text)
    hv = _TableHarvester()
    try:
        hv.feed(html_text)
    except Exception:
        pass

    if not hv.tables:
        raise ValueError("No results table found in this HTML page.")

    ev_name = next((t for (tag, t) in hv.headings if tag == 'h1'), '') \
        or extract_event_name(html_text) or 'Imported Competition'
    plain = re.sub(r'<[^>]+>', ' ', html_text)
    plain = re.sub(r'\s+', ' ', _unescape(plain))
    ev_date = extract_date(plain)
    # A page's date often lives in an h3 "Results as of …" heading that sits past
    # extract_date's leading window (a big inline <style> block pushes it out).
    # Headings are short and reliable, so fall back to them when the body scan
    # came up empty (Sailwave-native / pya h5). Pure text, no global pattern change.
    if not ev_date:
        ev_date = extract_date(' '.join(t for (_tag, t) in hv.headings))
    discards = extract_discards(plain)
    detected_fleets = detect_fleets_in_text(plain)

    all_parsed = []
    for ti, tbl in enumerate(hv.tables):
        anchor = hv._table_anchor_text[ti] if ti < len(hv._table_anchor_text) else ''
        fsec = re.search(r'(\d+-(?:Gold|Silver|Bronze|Emerald)\s+Fleet|'
                         r'Gold Fleet|Silver Fleet|Bronze Fleet)', anchor, re.IGNORECASE)
        # An "Open Division" / handicap heading keeps that table as one mixed-class
        # fleet (rows tagged with row_class) instead of splitting it per class.
        osec = re.search(r'(Open\s+Division|Handicap\s+Division|Performance\s+Handicap'
                         r'|Open\s+Fleet|Handicap\s+Fleet|PY\s+Division)', anchor, re.IGNORECASE)
        # _class_of resolves 49erFX before 49er etc., so separate per-class tables
        # (e.g. a page stacking 49er / 49erFX / Nacra) are distinguished correctly.
        if fsec:
            fleet = fsec.group(1)
        elif osec:
            fleet = re.sub(r'\s+', ' ', osec.group(1)).strip()
        else:
            fleet = _class_of(anchor)
        parsed = parse_table(tbl, fleet)
        if parsed and parsed['entries']:
            all_parsed.extend(parsed['entries'])

    if not all_parsed:
        raise ValueError("Found tables in the page, but none looked like a results table.")

    ym = re.search(r'\b(20[0-2]\d|19[5-9]\d)\b', (ev_date or '') + ' ' + (ev_name or '') + ' ' + plain[:400])
    ev_year = int(ym.group(0)) if ym else None
    _resolve_birth_years(all_parsed, ev_year)

    base_notes = [
        "Fetched the page and read its source HTML directly.",
        f"Read {len(all_parsed)} competitor rows.",
    ]
    headings_text = ' '.join(t for (_tag, t) in hv.headings) + ' ' + ' '.join(detected_fleets)
    detected_class = detect_class(all_parsed, ev_name, headings_text)
    detected_host  = detect_host(' '.join(t for (_tag, t) in hv.headings) + ' ' + plain[:2000])
    result = _finalize(all_parsed, ev_name, ev_date, discards, base_notes,
                       detected_class=detected_class, detected_host=detected_host)
    # Stamp a format verdict on HTML results too (matching the PDF path). The
    # detector is pure text/meta, so feed it the lower-cased page source.
    try:
        _fam, _itype, _conf = detect_format(html_text.encode('utf-8', 'ignore'),
                                            html_text.lower(), {})
        if isinstance(result, dict):
            result["detected_format"] = {"family": _fam, "input_type": "html",
                                         "confidence": _conf}
    except Exception:
        pass
    return result


_ALLOWED_FETCH_SCHEMES = ('http://', 'https://')

def fetch_url_bytes(url: str):
    """Fetch a results URL server-side (the browser can't, due to CORS).
    Returns (content_bytes, content_type). Raises ValueError on problems."""
    if urlopen is None:
        raise ValueError("URL fetching is not available in this environment.")
    u = (url or '').strip()
    if not u.lower().startswith(_ALLOWED_FETCH_SCHEMES):
        raise ValueError("Please paste a full http(s) results link.")
    req = UrlRequest(u, headers={
        "User-Agent": "Mozilla/5.0 (compatible; AthLinkBot/1.0; +https://athlink20.vercel.app)",
        "Accept": "text/html,application/xhtml+xml,application/pdf,*/*",
    }, method="GET")
    try:
        with urlopen(req, timeout=45) as resp:
            ctype = (resp.headers.get('Content-Type') or '').lower()
            data = resp.read(20 * 1024 * 1024)   # cap 20 MB
    except Exception as exc:
        raise ValueError(f"Couldn't fetch that link: {exc}")
    if not data:
        raise ValueError("The link returned no content.")
    return data, ctype


def _decode_html_bytes(data: bytes) -> str:
    """Decode HTML bytes to text using the right charset.

    Many sailing-results exports (Sailwave etc.) are ISO-8859-1 / Windows-1252,
    not UTF-8. Decoding those as UTF-8 with errors='replace' turns accented
    names (Hernández, Peña, Szölgyömi, Sámuel) into U+FFFD ("�"). So:
      1. honour a declared <meta charset=...> when present,
      2. otherwise try STRICT utf-8 and, only if that raises, fall back to
         cp1252 (a superset of Latin-1 that browsers use for iso-8859-1).
    """
    head = data[:4096].lower()
    m = re.search(rb'charset=["\']?\s*([a-z0-9_\-]+)', head)
    enc = m.group(1).decode('ascii', 'ignore').strip() if m else None
    if enc in ('iso-8859-1', 'iso8859-1', 'latin-1', 'latin1', 'windows-1252', 'cp1252'):
        return data.decode('cp1252', errors='replace')
    if enc and enc not in ('utf-8', 'utf8'):
        try:
            return data.decode(enc, errors='replace')
        except LookupError:
            pass
    try:
        return data.decode('utf-8')              # strict: raises on Latin-1 bytes
    except UnicodeDecodeError:
        return data.decode('cp1252', errors='replace')


def parse_url(url: str, mode: str = 'ai') -> dict:
    """Fetch a results link and parse it. HTML pages are parsed from source
    (most accurate); PDFs go through the normal byte pipeline."""
    data, ctype = fetch_url_bytes(url)
    mime = _detect_mime(data)
    is_html = ('html' in ctype) or (mime == 'text/html')
    if is_html and 'pdf' not in ctype:
        text = _decode_html_bytes(data)
        try:
            out = _parse_html_string(text)
            out.setdefault('notes', []).insert(0, f"Loaded {url}")
            return out
        except ValueError as html_err:
            if mode == 'ai' and os.environ.get("ANTHROPIC_API_KEY"):
                # Some 'HTML' pages are really embedded PDFs / JS apps — let AI try the bytes.
                try:
                    return _gemini_parse(data, "application/pdf")
                except Exception:
                    raise html_err
            raise
    # PDF or other bytes
    return parse_pdf_bytes(data, mode=mode)


def _pdf_page_count(file_bytes: bytes) -> int:
    """Fast page count via pypdf (falls back to pdfplumber)."""
    try:
        import pypdf
        return len(pypdf.PdfReader(io.BytesIO(file_bytes)).pages)
    except Exception:
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return len(pdf.pages)
        except Exception:
            return 1


def _pdf_header_hint(file_bytes: bytes) -> str:
    """Pull the column-header line from page 1 (Pos … NET) to guide page parsing."""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            txt = pdf.pages[0].extract_text() or ''
        for line in txt.split('\n'):
            up = line.upper()
            if ('POS' in up or 'RANK' in up or 'PL' in up) and ('NET' in up or 'TOTAL' in up or 'POINTS' in up):
                return ' '.join(line.split())[:300]
    except Exception:
        pass
    return ''


def _extract_single_page_pdf(file_bytes: bytes, page_index: int):
    """Return a standalone one-page PDF (bytes) for the given 0-based page index,
    or None if pypdf isn't available (caller then falls back to the whole PDF)."""
    try:
        import pypdf
    except ImportError:
        return None
    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    writer = pypdf.PdfWriter()
    writer.add_page(reader.pages[page_index])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


_NAT_PROMPT = """This sailing results PDF shows nationality as COUNTRY FLAG images (not text).
For EVERY competitor row, read the flag and map that boat's SAIL NUMBER to its
3-letter IOC country code (e.g. HKG, AUS, SGP, JPN, GBR, USA).
Return ONLY a JSON object, no markdown or prose, e.g.:
{"3354":"HKG","2681":"AUS"}
Use the sail number exactly as printed. Omit any row whose flag you cannot read."""

def _normalise_nat_map(data: dict) -> dict:
    """{sail: code} → {normalised_sail: 'IOC'}, dropping anything malformed."""
    out = {}
    for k, v in (data.items() if isinstance(data, dict) else []):
        sk = re.sub(r'\s+', '', str(k)).lower()
        code = re.sub(r'[^A-Za-z]', '', str(v)).upper()[:3]
        if sk and len(code) == 3:
            out[sk] = code
    return out


def _strip_json_fence(raw: str) -> str:
    return re.sub(r'^```(?:json)?\s*|\s*```$', '', (raw or "").strip())


def _gemini_read_nationalities(file_bytes: bytes, key: str, timeout: int = 25) -> dict:
    """Flag-image nationality read via Gemini (ingests the PDF natively as
    inline_data). Returns {normalised_sail: 'IOC'}. Raises on any error so the
    caller can fall back to Anthropic."""
    model = (_LLM_ROUTES.get("nat") or {}).get("model", "gemini-2.5-flash")
    parts = [
        {"inline_data": {"mime_type": "application/pdf",
                         "data": base64.b64encode(file_bytes).decode()}},
        {"text": _NAT_PROMPT},
    ]
    resp = call_gemini(key, model, parts, max_tokens=4096, timeout=timeout)
    data = json.loads(_strip_json_fence(gemini_text(resp)))
    return _normalise_nat_map(data)


def _anthropic_read_nationalities(file_bytes: bytes, timeout: int = 50) -> dict:
    """Flag-image nationality read via Anthropic (native document block).
    The universal fallback path. Returns {normalised_sail: 'IOC'}."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY not configured.")
    if urlopen is None:
        raise ValueError("urllib not available.")
    payload = json.dumps({
        "model": _AI_MODEL, "max_tokens": 4096, "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "document", "source": {"type": "base64",
             "media_type": "application/pdf", "data": base64.b64encode(file_bytes).decode()}},
            {"type": "text", "text": _NAT_PROMPT}]}],
    }).encode()
    req = UrlRequest(_ANTHROPIC_URL, data=payload,
                     headers={"Content-Type": "application/json", "x-api-key": key,
                              "anthropic-version": "2023-06-01"}, method="POST")
    try:
        with urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
    except HTTPError as exc:
        try:
            msg = json.loads(exc.read()).get("error", {}).get("message", str(exc))
        except Exception:
            msg = str(exc)
        raise ValueError(f"AI service error ({exc.code}): {msg}")
    raw = "".join(b.get("text", "") for b in (result.get("content") or [])
                  if b.get("type") == "text").strip()
    data = json.loads(_strip_json_fence(raw))
    return _normalise_nat_map(data)


def _ai_read_nationalities(file_bytes: bytes) -> dict:
    """Read flag-image nationalities with one small AI call. Returns
    {normalised_sail: 'IOC'} so the caller can match by sail number (robust —
    never assigns a nationality to the wrong boat via row miscount).

    Routes to Gemini (Phase 2) when GEMINI_API_KEY is set, falling back to
    Anthropic on any Gemini error so a miss degrades gracefully. Timeouts are
    bounded so a Gemini-then-Anthropic retry still fits the 60s Vercel ceiling."""
    gkey = os.environ.get("GEMINI_API_KEY", "")
    if gkey and call_gemini is not None:
        try:
            return _gemini_read_nationalities(file_bytes, gkey, timeout=25)
        except Exception:
            # Gemini missed (error/timeout/bad JSON) → Anthropic with reduced
            # budget so the combined wall time stays under the function ceiling.
            return _anthropic_read_nationalities(file_bytes, timeout=30)
    return _anthropic_read_nationalities(file_bytes, timeout=50)


# ── Agent tool wrappers ─────────────────────────────────────────────────────
# Thin adapters around the existing parsers so the agent loop can call them and
# get a JSON string back. They wrap (do NOT rewrite) the existing functions.
def _tool_rule_parse(file_bytes: bytes) -> str:
    try:
        result = _rule_based_parse(file_bytes)
    except ValueError as e:
        return json.dumps({"ok": False, "error": str(e)})
    # Confidence gate: the rule parser can "succeed" yet return garbage (rows
    # silently dropped, polluted event name). Score it so the agent knows when
    # to fall back to vision even though parsing didn't raise.
    if score_parse is not None and isinstance(result, dict):
        verdict = score_parse(result)
        result["confidence"] = verdict["confidence"]
        result["low_confidence"] = not verdict["ok"]
        result["confidence_reasons"] = verdict["reasons"]
        result.setdefault("notes", []).append(
            f"Rule-parse confidence {verdict['confidence']:.2f} "
            f"({'low — recommend AI' if not verdict['ok'] else 'ok'}): "
            + "; ".join(verdict["reasons"])
        )
    return json.dumps(result)


def _tool_vision_parse(file_bytes: bytes) -> str:
    try:
        return json.dumps(_gemini_parse(file_bytes, "application/pdf"))
    except Exception as e:
        return json.dumps({"ok": False, "error": str(e)})


def _tool_lookup_nationalities(file_bytes: bytes) -> str:
    try:
        return json.dumps({"ok": True, "nats": _ai_read_nationalities(file_bytes)})
    except Exception as e:
        return json.dumps({"ok": False, "nats": {}, "error": str(e)})


# ── Agent loop ──────────────────────────────────────────────────────────────
# Claude orchestrates the existing parsers via tool calls instead of fixed
# if/else logic. Uses the Messages API directly (urlopen — no SDK in serverless),
# matching _gemini_parse's request pattern. Capped at 8 turns for the Hobby 60s
# ceiling. The agent merges flag-image nationalities internally, so the frontend
# no longer needs its second ?nat=1 request.
_AGENT_SYSTEM = (
    "You are a sailing results parser agent. You have access to tools to parse a "
    "PDF of sailing competition results. Rules:\n"
    "- Always call rule_parse first.\n"
    "- If rule_parse returns ok=false, call vision_parse instead.\n"
    "- If rule_parse returns low_confidence=true (it succeeded but the result "
    "looks untrustworthy — see confidence_reasons), also call vision_parse and "
    "prefer whichever result is more complete and sane.\n"
    "- If rule_parse returns nat_from_flags=true, call lookup_nationalities, then "
    "merge the returned nats into the entries by matching the sail field "
    "(normalised: strip whitespace, lowercase). Never use row order for matching.\n"
    "- Once you have a complete result with entries, call finalize with the full "
    "result dict.\n"
    "- Never re-rank, recalculate, or modify scores. The PDF is ground truth.\n"
    "- Keep the notes array from whichever parser succeeded."
)

_AGENT_TOOLS = [
    {"name": "rule_parse",
     "description": ("Extract results using the built-in rule-based parser (pdfplumber). "
                     "Fast and exact for Sailwave, Manage2sail, SailingResults.net formats. "
                     "Always try this first. Returns a JSON object with ok, entries, name, "
                     "date, discards, nat_from_flags."),
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "vision_parse",
     "description": ("Parse the PDF visually using AI vision (Gemini 3, with automatic "
                     "Anthropic fallback). Use when rule_parse returns ok=false, or when "
                     "the format is non-standard. Slower but handles any layout."),
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "lookup_nationalities",
     "description": ("Read flag images in the PDF to determine nationalities. Call this "
                     "when rule_parse returns nat_from_flags=true and the entries have "
                     "empty nat fields. Returns {ok, nats} where nats is a dict of "
                     "sail_number -> IOC code."),
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "finalize",
     "description": ("Submit the completed result. Call this when you have a valid entries "
                     "list and all available nationalities have been merged. This ends the loop."),
     "input_schema": {"type": "object",
                      "properties": {"result": {"type": "object",
                          "description": ("The full result dict to return, with ok, name, "
                                          "date, discards, entries, notes, detected_class, "
                                          "detected_host")}},
                      "required": ["result"]}},
]


def _agent_parse(file_bytes: bytes) -> dict:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY not configured.")
    if urlopen is None:
        raise ValueError("urllib not available.")

    dispatch = {
        "rule_parse": _tool_rule_parse,
        "vision_parse": _tool_vision_parse,
        "lookup_nationalities": _tool_lookup_nationalities,
    }
    messages = [{"role": "user",
                 "content": "Parse this sailing results PDF and return the structured results."}]
    final_result = None
    max_turns = 8

    for _turn in range(max_turns):
        payload = json.dumps({
            "model": _AI_MODEL,
            "max_tokens": 4096,
            "temperature": 0,
            "system": _AGENT_SYSTEM,
            "tools": _AGENT_TOOLS,
            "messages": messages,
        }).encode()
        req = UrlRequest(
            _ANTHROPIC_URL,
            data=payload,
            headers={"Content-Type": "application/json",
                     "x-api-key": key,
                     "anthropic-version": "2023-06-01"},
            method="POST"
        )
        try:
            with urlopen(req, timeout=50) as resp:
                result = json.loads(resp.read())
        except HTTPError as exc:
            try:
                detail = json.loads(exc.read())
                msg = detail.get("error", {}).get("message", str(detail))
            except Exception:
                msg = getattr(exc, "reason", None) or str(exc)
            raise ValueError(f"AI service error ({exc.code}): {msg}")

        content = result.get("content") or []
        # Echo the assistant turn back so the next request has full context.
        messages.append({"role": "assistant", "content": content})

        if result.get("stop_reason", "") != "tool_use":
            break

        tool_results = []
        for block in content:
            if block.get("type") != "tool_use":
                continue
            name = block.get("name", "")
            if name == "finalize":
                final_result = (block.get("input") or {}).get("result")
                out = json.dumps({"ok": True, "finalized": True})
            elif name in dispatch:
                out = dispatch[name](file_bytes)
            else:
                out = json.dumps({"ok": False, "error": f"unknown tool: {name}"})
            tool_results.append({"type": "tool_result",
                                 "tool_use_id": block.get("id"),
                                 "content": out})

        if final_result is not None:
            break
        messages.append({"role": "user", "content": tool_results})

    if final_result is not None:
        return final_result
    raise ValueError("Agent did not finalize results.")


def parse_pdf_page(file_bytes: bytes, page_index: int) -> dict:
    """
    AI-parse a SINGLE page of a multi-page PDF (0-based index).
    Used by the client to chunk large files into sub-10s serverless calls
    (Hobby plan). Returns just that page's entries (no scoring, no dedupe).
    """
    mime = _detect_mime(file_bytes)
    if mime.startswith("image/"):
        # Tall page-capture screenshots page through their horizontal bands
        # (?count=1 reported the band count); normal images parse whole.
        band = _extract_image_band(file_bytes, page_index)
        if band is not None:
            return _gemini_parse(band, "image/jpeg")
        return _gemini_parse(file_bytes, mime)
    if mime != "application/pdf":
        # Other single files: no paging — parse whole thing.
        return _gemini_parse(file_bytes, mime)
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise ValueError("Page parsing requires AI, but ANTHROPIC_API_KEY is not configured.")
    header = _pdf_header_hint(file_bytes)
    page_pdf = _extract_single_page_pdf(file_bytes, page_index)
    if page_pdf is None:
        # pypdf missing → can't split. Parse the whole PDF (only return page 0's
        # request to avoid N duplicate whole-file passes); client dedupes anyway.
        if page_index != 0:
            return {"ok": True, "multi": False, "name": "", "date": "", "discards": 1,
                    "entries": [], "ai_parsed": True,
                    "notes": ["pypdf not installed — page splitting unavailable; parsed whole file on page 0."]}
        return _gemini_parse(file_bytes, "application/pdf")
    return _gemini_parse(page_pdf, "application/pdf", header_hint=header)


def parse_pdf_bytes(file_bytes: bytes, mode: str = 'ai') -> dict:
    """
    Entry point for uploaded bytes.

    mode='rule'  → built-in parser only; raise on unknown formats (no AI).
    mode='ai'    → built-in parser first, Gemini fallback; images always AI.
    """
    mime = _detect_mime(file_bytes)

    def _stamp(res, family, input_type, conf=0.9):
        """Attach a detected_format verdict when the extractor didn't set one."""
        if isinstance(res, dict) and "detected_format" not in res:
            res["detected_format"] = {"family": family, "input_type": input_type,
                                      "confidence": conf}
        return res

    # ── HTML upload (rare; usually parsed client-side, but supported here too) ──
    if mime == "text/html":
        return _stamp(_parse_html_string(_decode_html_bytes(file_bytes)), 'unknown', 'html', 0.3)

    # ── Excel workbook (.xlsx/.xls) ──
    if mime in ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.ms-excel"):
        return _stamp(_parse_xlsx_bytes(file_bytes), 'club-custom-xlsx', 'xlsx')

    # ── Sailwave project (.blw) ──
    if mime == "application/x-sailwave-blw":
        return _stamp(_parse_blw_bytes(file_bytes), 'sailwave-blw', 'blw')

    # ── CSV ──
    if mime == "text/csv":
        return _stamp(_parse_csv_bytes(file_bytes), 'unknown', 'csv', 0.3)

    # ── Image upload → Gemini only (no rule-based parser exists for images) ──
    if mime.startswith("image/"):
        if mode == 'rule':
            raise ValueError(
                "This is an image — the non-AI parser can't read it. "
                "Use the AI parser for photos and screenshots."
            )
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise ValueError(
                "Image results require AI parsing, but ANTHROPIC_API_KEY is not configured."
            )
        return _stamp(_gemini_parse(file_bytes, mime), 'unknown', 'image', 0.3)

    # ── PDF → rule-based first ──
    if mode == 'rule':
        result = _rule_based_parse(file_bytes)
        # Attach the confidence verdict so callers (e.g. the frontend's "try the
        # built-in parser first" probe) can tell a trustworthy rule parse from a
        # low-confidence one without invoking any AI.
        if score_parse is not None and isinstance(result, dict):
            verdict = score_parse(result)
            result["confidence"] = verdict["confidence"]
            result["low_confidence"] = not verdict["ok"]
            result["confidence_reasons"] = verdict["reasons"]
            result["ai_parsed"] = False
        return result

    # ── AI mode ──
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        # No AI key — fall back to rule-based only, surface errors
        return _rule_based_parse(file_bytes)

    # Fast path: try the deterministic rule parser DIRECTLY first. When it parses
    # a known format with high confidence (and doesn't need an AI flag-image
    # nationality read), return immediately — no LLM round-trips at all. This is
    # what keeps clean Sailwave / Manage2sail / SailingResults parses sub-second
    # and COMPLETE. Routing such a result through the agent loop is both slow
    # (multiple model calls) and lossy: the agent has to echo the whole result
    # back via finalize, and a large table (e.g. 56 boats × 14 races) gets
    # truncated at max_tokens, silently dropping the last race columns.
    rule_result = None
    try:
        rule_result = _rule_based_parse(file_bytes)
    except ValueError:
        rule_result = None
    if rule_result is not None and score_parse is not None:
        verdict = score_parse(rule_result)
        if verdict.get("ok"):
            if not rule_result.get("nat_from_flags"):
                # Fully clean → return immediately, no AI at all.
                rule_result["confidence"] = verdict["confidence"]
                rule_result["ai_parsed"] = False
                rule_result.setdefault("notes", []).append(
                    f"Parsed by the built-in parser (confidence {verdict['confidence']:.2f}) — AI not needed."
                )
                return rule_result
            # Confident table whose ONLY gap is flag-image nationalities. Do ONE
            # small nat read (sail → IOC) and merge it, instead of the full agent
            # loop (multiple model calls + a whole-table echo that can truncate).
            # This is what made e.g. the 2024 Asians PDF take 10s+.
            try:
                nats = _ai_read_nationalities(file_bytes)
                if nats:
                    def _apply_nats(entries):
                        for e in entries:
                            s = str(e.get("sail", "")).strip()
                            if s and not (e.get("nat") or "").strip() and nats.get(s):
                                e["nat"] = nats[s]
                    _apply_nats(rule_result.get("entries", []) or [])
                    for f in (rule_result.get("fleets", []) or []):
                        _apply_nats(f.get("entries", []) or [])
                rule_result["confidence"] = verdict["confidence"]
                rule_result["ai_parsed"] = True
                rule_result.setdefault("notes", []).append(
                    "Built-in parser + a single AI flag-nationality read (fast path)."
                )
                return rule_result
            except Exception as nat_err:
                print("nat-only fast path failed; falling back to agent:", nat_err)

    # Carry the rule parser's format verdict onto the AI paths when we have one
    # (the agent's finalized dict won't set it itself).
    _fmt = rule_result.get("detected_format") if isinstance(rule_result, dict) else None

    # Rules failed, scored low-confidence, or the nat fast path errored →
    # hand off to the agent loop (rule + vision + nationality merge).
    try:
        res = _agent_parse(file_bytes)
        if isinstance(res, dict):
            res.setdefault("ai_parsed", True)
            if _fmt:
                res.setdefault("detected_format", _fmt)
            else:
                res.setdefault("detected_format",
                               {"family": "unknown", "input_type": "pdf-text", "confidence": 0.3})
        return res
    except Exception as agent_err:
        # If the agent fails but the rule parser produced something usable,
        # return that rather than erroring the whole upload.
        if rule_result is not None:
            return rule_result
        raise ValueError(f"Agent parse failed: {agent_err}")


# ── Vercel handler ─────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()
    def do_POST(self):
        if pdfplumber is None:
            return self._respond(500, {'ok':False,'error':'pdfplumber not installed.'})
        # mode comes from ?mode=rule|ai (default ai)
        mode = 'ai'; want_count = False; page_idx = None
        try:
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            mode = (qs.get('mode', ['ai'])[0] or 'ai').lower()
            if mode not in ('rule', 'ai'):
                mode = 'ai'
            want_count = qs.get('count', ['0'])[0] in ('1', 'true')
            want_nat = qs.get('nat', ['0'])[0] in ('1', 'true')
            if 'page' in qs:
                try: page_idx = int(qs.get('page', ['0'])[0])
                except (ValueError, TypeError): page_idx = None
        except Exception:
            mode = 'ai'

        length = int(self.headers.get('Content-Length', 0))
        if not length:
            return self._respond(400, {'ok':False,'error':'No file or link received.'})
        body = self.rfile.read(length)
        ctype = (self.headers.get('Content-Type') or '').lower()

        try:
            # ?count=1 → just return the PDF page count (instant; no parsing)
            if want_count and 'application/json' not in ctype:
                # Images: tall page-capture screenshots report their band
                # count so the client pages through them like PDF pages.
                if _detect_mime(body).startswith("image/"):
                    return self._respond(200, {'ok':True, 'page_count': _image_band_count(body)})
                return self._respond(200, {'ok':True, 'page_count': _pdf_page_count(body)})
            # ?nat=1 → read flag-image nationalities with a small AI call → {sail: IOC}
            if want_nat and 'application/json' not in ctype:
                try:
                    return self._respond(200, {'ok':True, 'nats': _ai_read_nationalities(body)})
                except Exception as exc:
                    return self._respond(200, {'ok':False, 'error':str(exc), 'nats':{}})
            # ?page=N → AI-parse a single page of a multi-page PDF (sub-10s on Hobby)
            if page_idx is not None and 'application/json' not in ctype:
                return self._respond(200, parse_pdf_page(body, page_idx))
            # JSON body with a results link → fetch + parse server-side
            if 'application/json' in ctype:
                payload = json.loads(body.decode('utf-8', errors='replace') or '{}')
                url = (payload.get('url') or '').strip()
                jmode = (payload.get('mode') or mode or 'ai').lower()
                if jmode not in ('rule', 'ai'):
                    jmode = 'ai'
                if not url:
                    return self._respond(400, {'ok':False,'error':'No "url" provided in the request.'})
                return self._respond(200, parse_url(url, mode=jmode))
            # Otherwise treat the body as raw file bytes
            return self._respond(200, parse_pdf_bytes(body, mode=mode))
        except Exception as exc:
            self._respond(422, {'ok':False,'error':str(exc)})
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status); self._cors()
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *_): pass
