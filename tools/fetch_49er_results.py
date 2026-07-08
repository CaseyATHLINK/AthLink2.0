#!/usr/bin/env python3
"""
Fetch a 49er.org event page, extract the "49er results" table (the manage2sail
embed under the #result-49 tab), and run it through the AthLink rule parser +
completeness gate. Reports per event: parsed row count, race columns, and the
deterministic completeness verdict.

49er.org serves the results table server-side in the raw HTML (no JS needed),
but 403s a bare fetch — a browser User-Agent gets HTTP 200.

Usage:
    fetch_49er_results.py <event-slug> [<event-slug> ...]
    fetch_49er_results.py --file <local.html> <label>
Interpreter: /opt/anaconda3/bin/python3 (pdfplumber/openpyxl for parse_pdf import).
"""
import sys, os, re, io, importlib.util, contextlib, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, rel))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


pp = _load("parse_pdf", os.path.join("api", "parse_pdf.py"))
comp = _load("completeness", os.path.join("api", "completeness.py"))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def extract_49er_table(html):
    """Return the innerHTML of the #result-49 container's table, or '' if absent.
    The 49er results live in <div id="result-49" ...>…<table>…</table></div>; the
    49erFX one is #result-49fx (excluded)."""
    m = re.search(r'id="result-49"', html)
    if not m:
        return ""
    tail = html[m.start():]
    tm = re.search(r'<table\b.*?</table>', tail, re.DOTALL | re.IGNORECASE)
    return tm.group(0) if tm else ""


def run_one(label, html):
    table = extract_49er_table(html)
    if not table:
        return {"label": label, "ok": False, "note": "no #result-49 table found"}
    page = "<html><body><h1>" + label + " 49er</h1>" + table + "</body></html>"
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            result = pp.parse_pdf_bytes(page.encode("utf-8"), mode="rule")
    except Exception as e:
        return {"label": label, "ok": False, "note": f"{type(e).__name__}: {e}"}
    es = result.get("entries") or []
    if result.get("multi"):
        es = [e for f in result["fleets"] for e in (f.get("entries") or [])]
    rep = comp.verify_completeness(result, declared=result.get("_checksums"))
    widths = sorted({len(e.get("races") or []) for e in es})
    return {"label": label, "ok": True, "rows": len(es),
            "race_widths": widths, "complete": rep["complete"],
            "summary": rep["summary"],
            "gap_kinds": rep["stats"].get("gap_kinds", [])}


def main():
    args = sys.argv[1:]
    jobs = []
    if args and args[0] == "--file":
        label = args[2] if len(args) > 2 else os.path.basename(args[1])
        jobs.append((label, open(args[1], encoding="utf-8", errors="ignore").read()))
    else:
        for slug in args:
            url = f"https://49er.org/events/{slug}/"
            try:
                jobs.append((slug, fetch(url)))
            except Exception as e:
                print(f"FETCH-FAIL {slug}: {e}")
    print(f"{'event':<42} {'rows':>5} {'widths':<14} {'complete':<9} verdict")
    print("=" * 100)
    for label, html in jobs:
        r = run_one(label, html)
        if not r["ok"]:
            print(f"{label:<42} {'--':>5} {'':<14} {'ERR':<9} {r['note']}")
            continue
        w = ",".join(map(str, r["race_widths"]))[:13]
        mark = "YES" if r["complete"] else "no"
        print(f"{label:<42} {r['rows']:>5} {w:<14} {mark:<9} {r['summary']}")


if __name__ == "__main__":
    main()
