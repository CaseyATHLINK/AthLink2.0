#!/usr/bin/env python3
"""
Local parser test harness for AthLink's rule-based PDF parser.

Runs api/parse_pdf.py's _rule_based_parse() against sample PDFs WITHOUT any
deploy and WITHOUT any AI/network calls (pure rule logic only). Use this to
iterate on parser changes in seconds instead of push -> wait-for-Vercel -> test.

Usage:
    python3 tools/test_parser.py                 # run all PDFs in tools/fixtures/
    python3 tools/test_parser.py path/to.pdf     # run one file
    python3 tools/test_parser.py --json          # also write full output to tools/baseline/
    python3 tools/test_parser.py --diff          # compare against saved baseline, show changes

Typical loop:
    1. python3 tools/test_parser.py --json        (save a baseline before editing)
    2. ...edit api/parse_pdf.py...
    3. python3 tools/test_parser.py --diff         (see exactly what changed)
"""
import sys, os, io, json, glob, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FIXTURES = os.path.join(HERE, "fixtures")
BASELINE = os.path.join(HERE, "baseline")

# Import api/parse_pdf.py as a module without needing it on the path.
spec = importlib.util.spec_from_file_location(
    "parse_pdf", os.path.join(REPO, "api", "parse_pdf.py"))
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)


def summarize(result: dict) -> dict:
    """Compact, diff-friendly view of a parse result."""
    entries = result.get("entries") or result.get("competitors") or []
    # Multi-fleet results carry their rows under fleets[] rather than a top-level
    # entries[]; flatten them so n_entries / sample_rows are meaningful. (Existing
    # single-result PDF fixtures have a top-level entries[], so this never fires
    # for them — their summaries are unchanged.)
    fleets = result.get("fleets") or []
    if not entries and fleets:
        for f in fleets:
            entries.extend(f.get("entries") or [])
    verdict = pp.score_parse(result) if getattr(pp, "score_parse", None) else None
    # Deterministic completeness gate (§6A) — the hard "every row + every race
    # column + every required cell" check, asserted alongside confidence.
    comp = (pp.verify_completeness(result, declared=result.get("_checksums"))
            if getattr(pp, "verify_completeness", None) else None)
    return {
        "event":          result.get("event") or result.get("event_name") or result.get("name"),
        "date":           result.get("date"),
        "detected_class": result.get("detected_class"),
        "detected_host":  result.get("detected_host"),
        "discards":       result.get("discards"),
        "n_entries":      len(entries),
        "confidence":     verdict["confidence"] if verdict else None,
        "gate":           ("PASS (use rules)" if verdict and verdict["ok"]
                           else "FALL BACK TO AI" if verdict else None),
        "complete":       comp["complete"] if comp else None,
        "completeness":   comp["summary"] if comp else None,
        "confidence_reasons": verdict["reasons"] if verdict else None,
        "sample_rows": [
            {k: e.get(k) for k in ("pdf_rank", "sail", "helm", "crew", "nat",
                                    "div", "gender", "category")
             if k in e}
            for e in entries[:5]
        ],
    }


def run_one(path: str) -> dict:
    with open(path, "rb") as f:
        data = f.read()
    # PDFs go straight through the rule parser (fast, deterministic, no network).
    # Non-PDF fixtures (xlsx/blw/csv/html) have no _rule_based_parse entry point,
    # so route them through parse_pdf_bytes in mode='rule' (built-in only, no AI).
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return pp._rule_based_parse(data)
    return pp.parse_pdf_bytes(data, mode="rule")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if args:
        paths = args
    else:
        paths = []
        for pat in ("*.pdf", "*.xlsx", "*.blw", "*.html"):
            paths.extend(glob.glob(os.path.join(FIXTURES, pat)))
        paths = sorted(paths)
    if not paths:
        print("No PDFs found. Put samples in tools/fixtures/ or pass a path.")
        sys.exit(1)

    os.makedirs(BASELINE, exist_ok=True)
    any_diff = False

    for path in paths:
        name = os.path.basename(path)
        print("=" * 70)
        print(name)
        print("=" * 70)
        try:
            result = run_one(path)
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}")
            continue

        summary = summarize(result)
        print(json.dumps(summary, ensure_ascii=False, indent=2))

        base_path = os.path.join(BASELINE, name + ".json")
        if "--diff" in flags and os.path.exists(base_path):
            old = json.load(open(base_path, encoding="utf-8"))
            if old != summary:
                any_diff = True
                print("  ** CHANGED vs baseline **")
                for k in summary:
                    if old.get(k) != summary.get(k):
                        print(f"    {k}: {old.get(k)!r}  ->  {summary.get(k)!r}")
            else:
                print("  (unchanged vs baseline)")

        if "--json" in flags:
            json.dump(summary, open(base_path, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=2)
            # full result too, for deep inspection
            json.dump(result, open(os.path.join(BASELINE, name + ".full.json"), "w",
                                   encoding="utf-8"), ensure_ascii=False, indent=2, default=str)

    if "--json" in flags:
        print(f"\nBaseline saved to {BASELINE}/")
    if "--diff" in flags:
        print("\nDiff complete." + ("  Changes detected." if any_diff else "  No changes."))


if __name__ == "__main__":
    main()
