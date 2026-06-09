"""
AthLink PDF parser — Vercel Python serverless function.
Handles multiple result formats:
  1. Standard Sailwave PDF     (Helm Name / Crew Name / R1-Rn columns)
  2. Sailwave HTML→PDF         (HelmName / CrewName / F1-Fn, multi-fleet, multi-page)
  3. Screenshot / HK local     (Helm Name / Crew Name with Club col, "1st" ranks)
  4. SailingResults.net        (Pl / Name multiline / Sail Num / 1 2 3... columns)
"""

from http.server import BaseHTTPRequestHandler
import json, io, re

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

# ── constants ──────────────────────────────────────────────────────────────
CODES = {
    'DNF','DNC','DNS','OCS','DSQ','BFD','UFD','RET',
    'RDG','DGM','DNE','SCP','NSC','PRP','TAL','ZFP',
}

# ── score helpers ──────────────────────────────────────────────────────────
def clean_score(v):
    """Parse one table cell → int, float, str code, or None."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in ('-', '—', '–', '*', ''):
        return None
    s = s.strip('()')                          # remove discard parens
    parts = re.split(r'[\s\n]+', s.strip())    # split on whitespace / newlines
    for p in parts:                            # any part might be a code
        if p.upper() in CODES:
            return p.upper()
    # Try numeric (Sailwave stores "14.0")
    num_s = parts[0] if parts else s
    try:
        n = float(num_s)
        return int(n) if n == int(n) else round(n, 2)
    except ValueError:
        if num_s.upper() in CODES:
            return num_s.upper()
    return None

def is_race_hdr(cell):
    """True if header string looks like a race column: R1, F1, 1, 10, etc."""
    s = str(cell or '').strip().upper()
    return bool(re.match(r'^[RF]?\d{1,2}$', s))

# ── name helper ────────────────────────────────────────────────────────────
def title_name(n):
    """Convert ALL-CAPS names to Title Case; leave mixed-case unchanged."""
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

# ── event-level metadata ───────────────────────────────────────────────────
def extract_event_name(text):
    kw = r'(?i)(championship|regatta|nationals|cup|trophy|open|series|race|sailing)'
    skip = r'(?i)^(sailed|discard|entries|results|rank|pos|overall|start|finish|http|www)'
    for line in text.split('\n'):
        line = line.strip()
        if len(line) > 8 and re.search(kw, line) and not re.match(skip, line):
            return line[:100]
    for line in text.split('\n')[:10]:
        line = line.strip()
        if len(line) > 8 and not line[0].isdigit() and 'http' not in line.lower():
            return line[:100]
    return 'Imported Regatta'

def extract_discards(text):
    m = re.search(r'[Dd]iscards?[:\s]+(\d+)', text)
    return int(m.group(1)) if m else 1

# ── column detection ───────────────────────────────────────────────────────
def detect_cols(header_row):
    """Map column indices to semantic field names."""
    cols = {}
    for i, cell in enumerate(header_row):
        h = re.sub(r'[\s\n_()/]+', '', str(cell or '').lower())
        # name fields
        if h in ('helmname', 'helm'):
            cols.setdefault('helm', i)
        elif h in ('crewname', 'crew'):
            cols['crew'] = i
        elif h == 'name' and 'helm' not in cols:
            cols.setdefault('helm', i)      # SailingResults: "Name" = combined
        # sail
        elif h in ('sailno', 'sail', 'sailnum', 'sailnumber', 'no.', 'boatno'):
            cols.setdefault('sail', i)
        # division
        elif h in ('division', 'div', 'fleet', 'class'):
            cols.setdefault('div', i)
        # country
        elif h in ('country', 'nat', 'nationality'):
            cols.setdefault('nat', i)
        # totals (to exclude from race range)
        elif h in ('total', 'totalpoints', 'pts'):
            cols['total'] = i
        elif h in ('nett', 'net', 'netpoints', 'nettpoints'):
            cols['net'] = i
        # rank
        elif h in ('rank', 'pl', 'pos', 'position', 'place'):
            cols.setdefault('rank', i)
        # race columns
        if is_race_hdr(cell):
            cols.setdefault('race_start', i)
            cols['race_end'] = i
    return cols

# ── single-table parser ────────────────────────────────────────────────────
def parse_table(tbl):
    """Return list of entry dicts or None if this table isn't a results table."""
    if not tbl or len(tbl) < 3:
        return None

    # Find header row (contains name-like column AND ≥3 race-like columns)
    header_idx = None
    for i, row in enumerate(tbl[:14]):
        if row is None:
            continue
        txt = ' '.join(str(c or '').strip().lower() for c in row)
        race_cnt = sum(1 for c in row if is_race_hdr(c))
        has_name = any(k in txt for k in ('helm', 'crewname', 'crew name'))
        has_generic_name = ' name' in (' ' + txt) or txt.startswith('name')
        if (has_name or (has_generic_name and race_cnt >= 3)) and len(row) >= 5:
            header_idx = i
            break

    if header_idx is None:
        return None

    hdr = [str(c or '').strip() for c in tbl[header_idx]]
    cols = detect_cols(hdr)

    if 'helm' not in cols or 'race_start' not in cols:
        return None

    # Race column range (exclude Total / Net)
    r0, r1 = cols['race_start'], cols['race_end']
    for k in ('total', 'net'):
        if k in cols and cols[k] <= r1:
            r1 = cols[k] - 1
    race_range = list(range(r0, r1 + 1))

    entries = []
    for row in tbl[header_idx + 1:]:
        if row is None:
            continue
        cells = [str(c or '').strip() for c in row]
        if all(c == '' for c in cells):
            continue

        joined = ' '.join(cells).lower()
        # Skip fleet-separator rows like "1-Gold Fleet" or re-header rows
        if re.match(r'^\d+-\w+\s+fleet', joined, re.I):
            continue
        if ('helmname' in joined or 'helm name' in joined) and 'crewname' in joined:
            continue
        if 'rank' in joined and 'total' in joined and 'nett' in joined:
            continue

        # Helm name
        helm_raw = cells[cols['helm']] if cols['helm'] < len(cells) else ''
        helm_lines = [l.strip() for l in helm_raw.split('\n') if l.strip()]
        helm = title_name(helm_lines[0]) if helm_lines else ''

        # Crew (from same cell if multiline, or separate column)
        crew = ''
        if len(helm_lines) >= 2 and 'crew' not in cols:
            crew = title_name(helm_lines[1])
        if 'crew' in cols and cols['crew'] < len(cells):
            c_raw = cells[cols['crew']].strip()
            if c_raw:
                crew = title_name(c_raw)

        if not helm or len(helm) < 2:
            continue
        # Skip rows where helm looks like a column header
        if helm.lower() in ('helm name', 'helm', 'name', 'sailors', 'rank', 'pl'):
            continue

        # Sail number
        sail = '—'
        if 'sail' in cols and cols['sail'] < len(cells):
            m = re.search(r'(\d+)', cells[cols['sail']])
            if m:
                sail = m.group(1)

        # Division
        div = ''
        if 'div' in cols and cols['div'] < len(cells):
            div_raw = cells[cols['div']]
            # Skip if it's a numeric fleet indicator like "1" or "1-Gold"
            if not re.match(r'^\d', div_raw.strip()):
                div = div_raw

        # Race scores
        races = []
        for j in race_range:
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

    return entries if entries else None

