"""
AthLink host research — Vercel serverless function ("auto-grab" onboarding).

When a new host (club / class association / federation) signs up, this endpoint
researches them on the web and returns a dossier the signup UI can offer as an
"Is this you?" confirmation card (mode=identity) and, later, a list of the past
competitions they ran for bulk import (mode=competitions).

Same product contract as api/enrich.py — this NEVER hard-fails the signup:
provider errors come back as {"ok": false, "error": str} with HTTP 200, and the
UI treats any failure as "no research". Nulls over guesses; the model must
return found:false rather than guess a wrong organisation. Nothing is ever
auto-applied — the user explicitly confirms the card.

Provider ladder mirrors enrich.py: **Gemini + Google Search grounding** is
primary (one paid key via _gemini_key(), routed as task 'research' →
gemini-3-flash). Anthropic Sonnet 5 with server-side web_search is the fallback,
firing only on a Gemini error. Keys stay server-side. Pure urllib via llm.py (no
SDK) to stay under the 60s Vercel ceiling.

The endpoint is host-agnostic: pure {name, type, country_hint, mode} in →
dossier out. It never reads or writes the DB, so an admin "run dossier for any
host" UI can call it later with no change.
"""

from http.server import BaseHTTPRequestHandler
import json, os, sys

# Sibling import (same pattern parse_pdf.py / ai_filter.py / enrich.py use).
_API_DIR = os.path.dirname(os.path.abspath(__file__))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)
from llm import (_post_json, LLMError, anthropic_text, ANTHROPIC_URL,
                 call_gemini, gemini_text, _gemini_key, route as _llm_route,
                 _anthropic_fallback_model)

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Anthropic fallback (web-search) model — Sonnet 5, env-overridable. NEVER Haiku.
RESEARCH_FALLBACK_MODEL = _anthropic_fallback_model()
# The endpoint must finish < 60s (Vercel Hobby ceiling). Bound the provider
# call to 45s so we always return before the platform kills the function.
REQUEST_TIMEOUT = 45

_VALID_TYPES = ("club", "association", "federation")
_VALID_MODES = ("identity", "competitions")


def _research_model():
    """Gemini model for research via llm.route('research') (honours RESEARCH_MODEL
    env override), defaulting to gemini-3-flash."""
    try:
        return (_llm_route("research") or {}).get("model") or "gemini-3-flash"
    except Exception:
        return "gemini-3-flash"


