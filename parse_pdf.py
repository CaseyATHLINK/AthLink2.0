"""
AthLink PDF parser v3 — Vercel serverless function.

Handles:
  - Sailwave PDF (standard, any column arrangement)
  - Sailwave HTML → PDF (ourclubadmin, extra columns, (RET [51.0]) scores)
  - Manage2sail PDF (combined helm/crew cell, Q1-F13 columns, birth years)
  - SailingResults.net (Pl / Name multiline)
  - Clubspot (best-effort, names in SAILORS section)
  - Multi-fleet: returns list of fleets for client-side picker
"""

from http.server import BaseHTTPRequestHandler
import json, io, re

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

# ── penalty codes ──────────────────────────────────────────────────────────
CODES = {
    'DNF','DNC','DNS','OCS','DSQ','BFD','UFD','RET','RDG','DGM','DNE',
    'SCP','NSC','PRP','TAL','ZFP','STP','DPI','BFD','TP5','TPP','TPN',
}

# ── score parsing ──────────────────────────────────────────────────────────
def clean_score(raw):
    """
    Parse any score cell variant into int/float or code string.
    Handles: 1, 1.0, (5.0), (RET [51.0]), [17.0], 10.9 DPI, 11.9 SCP, TP5 [17.0]
    """
    if raw is None:
        return None
    s = str(raw).strip().replace('\n', ' ')
    if not s or s in ('-', '—', '–', '*', ''):
        return None

    # Strip outer discard parens: (5.0) → 5.0 | (RET [51.0]) → RET [51.0]
    inner = s.strip('()')

    # Extract a penalty code anywhere in the string (before the number or after)
    # Patterns: "RET [51.0]", "10.9 DPI", "TP5 [17.0]", "DNF"
    parts = re.split(r'[\s\[\]]+', inner.strip())
    parts = [p for p in parts if p]

    for p in parts:
        up = p.upper().rstrip('.')
        if up in CODES:
            return up

    # No code found – try to parse as a number
    # Handle "11.9" (keep as float), "5.0" → 5, "17" → 17
    num_str = re.sub(r'[^\d.]', '', parts[0]) if parts else ''
    if num_str:
        try:
            n = float(num_str)
            return int(n) if n == int(n) else round(n, 2)
        except ValueError:
            pass

    return None

# ── column header recognition ──────────────────────────────────────────────
def is_race_hdr(cell):
    """True if the cell looks like a race column header."""
    s = str(cell or '').strip().upper()
    # R1, F1, O1, Q1 (manage2sail), plain digits 1-20, Race N, Race1
    return bool(
        re.match(r'^[RFOQ]\d{1,2}$', s) or
        re.match(r'^(RACE\s*\d{1,2})$', s) or
        re.match(r'^\d{1,2}$', s)
    )

def hdr_key(cell):
    """Normalise a header string for matching."""
    return re.sub(r"[\s\n_()/\\']+", '', str(cell or '').lower())

# ── name helpers ───────────────────────────────────────────────────────────
def strip_birth_year(name):
    """Remove (YYYY) birth year suffix used by manage2sail."""
    return re.sub(r'\s*\(\d{4}\)\s*', '', name).strip()

def strip_club_suffix(name):
    """Remove club abbreviations like (KYC), (HKSI) from manage2sail names."""
    return re.sub(r'\s*\([^)]{2,10}\)\s*$', '', name).strip()

def title_name(n):
    """Title-case ALL-CAPS names; leave mixed-case untouched."""
    if not n:
        return ''
    parts = str(n).strip().split()
    out = []
    for p in parts:
        if len(p) > 1 and p.isalpha() and p == p.upper():
            out.append(p.title())
        else:
            out.append(p)
    return ' '.join(out)

def clean_name(raw):
    n = str(raw or '').strip()
    n = strip_birth_year(n)
    n = strip_club_suffix(n)
    return title_name(n)

# ── metadata extraction ────────────────────────────────────────────────────
def extract_event_name(text):
    kw = r'(?i)(championship|regatta|nationals|cup|trophy|open|series|race|sailing|woche)'
    skip = r'(?i)^(sailed|discard|entries|result|rank|pos|overall|start|finish|http|www|point|powered)'
    for line in text.split('\n'):
        line = line.strip()
        if len(line) > 8 and re.search(kw, line) and not re.match(skip, line):
            return line[:120]
    for line in text.split('\n')[:12]:
        line = line.strip()
        if len(line) > 8 and not line[0].isdigit() and 'http' not in line.lower():
            return line[:120]
    return 'Imported Regatta'

