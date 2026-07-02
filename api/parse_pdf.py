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
                     LLMError, ROUTES as _LLM_ROUTES)
except Exception:
    call_gemini = None
    gemini_text = None
    call_openai_compat = None
    openai_text = None
    LLMError = Exception
    _LLM_ROUTES = {}

# ── penalty codes ──────────────────────────────────────────────────────────
CODES = {
    'DNF','DNC','DNS','OCS','DSQ','BFD','UFD','RET','RDG','DGM','DNE',
    'SCP','NSC','PRP','TAL','ZFP','STP','DPI','TP5','TPP','TPN',
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
        re.match(r'^M\d{1,2}$', s) or          # M10 = medal race 10
        s == 'MR'                               # MR  = medal race
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
        elif h in ('sailors','name','helmcrew','name(s)','helmandsailors'):
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
        elif h in ('nett','net','netpts','netpoints','nettpts','nettpoints','nett.','netpts.'):
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
{"name":"event name","date":"dd/mm/yyyy or empty","discards":1,"entries":[{"helm":"First Last","crew":"First Last or empty","sail":"88 or NZL 7","nat":"3-letter IOC or empty","div":"fleet/division or empty","gender":"M/F/Mix or empty","category":"U17/U19/U23/Jr or empty","pdf_rank":1,"pdf_net":67.0,"birth_year":2005,"crew_birth_year":2004,"races":[5,12,4,"DNF",7],"race_codes":[null,null,null,null,null]}]}

RULES:
- Use the OVERALL/FINAL table (skip preliminary per-fleet tables).
- helm/crew: title case "First Last"; convert "SMITH, John" to "John Smith".
- IGNORE club, team, and sponsor text entirely. The name cell often lists a sailor's name followed by " / Club / Sponsor / Sponsor". Keep ONLY the person's name; never put club/sponsor text in any field.
- sail: country prefix + number if present ("NZL 7"), else number only.
- nat: 3-letter IOC code, empty if unknown.
- gender: "M"/"F"/"Mix" from any Gender/Sex/Boat Gender column. Two-person boat with separate helm+crew gender: both male->"M", both female->"F", mixed->"Mix". Empty if none.
- category: age group only - "U17"/"U19"/"U23"/"Jr". Normalise "Under 17"/"U-17"->"U17", "Junior"->"Jr". Never put fleet colours (Gold/Silver/Bronze) or "Open" here.
- birth_year/crew_birth_year: 4-digit YOB if shown; if only AGE shown compute (event year - age); else null.
- races: ONLY per-race scores in order, as numbers or string codes (DNF,DNC,DNS,UFD,BFD,DSQ,OCS,RET,NSC,SCP,STP,RDG). Discards as plain numbers (no parentheses). Do NOT include carry-forward (CF), points-series (PS), TOTAL or NET columns in races.
- race_codes: null for plain scores; the code string when a numeric score has a code annotation.
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


def _gemini_vision_raw(file_bytes: bytes, prompt: str, key: str, timeout: int = 30):
    """PDF parse via Gemini 3 (native PDF ingest, no rasterisation)."""
    parts = [{"inline_data": {"mime_type": "application/pdf",
                              "data": base64.b64encode(file_bytes).decode()}},
             {"text": prompt}]
    resp = call_gemini(key, _PARSE_GEMINI_MODEL, parts, max_tokens=8192, timeout=timeout)
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
        kkey = os.environ.get("KIMI_API_KEY", "")
        if kkey and call_openai_compat is not None:
            try:
                return _kimi_vision_raw(file_bytes, mime_type, prompt, kkey, timeout=30)
            except Exception:
                return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=25)
        return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=50)
    # application/pdf (and any non-image) → Gemini 3, else Anthropic.
    gkey = os.environ.get("GEMINI_API_KEY", "")
    if gkey and call_gemini is not None:
        try:
            return _gemini_vision_raw(file_bytes, prompt, gkey, timeout=30)
        except Exception:
            return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=25)
    return _anthropic_vision_raw(file_bytes, mime_type, prompt, timeout=50)


def _gemini_parse(file_bytes: bytes, mime_type: str = "application/pdf", header_hint: str = "") -> dict:
    if urlopen is None:
        raise ValueError("urllib not available.")

    # Downscale large images before sending (PDFs pass through untouched).
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


def _rule_based_parse(pdf_bytes: bytes) -> dict:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
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
    head = data[:512].lstrip().lower()
    if head[:5] == b"<html" or head[:9] == b"<!doctype" or b"<table" in data[:4000].lower():
        return "text/html"
    return "application/pdf"  # default — let pdfplumber try


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

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
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
    return _finalize(all_parsed, ev_name, ev_date, discards, base_notes,
                     detected_class=detected_class, detected_host=detected_host)


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
    if mime != "application/pdf":
        # Images / single files: no paging — parse whole thing.
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

    # ── HTML upload (rare; usually parsed client-side, but supported here too) ──
    if mime == "text/html":
        return _parse_html_string(_decode_html_bytes(file_bytes))

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
        return _gemini_parse(file_bytes, mime)

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

    # Rules failed, scored low-confidence, or the nat fast path errored →
    # hand off to the agent loop (rule + vision + nationality merge).
    try:
        res = _agent_parse(file_bytes)
        if isinstance(res, dict):
            res.setdefault("ai_parsed", True)
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