def _build_prompt(name, org_type, country_hint, mode):
    """Compose the web-search instruction. mode ∈ 'identity' | 'competitions'."""
    ident = [f'name the user typed: "{name}"']
    if org_type:
        ident.append(f"organisation type: {org_type}")
    if country_hint:
        ident.append(f"country hint (IOC 3-letter code): {country_hint}")

    # Shared disambiguation rules — the model must find THE SPECIFIC org.
    common = (
        "You are researching a sailing organisation so a new AthLink host account "
        "can be pre-filled. Use web search to identify THE SPECIFIC organisation "
        "described below — a club, class association, or national/regional "
        "federation that ORGANISES sailing competitions.\n\n"
        "Organisation:\n  " + "\n  ".join(ident) + "\n\n"
        "CRITICAL disambiguation rules:\n"
        "- Names collide across countries (e.g. a \"Royal ... Yacht Club\" exists "
        "in many nations). Use the country hint and the organisation type to pick "
        "the EXACT one. If you cannot be confident it is the exact organisation, "
        "return found:false with null fields. NEVER guess or blend two orgs.\n"
        "- Dates are DD/MM/YYYY. Countries are IOC 3-letter codes (HKG, RSA, GBR, "
        "USA…).\n"
        "- classes: only sailing boat classes actually raced BY or UNDER this org "
        "(e.g. ILCA, Optimist, 29er, 49er) — never invent.\n"
        "- Only include a competition the organisation itself ORGANISED or HOSTED "
        "— NOT an event merely held at their venue by someone else.\n"
    )

    if mode == "identity":
        return common + (
            "\nReturn STRICT JSON and NOTHING ELSE, exactly this shape:\n"
            '{"found": true|false, "official_name": str|null, "acronym": str|null, '
            '"website": "https://..."|null, "country": "XXX"|null, '
            '"classes": [str]|null, "blurb": str|null, '
            '"competitions": [{"name": str, "year": int, "class": str|null, '
            '"url": "https://..."|null}]|null, "sources": ["https://..."]|null}\n\n'
            "Field rules:\n"
            "- blurb: ONE factual sentence, no marketing tone.\n"
            "- competitions: at most 5, most recent first, only events the org RAN. "
            "Each needs a real results URL if findable, else url:null.\n"
            "- sources: the URLs you drew this from.\n"
            "- Any field you are not confident about → null. If found:false, all "
            "other fields null.\n"
            "- Output the JSON object only — no prose, no markdown fences."
        )

    # mode == "competitions"
    return common + (
        "\nList the past competitions this organisation has run, covering roughly "
        "the last 5 years. Return STRICT JSON and NOTHING ELSE, exactly this "
        "shape:\n"
        '{"found": true|false, "official_name": str|null, "website": '
        '"https://..."|null, "country": "XXX"|null, '
        '"competitions": [{"name": str, "year": int, "class": str|null, '
        '"url": "https://..."|null, "kind": "pdf"|"html"|"unknown"}]|null, '
        '"sources": ["https://..."]|null}\n\n'
        "Field rules:\n"
        "- competitions: up to 20, most recent first, ONLY events this org "
        "organised/hosted. Each needs a real results URL if findable, else "
        "url:null.\n"
        "- kind: your best guess at the result file format at that URL "
        "(\"pdf\", \"html\", or \"unknown\").\n"
        "- Everything else may be null if not confident.\n"
        "- Output the JSON object only — no prose, no markdown fences."
    )


def _extract_json(text):
    """Pull the strict-JSON object out of the model's final text answer.
    (Same hardening as enrich.py._extract_json.)"""
    if not text:
        return {}
    s = text.strip()
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


# ── field cleaners — nulls over guesses ──────────────────────────────────────
def _clean_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _clean_country(v):
    if not v:
        return None
    c = str(v).strip().upper()
    return c if len(c) == 3 and c.isalpha() else None


def _clean_url(v):
    if not v:
        return None
    u = str(v).strip()
    return u if u.lower().startswith(("http://", "https://")) else None


def _clean_year(v):
    try:
        y = int(str(v).strip())
    except (TypeError, ValueError):
        return None
    return y if 1900 <= y <= 2100 else None


def _clean_classes(v):
    if not isinstance(v, list):
        return []
    out = []
    for c in v:
        s = _clean_str(c)
        if s and s not in out:
            out.append(s)
    return out


def _clean_sources(v):
    if not isinstance(v, list):
        return []
    out = []
    for s in v:
        u = _clean_url(s)
        if u and u not in out:
            out.append(u)
    return out


def _clean_competitions(v, mode):
    """Normalise the competitions array. identity → max 5, competitions → max 20.
    kind is only meaningful in competitions mode."""
    if not isinstance(v, list):
        return []
    cap = 5 if mode == "identity" else 20
    out = []
    for item in v:
        if not isinstance(item, dict):
            continue
        name = _clean_str(item.get("name"))
        if not name:
            continue
        row = {
            "name": name,
            "year": _clean_year(item.get("year")),
            "class": _clean_str(item.get("class")),
            "url": _clean_url(item.get("url")),
        }
        if mode == "competitions":
            kind = str(item.get("kind") or "").strip().lower()
            row["kind"] = kind if kind in ("pdf", "html", "unknown") else "unknown"
        out.append(row)
        if len(out) >= cap:
            break
    return out