def extract_discards(text):
    """Handle 'Discards: 2', 'Discard rule: Global: 3', 'Discards: 1, To count'."""
    m = re.search(r'[Dd]iscard[^:]*[:\s]+(?:Global[:\s]+)?(\d+)', text)
    return int(m.group(1)) if m else 1

def extract_date(text):
    """Extract 'provisional as of' or 'results as of' date → dd/mm/yyyy."""
    # Patterns like: "As of 22 JUN 2022", "as of 1/12/2024", "as of November 16, 2025"
    patterns = [
        r'[Aa]s\s+[Oo]f\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})',          # 22 JUN 2022
        r'[Aa]s\s+[Oo]f\s+(\d{1,2})/(\d{1,2})/(\d{4})',                 # 1/12/2024
        r'[Aa]s\s+[Oo]f\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})',          # November 16, 2025
        r'[Pp]rovisional.*?(\d{1,2})[/.](\d{1,2})[/.](\d{4})',           # provisional ... 22.02.2023
    ]
    months = {
        'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
        'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12,
    }
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            g = m.groups()
            try:
                if len(g) == 3:
                    a, b, c = g
                    # Determine which is day, month, year
                    if a.isdigit() and not b.isdigit():
                        # "22 JUN 2022" or "November 16, 2025" won't hit second branch
                        mo = months.get(b[:3].lower())
                        if mo:
                            return f"{int(a):02d}/{mo:02d}/{c}"
                    elif not a.isdigit() and b.isdigit():
                        # "November 16, 2025"
                        mo = months.get(a[:3].lower())
                        if mo:
                            return f"{int(b):02d}/{mo:02d}/{c}"
                    elif a.isdigit() and b.isdigit() and c.isdigit():
                        # 1/12/2024
                        return f"{int(a):02d}/{int(b):02d}/{c}"
            except (ValueError, AttributeError):
                continue
    return ''

def extract_fleet_name(text):
    """Try to identify the fleet/class name from section headers."""
    patterns = [
        r'(?i)^(29er|ilca\s*\d?|optimist\s*\w*|laser|rs\w+|finn|470|49er|nacra)',
        r'(?i)(29er|ilca\s*(?:4|6|7)|optimist|laser)\s+(?:fleet|class|euro)',
        r'(?i)^(\w[\w\s\-/]+(?:fleet|class|division))',
    ]
    for line in text.split('\n')[:30]:
        line = line.strip()
        for pat in patterns:
            m = re.match(pat, line, re.IGNORECASE)
            if m:
                return line[:60]
    return None

# ── column mapping ─────────────────────────────────────────────────────────
def detect_cols(header_row):
    cols = {}
    for i, cell in enumerate(header_row):
        h = hdr_key(cell)
        # Rank
        if h in ('rank','rk','rk.','pos','pl','place','position'):
            cols.setdefault('rank', i)
        # Helm
        elif h in ('helmname','helm','helmname','helmsname','name','skipper'):
            cols.setdefault('helm', i)
        # Crew
        elif h in ('crewname','crew','crewsname','mate'):
            cols['crew'] = i
        # Sail
        elif h in ('sailno','sail','sailnum','sailnumber','no.','boatno',
                   'sailnumber','sailno.','number'):
            cols.setdefault('sail', i)
        # Division / Fleet / Class
        elif h in ('division','div','fleet','class','dinghy class/fleet',
                   'dinghyclass/fleet','fleet/class','boatclass'):
            cols.setdefault('div', i)
        # Nationality
        elif h in ('nat','nationality','country','sailnationalletter','nationalletter'):
            cols.setdefault('nat', i)
        # Club
        elif h in ('club','clubs','clubname','club/association','clubassociation',
                   'cluborg','club/org'):
            cols.setdefault('club', i)
        # Totals (to exclude from race range)
        elif h in ('total','totalpts','totalpoints','pts','points'):
            cols['total'] = i
        elif h in ('nett','net','netpts','netpoints','nettpts','nettpoints'):
            cols['net'] = i
        # Race columns
        if is_race_hdr(cell):
            cols.setdefault('race_start', i)
            cols['race_end'] = i
    return cols

