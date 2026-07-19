#!/usr/bin/env python3
"""Local harness for the golf rule parser. Run with /opt/anaconda3/bin/python3.
No network, no AI — pure rule logic. Asserts against inline expected values;
exits non-zero on the first mismatch so it works as a pre-commit gate."""
import os, io, importlib.util, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
FIXTURES = os.path.join(HERE, "golf_fixtures")

spec = importlib.util.spec_from_file_location(
    "golf_parse_pdf", os.path.join(REPO, "api", "golf", "parse_pdf.py"))
gp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gp)

_failures = []
def check(name, got, want):
    if got != want:
        _failures.append(f"{name}: got {got!r}, want {want!r}")
    else:
        print(f"  ok  {name}")

def test_detect_format_input_types():
    check("xlsx sniff", gp.detect_format(b'PK\x03\x04rest', '')[1], "xlsx")
    check("pdf sniff",  gp.detect_format(b'%PDF-1.4', '')[1], "pdf-text")
    check("csv sniff",  gp.detect_format(b'Pos,Player,R1,Total\n1,A,70,70', 'pos,player')[1], "csv")

def test_interpret_grid_basic():
    rows = [
        ["Pos", "Player", "R1", "R2", "R3", "Total"],
        ["1",   "Amy Chan",   "70", "71", "69", "210"],
        ["T2",  "Ben Wong",   "72", "70", "70", "212"],
        ["T2",  "Cara Diaz",  "71", "71", "70", "212"],
    ]
    r = gp.interpret_golf_grid(rows, "Spring Open  Par 72")
    check("grid n_entries", len(r["entries"]), 3)
    check("grid rounds", r["rounds"], 3)
    check("grid scoring_format", r["scoring_format"], "stroke")
    check("grid course_par", r["course_par"], 72)
    e0 = r["entries"][0]
    check("grid rank0", e0["pdf_rank"], 1)
    check("grid net0", e0["pdf_net"], 210)
    check("grid races0", e0["races"], [70, 71, 69])
    check("grid codes0", e0["race_codes"], [None, None, None])
    check("grid helm0", e0["helm"], "Amy Chan")
    check("grid tie rank", r["entries"][1]["pdf_rank"], 2)   # 'T2' -> 2, ground truth

def test_interpret_grid_missed_cut():
    rows = [
        ["Pos", "Player", "Rd1", "Rd2", "Rd3", "Rd4", "Total"],
        ["1",   "Amy Chan", "70", "71", "69", "68", "278"],
        ["",    "Ben Wong", "80", "82", "MC", "",   "162"],
    ]
    r = gp.interpret_golf_grid(rows, "")
    check("cut rounds", r["rounds"], 4)
    ben = r["entries"][1]
    # races[] and race_codes[] MUST stay parallel (same length). The MC marker is
    # stored IN races[] (sailing-consistent: races may hold a status string, as it
    # holds "DNF"/"DNS" in sailing); the code lane stays None. The trailing blank
    # round (post-cut, not played) is trimmed from BOTH arrays.
    check("cut arrays parallel", len(ben["races"]), len(ben["race_codes"]))
    check("cut races len", len(ben["races"]), 3)             # R1, R2, MC — R4 (blank, post-cut) trimmed
    check("cut marker in races", ben["races"][2], "MC")
    check("cut codes clean", ben["race_codes"], [None, None, None])

if __name__ == "__main__":
    for fn in list(globals()):
        if fn.startswith("test_"):
            print(f"# {fn}"); globals()[fn]()
    if _failures:
        print("\nFAIL:"); [print(" -", f) for f in _failures]; sys.exit(1)
    print("\nALL PASS")