def _shape_result(data, mode):
    """Turn a raw model dict into the strict response dossier for `mode`."""
    data = data or {}
    found = bool(data.get("found"))
    comps = _clean_competitions(data.get("competitions"), mode)
    if mode == "identity":
        return {
            "found": found,
            "official_name": _clean_str(data.get("official_name")),
            "acronym": _clean_str(data.get("acronym")),
            "website": _clean_url(data.get("website")),
            "country": _clean_country(data.get("country")),
            "classes": _clean_classes(data.get("classes")),
            "blurb": _clean_str(data.get("blurb")),
            "competitions": comps,
            "sources": _clean_sources(data.get("sources")),
        }
    # competitions mode
    return {
        "found": found,
        "official_name": _clean_str(data.get("official_name")),
        "website": _clean_url(data.get("website")),
        "country": _clean_country(data.get("country")),
        "competitions": comps,
        "sources": _clean_sources(data.get("sources")),
    }


# ── provider callers (Gemini primary → Anthropic Sonnet fallback) ─────────────
def _research_gemini(prompt):
    """Primary: Gemini + Google Search grounding. Raises on any failure."""
    resp = call_gemini(_gemini_key(), _research_model(), [{"text": prompt}],
                       max_tokens=2000, timeout=REQUEST_TIMEOUT,
                       tools=[{"google_search": {}}])
    return _extract_json(gemini_text(resp))


def _research_anthropic(prompt):
    """Fallback: Anthropic Sonnet 5 + server-side web_search. Raises on failure."""
    payload = {
        "model": RESEARCH_FALLBACK_MODEL,
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}],
        "tools": [{"type": "web_search_20250305",
                   "name": "web_search",
                   "max_uses": 4}],
    }
    headers = {"Content-Type": "application/json",
               "x-api-key": ANTHROPIC_KEY,
               "anthropic-version": "2023-06-01"}
    resp = _post_json(ANTHROPIC_URL, payload, headers, REQUEST_TIMEOUT)
    return _extract_json(anthropic_text(resp))


def research(name, org_type, country_hint, mode):
    """Run the web research. Returns the shaped dossier dict for `mode`.

    Gemini + Google Search grounding is primary; Anthropic Sonnet 5 web_search is
    the fallback (fires only on a Gemini error). Raises LLMError only when BOTH
    providers fail (and one is configured) so the handler can turn it into
    ok:false. A "not found" is NOT an error — it returns found:false + nulls.
    """
    prompt = _build_prompt(name, org_type, country_hint, mode)
    data = None
    if _gemini_key():
        try:
            data = _research_gemini(prompt)
        except Exception:
            data = None  # fall through to Anthropic
    if data is None and ANTHROPIC_KEY:
        data = _research_anthropic(prompt)
    if data is None:
        raise LLMError("no research provider configured "
                       "(set Gemini_API_Key_Universal, or ANTHROPIC_API_KEY as fallback)")
    return _shape_result(data, mode)


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not (_gemini_key() or ANTHROPIC_KEY):
            # Optional feature — never break signup. 200 + ok:false.
            return self._respond(200, {"ok": False,
                                       "error": "No AI key set (Gemini_API_Key_Universal or ANTHROPIC_API_KEY)."})

        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return self._respond(200, {"ok": False, "error": "Empty body."})

        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            return self._respond(200, {"ok": False, "error": "Invalid JSON."})

        name = str(body.get("name", "") or "").strip()
        org_type = str(body.get("type", "") or "").strip().lower()
        if org_type not in _VALID_TYPES:
            org_type = ""
        country_hint = str(body.get("country_hint", "") or "").strip().upper()
        if not (len(country_hint) == 3 and country_hint.isalpha()):
            country_hint = ""
        mode = str(body.get("mode", "") or "identity").strip().lower()
        if mode not in _VALID_MODES:
            mode = "identity"

        if not name:
            return self._respond(200, {"ok": False, "error": "No organisation name provided."})

        try:
            dossier = research(name, org_type, country_hint, mode)
        except LLMError as exc:
            return self._respond(200, {"ok": False, "error": str(exc)})
        except Exception as exc:  # never let research crash signup
            return self._respond(200, {"ok": False, "error": str(exc)})

        self._respond(200, {"ok": True, "mode": mode, **dossier})

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