# ── table parser ───────────────────────────────────────────────────────────
def parse_table(tbl, fleet_hint=''):
    """
    Return {'entries': [...], 'fleet': str, 'discards': int} or None.
    """
    if not tbl or len(tbl) < 3:
        return None

    # Find header row: must have ≥3 race-like columns OR explicit name columns
    header_idx = None
    for i, row in enumerate(tbl[:16]):
        if row is None:
            continue
        txt = ' '.join(str(c or '').strip().lower() for c in row)
        race_cnt = sum(1 for c in row if is_race_hdr(c))
        has_name = any(k in txt for k in ('helm','crewname','crew name','name','skipper'))
        if (has_name or race_cnt >= 3) and len(row) >= 4:
            header_idx = i
            break

    if header_idx is None:
        return None

    hdr = [str(c or '').strip() for c in tbl[header_idx]]
    cols = detect_cols(hdr)

    if 'helm' not in cols or 'race_start' not in cols:
        return None

    # Narrow race range (exclude Total/Net)
    r0 = cols['race_start']
    r1 = cols['race_end']
    for k in ('total', 'net'):
        if k in cols and cols[k] <= r1:
            r1 = cols[k] - 1
    race_idxs = list(range(r0, r1 + 1))

    entries = []
    for row in tbl[header_idx + 1:]:
        if row is None:
            continue
        cells = [str(c or '').strip() for c in row]
        if all(c == '' for c in cells):
            continue

        joined = ' '.join(cells).lower()
        # Skip fleet separator rows and re-header rows
        if re.match(r'^\d+-\w+\s+(fleet|class)', joined, re.I):
            continue
        if 'helmname' in joined and 'crewname' in joined:
            continue
        if re.match(r'(?i)^\s*(rank|rk|pos|place)', joined):
            continue

        helm_raw = cells[cols['helm']] if cols['helm'] < len(cells) else ''

        # --- Manage2sail: name cell may contain BOTH names on separate lines ---
        name_lines = [ln.strip() for ln in helm_raw.replace('\r', '\n').split('\n') if ln.strip()]

        helm = ''
        crew = ''

        if len(name_lines) >= 2 and 'crew' not in cols:
            # Two sailors in one cell (manage2sail style)
            helm = clean_name(name_lines[0])
            crew = clean_name(name_lines[1])
        elif len(name_lines) >= 1:
            helm = clean_name(name_lines[0])

        # Separate crew column
        if 'crew' in cols and cols['crew'] < len(cells):
            c_raw = cells[cols['crew']].strip()
            if c_raw:
                crew = clean_name(c_raw)

        if not helm or len(helm) < 2:
            continue
        # Skip rows where "helm" looks like a column header
        if helm.lower() in ('helm name', 'helm', 'name', 'sailors', 'rank', 'pl', 'rk', 'skipper'):
            continue

        # Sail number (strip country prefix)
        sail = '—'
        if 'sail' in cols and cols['sail'] < len(cells):
            raw = cells[cols['sail']]
            # Handle "NZL 3025" → "3025", "HKG 3055" → "3055"
            m = re.search(r'(?:[A-Z]{3}\s+)?(\d+)', raw)
            if m:
                sail = m.group(1)

        # Division
        div = ''
        if 'div' in cols and cols['div'] < len(cells):
            dv = cells[cols['div']]
            if not re.match(r'^\d', dv.strip()):
                div = dv.strip()[:40]

        # Race scores
        races = []
        for j in race_idxs:
            if j < len(cells):
                s = clean_score(cells[j])
                if s is not None:
                    races.append(s)

        if races:
            entries.append({
                'helm': helm,
                'crew': crew,
                'sail': sail,
                'div': div,
                'races': races,
            })

    if not entries:
        return None

    return {'entries': entries, 'fleet': fleet_hint}

# ── detect fleet sections within a page's text ────────────────────────────
FLEET_PATTERNS = re.compile(
    r'(?i)\b(29er|49er|49erFX|ILCA\s*\d?|Optimist\s*(?:Main|Intermediate|Green|Junior)?'
    r'|Laser|RS\w+|2\.4mR|2\.4\s*mR|Finn|470|Nacra\s*\d+)\b'
)

def detect_fleets_in_text(text):
    """Return list of fleet names found in PDF text."""
    found = []
    seen = set()
    for m in FLEET_PATTERNS.finditer(text):
        name = re.sub(r'\s+', ' ', m.group(0).strip())
        key = name.lower()
        if key not in seen:
            seen.add(key)
            found.append(name)
    return found

# ── group tables by fleet section ─────────────────────────────────────────
def group_tables_by_fleet(all_tables, full_text):
    """
    Returns list of (fleet_name, [tables]) tuples.
    If only one fleet detected, returns a single group.
    """
    detected = detect_fleets_in_text(full_text)

    if len(detected) <= 1:
        return [(detected[0] if detected else '', all_tables)]

    # Assign each table to a fleet by scanning page text just before the table.
    # Simple approach: split tables into groups whenever a new fleet name appears.
    groups = {}
    current_fleet = detected[0] if detected else ''

    for tbl in all_tables:
        if not tbl:
            continue
        # Check first row of table for fleet indicator
        first_row_text = ' '.join(str(c or '') for c in (tbl[0] or []))
        for fleet in detected:
            if fleet.lower() in first_row_text.lower():
                current_fleet = fleet
                break
        groups.setdefault(current_fleet, []).append(tbl)

    return list(groups.items())

