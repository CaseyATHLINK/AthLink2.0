"""
AthLink event enrichment — Vercel serverless function.

When the parser returns no date and/or no host country PRINTED on the document,
this endpoint looks the event up on the web and returns a LOW-CONFIDENCE
suggestion the preview UI can offer the user. Enrichment is strictly optional:
the UI treats any failure as "no suggestion", so this endpoint NEVER hard-fails
the import — provider errors come back as {"ok": false, "error": str} with HTTP
200.

Provider (parser v3): **Gemini + Google Search grounding** is primary (one paid
key via _gemini_key(), routed as task 'enrich' → gemini-3-flash). Anthropic
Sonnet 5 with server-side web_search is the fallback. Same "low-confidence,
never auto-applied" contract as before. Keys stay server-side. Uses the urllib
pattern from llm.py (no SDK) to stay under the 60s ceiling.
"""

from http.server import BaseHTTPRequestHandler
import json, os, sys

# Sibling import (same pattern parse_pdf.py / ai_filter.py use).
_API_DIR = os.path.dirname(os.path.abspath(__file__))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)
from llm import (_post_json, LLMError, anthropic_text, ANTHROPIC_URL,
                 call_gemini, gemini_text, _gemini_key, route as _llm_route,
                 _anthropic_fallback_model)

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Anthropic fallback (web-search) model — Sonnet 5, env-overridable. NEVER Haiku.
ENRICH_FALLBACK_MODEL = _anthropic_fallback_model()
# The endpoint must finish < 60s (Vercel Hobby ceiling). Bound the provider
# call to 45s so we always return before the platform kills the function.
REQUEST_TIMEOUT = 45


def _enrich_model():
    """Gemini model for enrichment via llm.route('enrich') (honours ENRICH_MODEL
    env override), defaulting to gemini-3-flash."""
    try:
        return (_llm_route("enrich") or {}).get("model") or "gemini-3-flash"
    except Exception:
        return "gemini-3-flash"


def _build_prompt(name, cls, year, host, missing):
    """Compose the web-search instruction for the specific event."""
    want = []
    if "date" in missing:
        want.append("(a) the event date (or its START date if multi-day) "
                    "formatted as DD/MM/YYYY")
    if "country" in missing:
        want.append("(b) the host country as an IOC 3-letter country code "
                    "(e.g. HKG, GBR, USA)")
    ident = [f'name: "{name}"']
    if cls:  ident.append(f"boat class: {cls}")
    if year: ident.append(f"year: {year}")
    if host: ident.append(f"organiser/host: {host}")
    return (
        "You are helping identify a sailing competition so its record can be "
        "completed. Use web search to find THE SPECIFIC event described below — "
        "not a similarly-named one, not a different edition/year.\n\n"
        "Event:\n  " + "\n  ".join(ident) + "\n\n"
        "Find " + " and ".join(want) + ".\n\n"
        "Respond with STRICT JSON and NOTHING ELSE, exactly this shape:\n"
        '{"date": "DD/MM/YYYY" or null, "country": "XXX" or null, '
        '"source": "<url>" or null}\n\n'
        "Rules:\n"
        "- If you are not confident you found the EXACT event, return nulls. "
        "NEVER guess or approximate.\n"
        "- Only fill a field you were asked for; leave the other null.\n"
        "- date must be DD/MM/YYYY; country must be a 3-letter IOC code.\n"
        "- source is the single URL you drew the answer from.\n"
        "- Output the JSON object only — no prose, no markdown fences."
    )


def _extract_json(text):
    """Pull the strict-JSON object out of the model's final text answer."""
    if not text:
        return {}
    s = text.strip()
    # Strip accidental markdown fences.
    if s.startswith("```"):
        s = s.strip("`")
        nl = s.find("\n")
        if nl != -1:
            s = s[nl + 1:]
    a, b = s.find("{"), s.rfind("}")
    if a == -1 or b == -1 or b < a:
        return {}
    try:
        return json.loads(s[a:b + 1])
    except Exception:
        return {}


