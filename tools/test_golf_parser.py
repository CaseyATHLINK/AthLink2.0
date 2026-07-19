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

if __name__ == "__main__":
    for fn in list(globals()):
        if fn.startswith("test_"):
            print(f"# {fn}"); globals()[fn]()
    if _failures:
        print("\nFAIL:"); [print(" -", f) for f in _failures]; sys.exit(1)
    print("\nALL PASS")
