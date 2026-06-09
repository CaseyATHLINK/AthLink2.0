"""
AthLink PDF parser — Vercel Python serverless function.
Accepts a raw PDF (application/octet-stream POST body).
Returns JSON: { ok, name, discards, entries: [{helm, crew, sail, div, races}] }

This is why the browser approach fails: pdf.js extracts text in reading order,
losing all column structure. pdfplumber uses PDF layout coordinates to detect
actual table cells, giving us clean rows and columns regardless of column count.
"""

from http.server import BaseHTTPRequestHandler
import json
import io
import re

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


def parse_sailwave_pdf(pdf_bytes: bytes) -> dict:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        if not pdf.pages:
            raise ValueError("Empty PDF.")

        page = pdf.pages[0]
        page_text = page.extract_text() or ""
        lines = [l.strip() for l in page_text.splitlines() if l.strip()]
        name = lines[0][:80] if lines else "Imported Regatta"

        # Get Sailed / Discards from the summary line
        m = re.search(r"Sailed:\s*(\d+).*?Discards:\s*(\d+)", page_text, re.I)
        num_races = int(m.group(1)) if m else None
        discards = int(m.group(2)) if m else 1

        # Extract tables — pdfplumber detects cell boundaries from PDF lines
        tables = page.extract_tables({
            "vertical_strategy": "lines",
            "horizontal_strategy": "lines",
        })
        if not tables:
            # Some PDFs use text-based lines; try looser strategy
            tables = page.extract_tables({
                "vertical_strategy": "text",
                "horizontal_strategy": "text",
            })

        # Find the Overall results table (has "Nett" or "Rank" in header)
        results_table = None
        for t in tables:
            if not t or len(t) < 3:
                continue
            header_text = " ".join(str(c or "").lower() for c in t[0])
            if "nett" in header_text or "rank" in header_text:
                results_table = t
                break

        if not results_table:
            raise ValueError(
                "No results table found. "
                "Make sure the PDF is a Sailwave Overall results export."
            )

        header = [str(c or "").strip() for c in results_table[0]]
        hl = [h.lower() for h in header]

        def find_col(*candidates):
            for name_c in candidates:
                for i, h in enumerate(hl):
                    if name_c in h:
                        return i
            return -1

        sail_col    = find_col("sail")
        div_col     = find_col("division", "div")
        nat_col     = find_col("nat")
        nett_col    = find_col("nett", "net")
        total_col   = find_col("total")
        sailors_col = find_col("sailors", "sailor")   # combined column (2024 format)
        helm_col    = find_col("helm")                 # separate columns (2023 format)
        crew_col    = find_col("crew")

        # Race columns: prefer explicit R1, R2, ... headers
        race_cols = [i for i, h in enumerate(header) if re.match(r"^R\d+$", h.strip(), re.I)]

        # Fallback: everything between last name-ish column and Total
        if not race_cols:
            boundary = max(
                c for c in [sailors_col, helm_col, crew_col, div_col, nat_col]
                if c >= 0
            ) + 1
            end = total_col if total_col > 0 else (nett_col if nett_col > 0 else len(header))
            race_cols = list(range(boundary, end))

        if num_races:
            race_cols = race_cols[:num_races]

        entries = []
        for row in results_table[1:]:
            if not row or not any(c for c in row if c and str(c).strip()):
                continue

            def cell(idx: int) -> str:
                if idx < 0 or idx >= len(row) or not row[idx]:
                    return ""
                return " ".join(str(row[idx]).split())  # collapse whitespace / newlines

            sail = cell(sail_col) or "—"
            div  = cell(div_col)

            if sailors_col >= 0:
                # Combined "Helm Name, Crew Name" cell
                raw = cell(sailors_col)
                parts = [p.strip() for p in raw.split(",") if p.strip()]
                helm = parts[0] if parts else ""
                crew = parts[1] if len(parts) > 1 else ""
            else:
                helm = cell(helm_col)
                crew = cell(crew_col)

            # Skip header repeats or empty rows
            if not helm or helm.lower() in ("helm name", "sailors", "rank"):
                continue

            # Parse race scores
            races = []
            for col in race_cols:
                raw = cell(col)
                if not raw:
                    continue
                clean = raw.replace("(", "").replace(")", "").strip()
                code = re.search(
                    r"\b(DNF|DNC|DNS|OCS|DSQ|BFD|UFD|RET|RDG)\b", clean, re.I
                )
                if code:
                    races.append(code.group(1).upper())
                else:
                    num = re.search(r"(\d+)", clean)
                    if num:
                        races.append(int(num.group(1)))

            if races:
                entries.append({
                    "helm": helm, "crew": crew,
                    "sail": sail, "div": div,
                    "races": races,
                })

        if len(entries) < 2:
            raise ValueError(
                f"Only found {len(entries)} entries — the table layout may not be "
                "standard Sailwave. Try Manual import."
            )

        return {"ok": True, "name": name, "discards": discards, "entries": entries}


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if pdfplumber is None:
            return self._respond(500, {
                "ok": False,
                "error": "pdfplumber is not installed on the server. "
                         "Check requirements.txt is deployed.",
            })

        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return self._respond(400, {"ok": False, "error": "No file received."})

        pdf_bytes = self.rfile.read(length)

        try:
            result = parse_sailwave_pdf(pdf_bytes)
            self._respond(200, result)
        except Exception as exc:
            self._respond(422, {"ok": False, "error": str(exc)})

    # ----------------------------------------------------------------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass  # silence default access logs