def _clean_country(v):
    if not v:
        return None
    c = str(v).strip().upper()
    return c if len(c) == 3 and c.isalpha() else None


def _clean_date(v):
    if not v:
        return None
    d = str(v).strip()
    parts = d.split("/")
    if len(parts) == 3 and all(p.isdigit() for p in parts) and len(parts[2]) == 4:
        return d
    return None


def _enrich_gemini(prompt):
    """Primary: Gemini + Google Search grounding. Raises on any failure."""
    resp = call_gemini(_gemini_key(), _enrich_model(), [{"text": prompt}],
                       max_tokens=700, timeout=REQUEST_TIMEOUT,
                       tools=[{"google_search": {}}])
    return _extract_json(gemini_text(resp))


def _enrich_anthropic(prompt):
    """Fallback: Anthropic Sonnet 5 + server-side web_search. Raises on failure."""
    payload = {
        "model": ENRICH_FALLBACK_MODEL,
        "max_tokens": 700,
        "messages": [{"role": "user", "content": prompt}],
        # Anthropic server-side web search — bounded to a few queries so the
        # call stays fast and within the timeout budget.
        "tools": [{"type": "web_search_20250305",
                   "name": "web_search",
                   "max_uses": 3}],
    }
    headers = {"Content-Type": "application/json",
               "x-api-key": ANTHROPIC_KEY,
               "anthropic-version": "2023-06-01"}
    resp = _post_json(ANTHROPIC_URL, payload, headers, REQUEST_TIMEOUT)
    return _extract_json(anthropic_text(resp))


def enrich(name, cls, year, host, missing):
    """Run the web-search lookup. Returns (date, country, source).

    Gemini + Google Search grounding is primary; Anthropic Sonnet 5 web_search
    is the fallback (fires only on a Gemini error). Raises LLMError only when
    BOTH providers fail (and one is configured) so the handler can turn it into
    ok:false. Never raises for a "not found" — that returns nulls.
    """
    prompt = _build_prompt(name, cls, year, host, missing)
    data = None
    if _gemini_key():
        try:
            data = _enrich_gemini(prompt)
        except Exception:
            data = None  # fall through to Anthropic
    if data is None and ANTHROPIC_KEY:
        data = _enrich_anthropic(prompt)
    if data is None:
        raise LLMError("no enrichment provider configured "
                       "(set Gemini_API_Key_Universal, or ANTHROPIC_API_KEY as fallback)")
    return (_clean_date(data.get("date")),
            _clean_country(data.get("country")),
            (data.get("source") or None))


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not (_gemini_key() or ANTHROPIC_KEY):
            # Optional feature — never break the preview. 200 + ok:false.
            return self._respond(200, {"ok": False,
                                       "error": "No AI key set (Gemini_API_Key_Universal or ANTHROPIC_API_KEY)."})

        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return self._respond(200, {"ok": False, "error": "Empty body."})

        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            return self._respond(200, {"ok": False, "error": "Invalid JSON."})

        name    = str(body.get("name", "") or "").strip()
        cls     = str(body.get("cls", "") or "").strip()
        year    = str(body.get("year", "") or "").strip() if body.get("year") else ""
        host    = str(body.get("host", "") or "").strip() if body.get("host") else ""
        missing = body.get("missing") or []
        missing = [m for m in missing if m in ("date", "country")]

        if not name:
            return self._respond(200, {"ok": False, "error": "No event name provided."})
        if not missing:
            return self._respond(200, {"ok": False, "error": "Nothing to look up."})

        try:
            date, country, source = enrich(name, cls, year, host, missing)
        except LLMError as exc:
            return self._respond(200, {"ok": False, "error": str(exc)})
        except Exception as exc:  # never let enrichment crash the preview
            return self._respond(200, {"ok": False, "error": str(exc)})

        # Always low confidence — this is a web guess, not the document.
        self._respond(200, {"ok": True, "date": date, "country": country,
                            "source": source, "confidence": "low"})

    # ── helpers ──────────────────────────────────────────────────────────
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass
