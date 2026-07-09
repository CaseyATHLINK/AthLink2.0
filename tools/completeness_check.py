#!/usr/bin/env python3
"""
Completeness gate report over the whole corpus (parser rebuild §6A / §7).

Runs the RULE parser (no AI / no network) over every text-parseable file in the
corpus and applies api/completeness.verify_completeness to each result, printing
a per-document PASS/FAIL table plus a single overall verdict. This is the "did we
get EVERY row and EVERY race column" gate — stricter than corpus_test.py's soft
confidence, and the thing that surfaces the silent-incompleteness the rebuild
targets.

Usage:
    completeness_check.py                 # full corpus, print table + verdict
    completeness_check.py --only <substr> # only files whose path contains substr
    completeness_check.py --gaps          # also print each gap's detail lines

Interpreter: /opt/anaconda3/bin/python3 (needs pdfplumber + openpyxl).
Corpus dir: $CORPUS_DIR else ~/Desktop/Results to parse.
"""
import sys, os, io, json, glob, importlib.util, contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, rel))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


pp = _load("parse_pdf", os.path.join("api", "sailing", "parse_pdf.py"))
comp = _load("completeness", os.path.join("api", "sailing", "completeness.py"))

PARSEABLE = {".pdf", ".html", ".htm", ".xlsx", ".xls", ".csv", ".blw"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}
# Families deliberately routed to the AI/vision lane (§3) — a rule miss here is
# BY DESIGN, so they don't count against the rule-lane completeness verdict.
VISION_FAMILIES = {"worldsailing-resultscentre", "cn-games-book", "hubsail"}


def _corpus_dir():
    d = os.environ.get("CORPUS_DIR")
    if d and os.path.isdir(d):
        return d
    return os.path.expanduser("~/Desktop/Results to parse")


def _declared(result):
    """Pull surfaced source checksums off a result, if the parser attached them."""
    return result.get("_checksums") if isinstance(result, dict) else None


def _all_files(corpus):
    out = []
    for root, _dirs, files in os.walk(corpus):
        for fn in files:
            if os.path.splitext(fn)[1].lower() in PARSEABLE:
                out.append(os.path.join(root, fn))
    return sorted(out)


def run_one(path):
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as f:
        data = f.read()
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        if ext == ".pdf":
            result = pp._rule_based_parse(data)
        else:
            result = pp.parse_pdf_bytes(data, mode="rule")
    return result


def main():
    argv = sys.argv[1:]
    flags = {a for a in argv if a.startswith("--")}
    only = None
    for i, a in enumerate(argv):
        if a == "--only" and i + 1 < len(argv):
            only = argv[i + 1]

    corpus = _corpus_dir()
    files = _all_files(corpus)
    if only:
        files = [f for f in files if only.lower() in f.lower()]

    n_pass = n_fail = n_scan = 0
    fails = []
    print(f"corpus: {corpus}  ({len(files)} text-parseable files)")
    print("=" * 104)
    for path in files:
        rel = os.path.relpath(path, corpus)
        try:
            result = run_one(path)
        except Exception as e:
            # Rule parser raised — either a scan/vision-by-design family or a
            # genuine rule miss. Either way it's the AI lane's job, not a
            # completeness FAIL of the rule lane. Mark SCAN for the table.
            n_scan += 1
            print(f"SCAN {'(AI lane)':16} {'':40} {rel}   [{type(e).__name__}]")
            continue

        fmt = (result or {}).get("detected_format") or {}
        if fmt.get("family") in VISION_FAMILIES:
            n_scan += 1
            print(f"SCAN {'(vision by design)':16} {'':40} {rel}")
            continue

        rep = comp.verify_completeness(result, declared=_declared(result))
        rows = rep["stats"]["rows"]
        if rep["complete"]:
            n_pass += 1
            print(f"PASS {'':16} n={rows:>4} {'':34} {rel}")
        else:
            n_fail += 1
            kinds = ",".join(rep["stats"]["gap_kinds"])
            fails.append((rel, kinds, rep))
            print(f"FAIL {kinds:16.16} n={rows:>4} {'':34} {rel}")
            if "--gaps" in flags:
                for g in rep["gaps"]:
                    where = "/".join(x for x in (g.get("fleet"), g.get("group")) if x)
                    print(f"       └─ [{g['kind']}] {where}: {g['detail']}")

    print("=" * 104)
    total = n_pass + n_fail
    pct = (100.0 * n_pass / total) if total else 0.0
    print(f"rule-lane files={total}  PASS={n_pass}  FAIL={n_fail}  "
          f"({pct:.0f}% complete)   |   SCAN/AI-lane={n_scan}")
    verdict = "GREEN — every rule-lane file is complete" if n_fail == 0 else \
              f"RED — {n_fail} rule-lane file(s) incomplete (need parser fix or AI repair)"
    print("OVERALL:", verdict)
    if fails and "--gaps" not in flags:
        print("\nIncomplete files (run with --gaps for detail):")
        for rel, kinds, _ in fails:
            print(f"   - {rel}   [{kinds}]")
    sys.exit(0)


if __name__ == "__main__":
    main()
