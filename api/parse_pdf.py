"""
AthLink PDF parser v4 — Vercel serverless function.

Universal parser covering:
  - Sailwave PDF (standard, any column arrangement, wrapped text in cells)
  - Sailwave HTML via ourclubadmin (doubled headers, TP5 [17.0] scores)
  - Manage2sail (split 2-row header, combined helm+crew cell with birth years)
  - SailingResults.net
  - Clubspot (SAILORS section below table)
  - ourclubadmin multi-class (Rank Class Sail number Club Helm's Name Crew's Name)
  - Multi-fleet / split Gold/Silver/Bronze fleet events
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
        re.match(r'^(RACE\s*\d{1,2})$', s) or
        re.match(r'^\d{1,2}$', s) or
        re.match(r'^M\d{1,2}$', s) or          # M10 = medal race 10
        s == 'MR'                               # MR  = medal race
    )


def hdr_key(cell):
    return re.sub(r"[\s\n_()/\\']+", '', fix_doubled(str(cell or '')).lower())

# ── name helpers ───────────────────────────────────────────────────────────
def strip_birth_year(name):
    return re.sub(r'\s*\(\d{4}\)\s*', '', str(name)).strip()

def strip_club_suffix(name):
    return re.sub(r'\s*\([A-Z]{2,6}\)\s*$', '', str(name)).strip()

def title_name(n):
    if not n:
        return ''
    parts = str(n).strip().split()
    out = []
    for p in parts:
        if len(p) > 1 and re.match(r'^[A-Z\-]+$', p):
            out.append(p.title())
        else:
            out.append(p)
    return ' '.join(out)

def clean_name(raw):
    n = str(raw or '').strip()
    n = strip_birth_year(n)
    n = strip_club_suffix(n)
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

    # Case 2: birth years → manage2sail combined cell
    if re.search(r'\(\d{4}\)', raw):
        lines = raw.split('\n')
        person_lines = []
        current = ''
        for line in lines:
            line = line.strip()
            if not line:
                continue
            current = (current + ' ' + line).strip()
            # When we hit a birth year, this person is complete
            if re.search(r'\(\d{4}\)', line):
                person_lines.append(current)
                current = ''
        if current:
            person_lines.append(current)
        helm = clean_name(person_lines[0]) if person_lines else ''
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
    if raw is None:
        return '', ''
    s = str(raw).strip()
    m = re.match(r'^([A-Z]{3})\s+(\d+.*)$', s)
    if m:
        return m.group(1), m.group(2).strip()
    return '', s

def flag_from_ioc(code):
    if not code:
        return ''
    up = code.upper().strip()
    return up if re.match(r'^[A-Z]{3}$', up) else ''

# ── metadata ───────────────────────────────────────────────────────────────
def extract_event_name(text):
    kw = r'(?i)(championship|regatta|nationals|cup|trophy|open|series|race|sailing|woche|ovington)'
    skip = r'(?i)^(sailed|discard|entries|result|rank|pos|overall|start|finish|http|www|point|powered|report)'
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
    m = re.search(r'[Dd]iscard[^:]*[:\s]+(?:Global[:\s]+)?(\d+)', text)
    return int(m.group(1)) if m else 1

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
        elif h in ('sailno','sail','sailnum','sailnumber','no.','boatno','sailno.','number'):
            cols.setdefault('sail', i)
        elif h in ('division','div','fleet','class','dinghyclass/fleet','fleet/class',
                   'boatclass','dinghyclass','boatgender'):
            cols.setdefault('div', i)
        elif h in ('nat','nationality','country','sailnationalletter','nationalletter'):
            cols.setdefault('nat', i)
        elif h in ('club','clubs','clubname','club/association','clubassociation','club/org'):
            cols.setdefault('club', i)
        elif h in ('total','totalpts','totalpoints','pts','points','totalpts.'):
            cols['total'] = i
        elif h in ('nett','net','netpts','netpoints','nettpts','nettpoints','nett.','netpts.'):
            cols['net'] = i
        if is_race_hdr(cell):
            cols.setdefault('race_start', i)
            cols['race_end'] = i
    return cols

# ── row parsing ────────────────────────────────────────────────────────────
def parse_row_with_cols(row, cols):
    def get(key, default=''):
        idx = cols.get(key)
        if idx is None or idx >= len(row):
            return default
        return str(row[idx] or '').strip()

    helm_raw = get('helm')
    crew_raw = get('crew')
    sail_raw = get('sail')
    nat_raw  = get('nat')
    div_raw  = get('div')

    if 'sailors' in cols and not helm_raw:
        # Combined column: split into helm + crew
        helm_raw, crew_raw = split_combined_names(get('sailors'))
    else:
        # Dedicated helm/crew columns: just join wrapped lines
        if helm_raw:
            helm_raw = join_wrapped(helm_raw)
        if crew_raw:
            crew_raw = join_wrapped(crew_raw)
        # Check if helm cell has two people (manage2sail combined despite dedicated col)
        if helm_raw and '\n' in get('helm') and not crew_raw:
            raw_helm_cell = get('helm')
            h, c = split_combined_names(raw_helm_cell)
            helm_raw, crew_raw = h, c

    extracted_nat, clean_sail = parse_sail_country(sail_raw)
    if not nat_raw and extracted_nat:
        nat_raw = extracted_nat

    race_start = cols.get('race_start')
    race_end   = cols.get('race_end')
    races = []
    race_codes = []  # parallel array: code annotation when a numeric score had a code label
    if race_start is not None and race_end is not None:
        skip_cols = {cols.get('total'), cols.get('net')}
        for i in range(race_start, race_end + 1):
            if i >= len(row) or i in skip_cols:
                continue
            sc, code_ann = clean_score_with_code(row[i])
            if sc is not None:
                races.append(sc)
                race_codes.append(code_ann)  # None for plain scores, "STP" etc for annotated

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

    return {
        'helm':       clean_name(helm_raw),
        'crew':       clean_name(crew_raw),
        'sail':       clean_sail or '—',
        'nat':        flag_from_ioc(nat_raw),
        'div':        div_raw,
        'races':      races,
        'race_codes': race_codes,
        'pdf_rank':   pdf_rank,
        'pdf_net':    pdf_net,
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

    entries = []
    for row in tbl[header_end:]:
        if not row or not any(str(c or '').strip() for c in row):
            continue
        first = fix_doubled(str(row[0] or '')).strip().lower()
        if first in ('rank','rk','pos','pl','name','helm','helmname','sailor'):
            continue
        if len([c for c in row if str(c or '').strip()]) < 3:
            continue
        e = parse_row_with_cols(row, cols)
        if not e['helm'] or not e['races']:
            continue
        if fleet_hint and not e['div']:
            e['div'] = fleet_hint
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
            entries.append({'helm':helm,'crew':crew,'sail':sail,'nat':nat,'div':'','races':score_vals,'race_codes':[None]*len(score_vals),'pdf_rank':i2+1,'pdf_net':None})

    return entries if entries else None

# ── Fleet detection ────────────────────────────────────────────────────────
FLEET_PATTERNS = re.compile(
    r'(?i)\b(29er|49er|49erFX|ILCA\s*\d?|Optimist\s*(?:Main|Intermediate|Green|Junior|Novice)?'
    r'|Laser|RS\w+|2\.4\s*mR|Finn|470|Nacra\s*\d+|420|Topper)\b'
)

def detect_fleets_in_text(text):
    found = []; seen = set()
    for m in FLEET_PATTERNS.finditer(text):
        name = re.sub(r'\s+', ' ', m.group(0).strip())
        key = name.lower()
        if key not in seen:
            seen.add(key); found.append(name)
    return found

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
                    all_tables.extend(tbls); break

    ev_name  = extract_event_name(full_text)
    discards = extract_discards(full_text)
    ev_date  = extract_date(full_text)
    results  = []

    # ── pdfplumber table extraction ───────────────────────────────
    if all_tables:
        detected_fleets = detect_fleets_in_text(full_text)
        fleet_groups = {}
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

            parsed = parse_table(tbl, current_fleet)
            if parsed and parsed['entries']:
                grp = current_fleet or 'main'
                if grp not in fleet_groups:
                    fleet_groups[grp] = []
                seen_keys = {(e['helm'].lower(), e['sail']) for e in fleet_groups[grp]}
                for e in parsed['entries']:
                    k = (e['helm'].lower(), e['sail'])
                    if k not in seen_keys:
                        seen_keys.add(k); fleet_groups[grp].append(e)

        for fname, entries in fleet_groups.items():
            if entries:
                results.append({'fleet': fname if fname != 'main' else '', 'entries': entries, 'discards': discards})

    # ── Clubspot fallback ─────────────────────────────────────────
    if not results:
        cs = try_clubspot(full_text)
        if cs:
            results.append({'fleet': '', 'entries': cs, 'discards': discards})

    if not results:
        raise ValueError(
            'No results table found. Supported: Sailwave, Manage2sail, SailingResults.net, Clubspot. '
            'For other formats use Manual entry.'
        )

    results = [r for r in results if r.get('entries')]

    # Merge Gold/Silver/Bronze/Emerald fleet sections into one event
    gsb = [r for r in results if re.search(r'Gold|Silver|Bronze|Emerald|Sapphire', r.get('fleet',''), re.IGNORECASE)]
    other = [r for r in results if r not in gsb]
    if gsb and not other:
        merged = []
        seen = set()
        for r in sorted(gsb, key=lambda x: x.get('fleet','')):
            for e in r['entries']:
                k = (e['helm'].lower(), e['sail'])
                if k not in seen:
                    seen.add(k); merged.append(e)
        return {'ok':True,'multi':False,'name':ev_name,'discards':discards,'date':ev_date,'entries':merged}

    if len(results) == 1:
        r = results[0]
        return {'ok':True,'multi':False,'name':ev_name,'discards':r['discards'],'date':ev_date,'entries':r['entries']}

    return {
        'ok': True, 'multi': True, 'name': ev_name, 'date': ev_date,
        'fleets': [{'name':r['fleet'],'entries':r['entries'],'discards':r['discards'],'count':len(r['entries'])} for r in results],
    }

# ── Vercel handler ─────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()
    def do_POST(self):
        if pdfplumber is None:
            return self._respond(500, {'ok':False,'error':'pdfplumber not installed.'})
        length = int(self.headers.get('Content-Length', 0))
        if not length:
            return self._respond(400, {'ok':False,'error':'No file received.'})
        try:
            self._respond(200, parse_pdf_bytes(self.rfile.read(length)))
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