# ── main parse function ────────────────────────────────────────────────────
def parse_pdf_bytes(pdf_bytes: bytes) -> dict:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        if not pdf.pages:
            raise ValueError('Empty PDF.')

        full_text = '\n'.join(p.extract_text() or '' for p in pdf.pages)

        # Collect tables from ALL pages with two strategies
        all_tables = []
        for page in pdf.pages:
            for strategy in (
                {'vertical_strategy': 'lines',  'horizontal_strategy': 'lines'},
                {'vertical_strategy': 'text',   'horizontal_strategy': 'text'},
            ):
                tbls = page.extract_tables(strategy) or []
                if tbls:
                    all_tables.extend(tbls)
                    break   # use first strategy that yields tables for this page

    ev_name  = extract_event_name(full_text)
    discards = extract_discards(full_text)

    # Parse all tables, dedup by (helm_lower, sail)
    all_entries = []
    seen = set()
    for tbl in all_tables:
        entries = parse_table(tbl)
        if entries:
            for e in entries:
                key = (e['helm'].lower(), e['sail'])
                if key not in seen:
                    seen.add(key)
                    all_entries.append(e)

    if not all_entries:
        raise ValueError(
            'No results table found. '
            'Supported: Sailwave PDF (any format), SailingResults.net. '
            'For other sources use Manual entry.'
        )

    return {'ok': True, 'name': ev_name, 'discards': discards, 'entries': all_entries}

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
                'error': 'pdfplumber not installed — check requirements.txt is deployed.',
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
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _respond(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass
