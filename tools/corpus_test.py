#!/usr/bin/env python3
"""
Whole-corpus regression harness for the AthLink parser (parser v3, §2a).

Runs api/parse_pdf.py's RULE parser over EVERY file in the "Results to parse"
corpus (plus the three extracted HKSF email zips) with NO network / NO AI, and
records per file: detected family, input_type, entry count, per-fleet counts,
confidence, wall-time, and correctness SMELLS:
  - DUPRANK   duplicate pdf_rank inside a single fleet where the tied rows have
              DIFFERENT net scores (a genuine tie shares a rank legitimately and
              is NOT flagged; a duplicated row / collapsed multi-fleet is).
  - RAGGED    rows in one fleet reporting different race-column counts.
  - NOSAIL    >50% of rows missing a real sail number.
  - BLANKNAME any row with no helm/name.
  - NAMEPOLL  event name polluted by a print header / timestamp.

Emits a diffable JSON snapshot per file so "no regressions" is provable: seed a
baseline with --update, then --diff after each change. The snapshot is the
contract — every previously-correct file must stay correct.

Usage:
    corpus_test.py                      # run, print scoreboard
    corpus_test.py --update             # (re)write the baseline snapshots
    corpus_test.py --diff               # compare to baseline, show changes
    corpus_test.py --only <substr>      # run only files whose path contains substr
    corpus_test.py --full <substr>      # dump the full parse result for matching files

Corpus dir: $CORPUS_DIR, else the extracted scratch corpus, else
~/Desktop/Results to parse (zips must be pre-extracted for the Email 7/8/9 set).
Interpreter: /opt/anaconda3/bin/python3 (pdfplumber + openpyxl).
"""
import sys, os, io, json, glob, time, importlib.util, contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SNAP = os.path.join(HERE, "corpus_baseline")

_SCRATCH = "/private/tmp/claude-501/-Users-casey-athlink/8fcf8080-6abb-4f98-8acb-65226128d808/scratchpad/corpus"

def _corpus_dir():
    d = os.environ.get("CORPUS_DIR")
    if d and os.path.isdir(d):
        return d
    if os.path.isdir(_SCRATCH):
        return _SCRATCH
    return os.path.expanduser("~/Desktop/Results to parse")

CORPUS = _corpus_dir()

# Import api/parse_pdf.py as a module without needing it on the path.
spec = importlib.util.spec_from_file_location(
    "parse_pdf", os.path.join(REPO, "api", "parse_pdf.py"))
pp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pp)

# Only these extensions have a rule path; images/jpeg/png/webp/heic are vision.
PARSEABLE = {".pdf", ".html", ".htm", ".xlsx", ".xls", ".csv", ".blw"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}

_SAIL_PLACEHOLDER = {"", "—", "-", "–", "n/a", "n/a.", "na"}


def _fleets_of(result):
    """Return [(fleet_label, entries[])] for single- and multi-fleet shapes."""
    if not isinstance(result, dict):
        return []
    if result.get("multi") and result.get("fleets"):
        return [(f.get("division") or f.get("fleet") or f"fleet{i}",
                 f.get("entries") or []) for i, f in enumerate(result["fleets"])]
    return [("", result.get("entries") or result.get("competitors") or [])]


def _rank_of(e):
    r = e.get("pdf_rank")
    return r if isinstance(r, int) else None


def _net_of(e):
    return e.get("pdf_net")


def _race_count(e):
    r = e.get("races")
    return len(r) if isinstance(r, list) else 0


def _smells(result):
    """Compute per-fleet correctness smells. Returns a dict summary."""
    fleets = _fleets_of(result)
    total = sum(len(es) for _, es in fleets)
    dup_suspicious = 0      # dup ranks with differing net (real bug signal)
    dup_tie = 0            # dup ranks that look like legit ties (same net)
    ragged = []            # list of (fleet, min, max)
    nosail_frac_bad = 0    # fleets with >50% missing sail
    blanknames = 0
    for label, es in fleets:
        if not es:
            continue
        # dup ranks within THIS fleet
        by_rank = {}
        for e in es:
            r = _rank_of(e)
            if r is None:
                continue
            by_rank.setdefault(r, []).append(e)
        for r, group in by_rank.items():
            if len(group) < 2:
                continue
            nets = {(_net_of(e) if _net_of(e) is not None else "∅") for e in group}
            if len(nets) == 1:
                dup_tie += len(group) - 1
            else:
                dup_suspicious += len(group) - 1
        # ragged race counts
        rc = [_race_count(e) for e in es if _race_count(e) > 0]
        if rc and min(rc) != max(rc):
            ragged.append((label or "·", min(rc), max(rc)))
        # sail coverage
        have_sail = sum(1 for e in es
                        if str(e.get("sail") or "").strip().lower() not in _SAIL_PLACEHOLDER)
        if len(es) >= 3 and have_sail / len(es) < 0.5:
            nosail_frac_bad += 1
        # blank names
        blanknames += sum(1 for e in es
                          if not str(e.get("helm") or e.get("name") or "").strip())
    name = result.get("name") or result.get("event") or result.get("event_name") or ""
    namepoll = False
    if getattr(pp, "score_parse", None):
        try:
            from validate import _looks_like_junk_name  # type: ignore
            namepoll = _looks_like_junk_name(name)
        except Exception:
            namepoll = False
    return {
        "n": total,
        "n_fleets": len(fleets),
        "fleet_counts": [len(es) for _, es in fleets],
        "dup_suspicious": dup_suspicious,
        "dup_tie": dup_tie,
        "ragged": ragged,
        "nosail_fleets": nosail_frac_bad,
        "blanknames": blanknames,
        "namepoll": namepoll,
    }


def _first_last_rows(result):
    """First-3 + last row across the flattened entries, for hand-verification."""
    rows = []
    for _, es in _fleets_of(result):
        rows.extend(es)
    keys = ("pdf_rank", "sail", "helm", "crew", "nat", "pdf_net")
    def pick(e):
        return {k: e.get(k) for k in keys if k in e}
    sample = [pick(e) for e in rows[:3]]
    if len(rows) > 3:
        sample.append({"__last__": True, **pick(rows[-1])})
    return sample


def _pdf_text_len(data):
    """Chars of extractable text in a PDF — ~0 means a scan/photo (vision-only)."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            n = 0
            for pg in pdf.pages[:4]:
                n += len((pg.extract_text() or ""))
            return n
    except Exception:
        return -1


def run_one(path):
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as f:
        data = f.read()
    t0 = time.time()
    err = None
    result = None
    # Rule mode only — deterministic, no network, no AI.
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            if ext == ".pdf":
                result = pp._rule_based_parse(data)
            else:
                result = pp.parse_pdf_bytes(data, mode="rule")
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    dt = round(time.time() - t0, 2)

    # Classify an error as SCAN (zero text layer → vision by design) vs a
    # rule-fixable text error. Only rule-fixable errors count against "green".
    is_scan = False
    if err is not None and ext == ".pdf":
        is_scan = 0 <= _pdf_text_len(data) < 120

    fmt = (result or {}).get("detected_format") or {}
    verdict = None
    if result is not None and getattr(pp, "score_parse", None):
        try:
            verdict = pp.score_parse(result)
        except Exception:
            verdict = None
    smells = _smells(result) if result is not None else {}
    return {
        "error": err,
        "is_scan": is_scan,
        "family": fmt.get("family"),
        "input_type": fmt.get("input_type"),
        "confidence": (verdict or {}).get("confidence"),
        "gate_ok": (verdict or {}).get("ok"),
        "wall_s": dt,
        "smells": smells,
        "sample": _first_last_rows(result) if result is not None else [],
        "event": (result or {}).get("name") or (result or {}).get("event"),
        "date": (result or {}).get("date"),
        "detected_class": (result or {}).get("detected_class"),
        "detected_host": (result or {}).get("detected_host"),
    }


def _smell_tags(s):
    tags = []
    if s.get("dup_suspicious"):
        tags.append(f"DUP{s['dup_suspicious']}")
    if s.get("ragged"):
        rr = s["ragged"][0]
        tags.append(f"RAGGED{rr[1]}-{rr[2]}" + ("+" if len(s["ragged"]) > 1 else ""))
    if s.get("nosail_fleets"):
        tags.append(f"NOSAIL{s['nosail_fleets']}f")
    if s.get("blanknames"):
        tags.append(f"BLANK{s['blanknames']}")
    if s.get("namepoll"):
        tags.append("NAMEPOLL")
    return " ".join(tags)


def _all_files():
    out = []
    for root, _dirs, files in os.walk(CORPUS):
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext in PARSEABLE or ext in IMAGE_EXT:
                out.append(os.path.join(root, fn))
    return sorted(out)


def main():
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    only = None
    full = None
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a == "--only" and i + 1 < len(argv):
            only = argv[i + 1]
        if a == "--full" and i + 1 < len(argv):
            full = argv[i + 1]

    os.makedirs(SNAP, exist_ok=True)
    files = _all_files()
    if only:
        files = [f for f in files if only.lower() in f.lower()]
    if full:
        files = [f for f in files if full.lower() in f.lower()]

    n_ok = n_err = n_img = n_scan = 0
    rule_fixable = []
    changed = 0
    print(f"corpus: {CORPUS}  ({len(files)} files)")
    print("=" * 100)
    for path in files:
        rel = os.path.relpath(path, CORPUS)
        ext = os.path.splitext(path)[1].lower()
        if ext in IMAGE_EXT:
            n_img += 1
            print(f"IMG  {'':22}                              {rel}")
            continue
        rec = run_one(path)
        if full:
            with open(path, "rb") as f:
                data = f.read()
            try:
                res = (pp._rule_based_parse(data) if ext == ".pdf"
                       else pp.parse_pdf_bytes(data, mode="rule"))
                print(json.dumps(res, ensure_ascii=False, indent=2, default=str)[:6000])
            except Exception as e:
                print(f"  ERROR: {e}")
            continue

        s = rec["smells"]
        if rec["error"]:
            n_err += 1
            detail = rec["error"][:60]
            if rec.get("is_scan"):
                n_scan += 1
                print(f"SCAN {'(vision by design)':22} {'':30} {rel}")
            else:
                rule_fixable.append(rel)
                print(f"ERR* {'(RULE-FIXABLE)':22} {'':30} {rel}")
                print(f"       └─ {detail}")
        else:
            n_ok += 1
            fam = (rec["family"] or "?")[:22]
            cf = rec["confidence"]
            cfs = f"cf={cf}" if cf is not None else "cf=None"
            slow = f"SLOW{rec['wall_s']}s " if rec["wall_s"] >= 2.0 else ""
            tags = _smell_tags(s)
            print(f"OK   {fam:22} n={s.get('n',0):>4} {cfs:8} {slow}{tags:28} {rel}")

        # snapshot compare / write
        snap_path = os.path.join(SNAP, rel.replace(os.sep, "__") + ".json")
        if "--update" in flags:
            os.makedirs(os.path.dirname(snap_path) or SNAP, exist_ok=True)
            json.dump(rec, open(snap_path, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=2, default=str)
        elif "--diff" in flags and os.path.exists(snap_path):
            old = json.load(open(snap_path, encoding="utf-8"))
            # Compare on the stable fields (ignore wall_s jitter).
            def _norm(r):
                r = dict(r); r.pop("wall_s", None); return r
            if json.dumps(_norm(old), sort_keys=True, default=str) != \
               json.dumps(_norm(rec), sort_keys=True, default=str):
                changed += 1
                print("     ** CHANGED vs baseline **")
                for k in ("error", "family", "confidence", "gate_ok", "event",
                          "detected_class", "smells"):
                    if json.dumps(old.get(k), default=str) != json.dumps(rec.get(k), default=str):
                        print(f"       {k}: {old.get(k)!r} -> {rec.get(k)!r}")

    print("=" * 100)
    print(f"files={len(files)}  OK={n_ok}  ERR={n_err} (scan/vision={n_scan}, "
          f"RULE-FIXABLE={len(rule_fixable)})  IMG(vision)={n_img}")
    if rule_fixable:
        print("RULE-FIXABLE errors (must reach 0 for green):")
        for r in rule_fixable:
            print("   -", r)
    else:
        print("✅ 0 rule-fixable errors — every text/HTML/xlsx/blw file parses by rule.")
    if "--diff" in flags:
        print(f"diff: {'CHANGES in '+str(changed)+' files' if changed else 'no changes'}")
    if "--update" in flags:
        print(f"baseline written to {SNAP}/")


if __name__ == "__main__":
    main()
