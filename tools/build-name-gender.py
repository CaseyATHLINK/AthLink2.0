#!/usr/bin/env python3
"""Regenerate sports/sailing/src/data/name-gender.js — the per-person gender
map used to fill a gender badge on imports whose source stated no gender.

Rule (deliberately does NOT infer gender from the boat class):
  1. If any results doc STATED a gender for the person, use the majority of those
     (the sailor's real registration — authoritative, and correct for the
     East-Asian names a name dataset gets wrong).
  2. Otherwise infer from the name via the gender-guesser dataset (confident
     male/female, else mostly_*). Ambiguous/unknown names get no entry (no badge).

Keys are canonName (util/name.js): lowercase, strip accents, transliterate
ø/ł/etc., non-alnum→space, tokens sorted+joined.

Input: a JSON array [{"name","m","f"}] — the per-person stated M/F counts, e.g.
  supabase SQL:
    with ppl as (
      select helm_name nm, gender from entries where helm_name<>''
      union all select crew_name, gender from entries where crew_name<>'')
    select btrim(nm) name,
           count(*) filter (where gender='M') m,
           count(*) filter (where gender='F') f
    from ppl group by btrim(nm);
Usage: python3 tools/build-name-gender.py people.json
Deps:  pip install gender-guesser
"""
import re, json, sys, unicodedata
import gender_guesser.detector as gd

det = gd.Detector(case_sensitive=False)
REPL = [("ø","o"),("ł","l"),("đ","d"),("ß","ss"),("æ","ae"),("œ","oe"),("þ","th")]

def canon(nm):
    s = (nm or "").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    for a, b in REPL: s = s.replace(a, b)
    s = s.replace("-", " ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return " ".join(sorted(s.split()))

def name_guess(nm):
    toks = [t for t in re.split(r"\s+", nm.strip()) if re.match(r"^[A-Za-zÀ-ÿ'\-]+$", t or "")]
    for t in toks:
        g = det.get_gender(t)
        if g == "male": return "M"
        if g == "female": return "F"
    for t in toks:
        g = det.get_gender(t)
        if g == "mostly_male": return "M"
        if g == "mostly_female": return "F"
    return None

# Boats a results source mislabelled at the boat level (all-women crews marked M).
FIX_F = {"paula barcelo","maria cantero","lara granier","amelie riou","egger-buck victoria",
         "schneider sophie","emilie bouchet","julie le bel","rosa donner","marion lafrance-berger"}
# Curated per-person corrections for unisex/foreign names a name dataset gets wrong
# AND that have no source-stated gender to anchor them (confident cases only).
OVERRIDE_F = ["Paris Henken","Sandra Jankowiak","Vic Liksanova","Karlinde van Arendonk","Morven Wood",
              "Merle Louwinger","Quinn Auricht","Selma Hård"]
OVERRIDE_M = ["Nevin Snow","Tal Sade","Simone Ferrarese","Michele Semeraro","Gabriele Antoniazzi",
              "Gabriele Marinoni","Gabriele Villa","Noe Delpech","Joonoh Jin","Chae Bongjin","Keun Soo Kim",
              "Kim Kyoungduk","Kyoungduk Kim","Kim Yeong Woo","An Sunjin","Jun Seong An","Won Bin Choi",
              "Görkem Arda Koçak","Kaya Osman Uner","Soma Kis-Szölgyémi","Tóth Soma","Joan Mas Mas",
              "Roni Oszkar Szabo","Enea Luatti","Thommie Grit"]

def main(path):
    rows = json.load(open(path))
    out = {}
    for r in rows:
        nm, m, f = r["name"], int(r["m"]), int(r["f"])
        stated = "F" if nm.strip().lower() in FIX_F else ("M" if m > f else ("F" if f > m else None))
        g = stated or name_guess(nm)
        if not g: continue
        k = canon(nm)
        if not k: continue
        if k in out and stated is None and out[k] != g: continue  # don't clobber a stated value
        out[k] = g
    for n in OVERRIDE_F: out[canon(n)] = "F"   # overrides win
    for n in OVERRIDE_M: out[canon(n)] = "M"
    dest = "sports/sailing/src/data/name-gender.js"
    json.dump(out, open(dest, "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(f"wrote {dest}: {len(out)} people")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "people.json")