# ── Clubspot best-effort ───────────────────────────────────────────────────
def try_clubspot(full_text):
    """
    CLUBSPOT format: main table has sail numbers + scores.
    SAILORS section below maps positions to names.
    Extract what we can; leave names blank if unparsed.
    """
    # Find the SAILORS section
    sailors_match = re.search(r'\bSAILORS\b', full_text, re.IGNORECASE)
    if not sailors_match:
        return None

    sailors_text = full_text[sailors_match.end():]
    # Names in SAILORS section are usually "First LAST\nFirst LAST" pairs
    names = re.findall(r'[A-Z][a-z]+(?:\s+[A-Za-z]+)+', sailors_text)

    # Find main results table rows: sail number + scores
    # Pattern: "1 HKG 2751 ..." with numbers following
    rows = []
    for line in full_text[:sailors_match.start()].split('\n'):
        line = line.strip()
        m = re.match(r'^(\d+)\s+([A-Z]{3}\s+\d+|\d+)\s+.*?(\d[\d\s\(\)]+)$', line)
        if m:
            rows.append(line)

    if not rows:
        return None

    entries = []
    helm_idx = 0
    for i, row in enumerate(rows):
        parts = row.split()
        sail = next((p for p in parts if re.match(r'^\d{2,5}$', p)), '—')
        scores = [clean_score(p) for p in parts if clean_score(p) is not None]
        # Remove rank, sail from scores
        helm = names[helm_idx] if helm_idx < len(names) else ''
        crew = names[helm_idx + 1] if (helm_idx + 1) < len(names) else ''
        if helm:
            helm = title_name(helm)
        if crew:
            crew = title_name(crew)
        helm_idx += 2
        if scores:
            entries.append({'helm': helm, 'crew': crew, 'sail': sail, 'div': '', 'races': scores})

    return entries if entries else None

# ── main parse ─────────────────────────────────────────────────────────────
def parse_pdf_bytes(pdf_bytes: bytes) -> dict:
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
                    all_tables.extend(tbls)
                    break

    ev_name   = extract_event_name(full_text)
    discards  = extract_discards(full_text)
    prov_date = extract_date(full_text)

    # Group tables by fleet
    fleet_groups = group_tables_by_fleet(all_tables, full_text)

    results = []  # list of {fleet, entries, discards}

    for fleet_name, tables in fleet_groups:
        seen = set()
        fleet_entries = []
        for tbl in tables:
            parsed = parse_table(tbl, fleet_name)
            if parsed and parsed['entries']:
                for e in parsed['entries']:
                    key = (e['helm'].lower(), e['sail'])
                    if key not in seen:
                        seen.add(key)
                        fleet_entries.append(e)

        if fleet_entries:
            results.append({
                'fleet': fleet_name,
                'entries': fleet_entries,
                'discards': discards,
            })

    # Clubspot fallback if nothing found
    if not results:
        clubspot = try_clubspot(full_text)
        if clubspot:
            results.append({'fleet': '', 'entries': clubspot, 'discards': discards})

    if not results:
        raise ValueError(
            'No results table found. '
            'Supported: Sailwave (any version), Manage2sail, SailingResults.net. '
            'For other formats use Manual entry.'
        )

    # Single fleet → return directly (legacy path, no picker needed)
    if len(results) == 1:
        r = results[0]
        return {
            'ok': True,
            'multi': False,
            'name': ev_name,
            'discards': r['discards'],
            'date': prov_date,
            'entries': r['entries'],
        }

    # Multiple fleets → return picker data
    return {
        'ok': True,
        'multi': True,
        'name': ev_name,
        'date': prov_date,
        'fleets': [
            {
                'name': r['fleet'],
                'entries': r['entries'],
                'discards': r['discards'],
                'count': len(r['entries']),
            }
            for r in results
        ],
    }

# ── Vercel handler ─────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if pdfplumber is None:
            return self._respond(500, {
                'ok': False,
                'error': 'pdfplumber not installed — check requirements.txt.',
            })
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return self._respond(400, {'ok': False, 'error': 'No file received.'})
        pdf_bytes = self.rfile.read(length)
        try:
            result = parse_pdf_bytes(pdf_bytes)
            self._respond(200, result)
        except Exception as exc:
            self._respond(422, {'ok': False, 'error': str(exc)})

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass
