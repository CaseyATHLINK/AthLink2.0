"""
Confidence scoring for parse results — AthLink.

Standalone, no third-party deps, no network. Its only job: look at a parse
result and decide whether the rule-based parser can be trusted, or whether the
parse should fall back to AI vision.

This is the "confidence gate" that catches the dangerous failure mode the plain
ok/raise fallback misses: the rule parser *succeeding* but returning garbage
(e.g. 2 entries from a 200-row regatta, or an event name polluted with a print
header). Those never raise, so without scoring they flow straight to preview.

Keep all quality heuristics HERE, not as new branches inside parse_pdf.py.
New checks = new functions in this module, not more format-specific if-blocks.
"""
import re

# Below this, fall back to AI. Tunable in one place.
THRESHOLD = 0.6


def _entries_of(result: dict) -> list:
    """Flatten entries across single-fleet and multi-fleet result shapes."""
    if not isinstance(result, dict):
        return []
    if result.get("multi") and result.get("fleets"):
        out = []
        for f in result["fleets"]:
            out += (f.get("entries") or [])
        return out
    return result.get("entries") or []


def _looks_like_junk_name(name: str) -> bool:
    """Event name polluted by a browser print header / timestamp / duplication."""
    if not name:
        return False
    n = name.strip()
    if re.search(r"\b\d{1,2}:\d{2}\b", n):                 # a clock time
        return True
    if re.match(r"^\d{1,2}/\d{1,2}/\d{2,4}", n):           # leads with a date
        return True
    if re.search(r"\bat\s+(\d{4})\b.*\b\1\b", n):          # "... at 2017 ... 2017"
        return True
    if len(n) > 90:                                        # absurdly long
        return True
    return False


def score_parse(result: dict) -> dict:
    """
    Return {confidence: 0..1, ok: bool, reasons: [str]}.

    ok == (confidence >= THRESHOLD). When ok is False, the caller should fall
    back to AI vision parsing.

    Reads result['_text_lines'] (int) when present — the rule parser stashes the
    PDF's text-line count there so we can detect "lots of document, few entries".
    """
    entries = _entries_of(result)
    n = len(entries)
    reasons = []

    if n == 0:
        return {"confidence": 0.0, "ok": False, "reasons": ["no entries parsed"]}

    conf = 1.0

    # 1. Silent-drop detector: a big document that produced almost no rows.
    text_lines = result.get("_text_lines")
    if isinstance(text_lines, int) and text_lines > 40 and n < 5:
        conf -= 0.6
        reasons.append(f"only {n} entries from a {text_lines}-line document (rows likely dropped)")
    elif n < 3:
        conf -= 0.4
        reasons.append(f"only {n} entries parsed")

    # 2. Required-field coverage.
    have_sail = sum(1 for e in entries if str(e.get("sail") or "").strip())
    if have_sail / n < 0.6:
        conf -= 0.3
        reasons.append(f"{have_sail}/{n} rows have a sail number")

    have_name = sum(1 for e in entries
                    if str(e.get("helm") or e.get("name") or "").strip())
    if have_name / n < 0.6:
        conf -= 0.3
        reasons.append(f"{have_name}/{n} rows have a helm/name")

    # 3. Rank contiguity — ranks should cover roughly 1..N.
    ranks = [e.get("pdf_rank") for e in entries if isinstance(e.get("pdf_rank"), int)]
    if ranks:
        missing = len(set(range(1, n + 1)) - set(ranks))
        if missing > max(1, 0.2 * n):
            conf -= 0.2
            reasons.append(f"{missing} ranks missing from 1..{n}")

    # 4. Event-name sanity.
    name = result.get("name") or result.get("event") or ""
    if _looks_like_junk_name(name):
        conf -= 0.15
        reasons.append("event name looks polluted (print header / timestamp)")

    conf = max(0.0, min(1.0, conf))
    return {
        "confidence": round(conf, 2),
        "ok": conf >= THRESHOLD,
        "reasons": reasons or ["looks clean"],
    }
