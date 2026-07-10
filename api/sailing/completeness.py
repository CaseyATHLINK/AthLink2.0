"""
Deterministic completeness gate for AthLink parse results — parser rebuild §6A.

Zero tokens, zero network, no third-party deps. Answers ONE question with a hard
yes/no: did we transcribe EVERY athlete row and EVERY race column, with no empty
required cells and self-consistent ranks?

Why this exists (the crux of the rebuild):
    `validate.score_parse` is a SOFT 0..1 confidence that decides "rule vs AI".
    It docks points for missing data but still PASSES parses that are missing
    cells — e.g. manage2sail `n=60 cf=1.0 RAGGED14-15` (some rows short a race
    column) or `OPTI HKRW 2017 n=104 cf=0.8 DUP52` (two fleets collapsed). Those
    flow straight to the DB as "success" while missing details. For a database
    that must be EXACT, "parsed but missing 5 sail numbers and race 7" is a
    FAILURE, not a pass. This module enforces that as hard as "did it parse?".

Design principles (do not violate — they keep it from over-firing):
  * HARD-FAIL only on POSITIVE evidence of a gap. When there is no checksum and
    no ragged/empty evidence, we CANNOT prove incompleteness, so we PASS. This is
    what keeps the AI lane the floor, not the default (§3).
  * Check race-column completeness PER HOMOGENEOUS GROUP (division / row class),
    never on a flattened multi-fleet list. A Gold fleet sailing 15 races and a
    Silver fleet sailing 14 is LEGITIMATE raggedness across groups; only rows
    that disagree WITHIN one scoring group are missing cells (every competitor in
    a scoring group has a score — DNC if absent — for every race in that group).
  * Some official formats genuinely omit a column (bornan/NOC has no sail number;
    overall-results prints no per-race breakdown). Those are formats, not gaps —
    mirror the exemptions `validate.py` already encodes.
  * Every gap is reported with the exact fleet / group / rows / race indices so a
    repair pass can re-read ONLY the gap (§6A: "emit exactly which rows/columns
    are missing"), never the whole document.

Public API:
    verify_completeness(result, *, declared=None) -> dict
        {complete: bool, gaps: [ {...} ], stats: {...}, summary: str}

`declared` (optional) carries source checksums the parser surfaced from the
document text — see api/parse_pdf.py's `_declared_checksums`:
    {"entries": int|None,                 # overall stated entry count
     "fleets": {fleet_label: {"entries": int|None, "sailed": int|None}}}
When absent, the entry-count and race-column checksums are simply skipped (we
never invent a gap we can't prove); the ragged/empty/rank checks still run.
"""
from __future__ import annotations  # PEP 604 (`dict | None`) safe on 3.7+ runtimes
import re

# A placeholder dash is NOT a real sail number — the parser emits it when the
# sail column was never found. Keep this identical to validate.py so the two
# gates agree on "has a real sail".
_SAIL_PLACEHOLDER = {"", "—", "-", "–", "n/a", "n/a.", "na", "none"}


# ---------------------------------------------------------------------------
# Shape helpers — tolerate single-fleet and multi-fleet result dicts.
# ---------------------------------------------------------------------------
def _fleets(result: dict):
    """Yield (fleet_label, entries[]) for single- and multi-fleet shapes."""
    if not isinstance(result, dict):
        return []
    if result.get("multi") and result.get("fleets"):
        out = []
        for i, f in enumerate(result["fleets"]):
            label = (f.get("name") or f.get("division") or f.get("fleet")
                     or f"fleet{i+1}")
            out.append((str(label), f.get("entries") or []))
        return out
    return [("", result.get("entries") or result.get("competitors") or [])]


def _group_key(e: dict) -> str:
    """
    Partition a fleet's rows into homogeneous scoring groups. Within a group
    every competitor sails the same race set; across groups (Gold/Silver split,
    mixed-class handicap event) race counts legitimately differ.
    """
    return (str(e.get("div") or "").strip().lower()
            or str(e.get("row_class") or "").strip().lower()
            or str(e.get("category") or "").strip().lower())


def _groups(entries: list):
    """Yield (group_label, rows[]) preserving first-seen order."""
    order, buckets = [], {}
    for e in entries:
        k = _group_key(e)
        if k not in buckets:
            buckets[k] = []
            order.append(k)
    for e in entries:
        buckets[_group_key(e)].append(e)
    return [(k, buckets[k]) for k in order]


def _race_width(e: dict) -> int:
    r = e.get("races")
    return len(r) if isinstance(r, list) else 0


def _race_sum(e: dict):
    """Sum of a row's numeric race scores (discards INCLUDED — matches the gross
    'Total' column). Returns None if any race cell is a bare non-numeric code, so
    the row can't be checksummed rather than being summed wrongly."""
    rs = e.get("races")
    if not isinstance(rs, list) or not rs:
        return None
    tot = 0.0
    for v in rs:
        if isinstance(v, (int, float)):
            tot += v
        else:
            m = re.match(r"^\(?(-?\d+(?:\.\d+)?)\)?$", str(v).strip())
            if not m:
                return None
            tot += float(m.group(1))
    return tot


def _row_id(e: dict) -> str:
    """A stable, human-readable identifier for a row, for gap reports."""
    sail = str(e.get("sail") or "").strip()
    helm = str(e.get("helm") or e.get("name") or "").strip()
    rank = e.get("pdf_rank")
    bits = []
    if isinstance(rank, int):
        bits.append(f"#{rank}")
    if sail and sail not in _SAIL_PLACEHOLDER:
        bits.append(sail)
    if helm:
        bits.append(helm)
    return " ".join(bits) or "(unidentified row)"


def _has_real_sail(e: dict) -> bool:
    return str(e.get("sail") or "").strip().lower() not in _SAIL_PLACEHOLDER


# ---------------------------------------------------------------------------
# The gate.
# ---------------------------------------------------------------------------
def verify_completeness(result: dict, *, declared: dict | None = None) -> dict:
    """
    Return {complete, gaps, stats, summary}.

    complete == (no gaps found). A gap is POSITIVE evidence that a row, race
    column, or required cell that exists in the source was not transcribed (or a
    rank sequence that cannot be right). Absence of evidence is not a gap.
    """
    declared = declared or {}
    fleets = _fleets(result)
    gaps: list[dict] = []

    total_rows = sum(len(es) for _, es in fleets)
    if total_rows == 0:
        return {
            "complete": False,
            "gaps": [{"fleet": "", "group": "", "kind": "no_entries",
                      "detail": "parser returned zero rows", "rows": [], "races": []}],
            "stats": {"rows": 0, "fleets": 0},
            "summary": "FAIL: no entries parsed",
        }

    dcl_fleets = (declared.get("fleets") or {}) if isinstance(declared, dict) else {}

    for flabel, entries in fleets:
        if not entries:
            gaps.append({"fleet": flabel, "group": "", "kind": "empty_fleet",
                         "detail": "fleet has no rows", "rows": [], "races": []})
            continue

        fdcl = dcl_fleets.get(flabel) or dcl_fleets.get(flabel.strip()) or {}

        # -- 1. Row-count checksum (Entries: N) -----------------------------
        # Only meaningful when the fleet is one scoring block. For a flattened
        # single-fleet result that actually holds several groups, compare the
        # overall declared count to the whole result below instead.
        dcl_entries = fdcl.get("entries")
        if isinstance(dcl_entries, int) and dcl_entries > 0:
            if len(entries) < dcl_entries:
                gaps.append({
                    "fleet": flabel, "group": "", "kind": "missing_rows",
                    "detail": f"parsed {len(entries)} of {dcl_entries} stated entries "
                              f"({dcl_entries - len(entries)} rows missing)",
                    "rows": [], "races": [],
                    "missing_count": dcl_entries - len(entries),
                })
            elif len(entries) > dcl_entries:
                gaps.append({
                    "fleet": flabel, "group": "", "kind": "extra_rows",
                    "detail": f"parsed {len(entries)} rows but only {dcl_entries} "
                              f"stated (likely duplicated / collapsed fleets)",
                    "rows": [], "races": [],
                })

        # -- 2. Per-group race-column completeness --------------------------
        # Race width is NOT expected to be uniform across a fleet: after a
        # Gold/Silver/Bronze split the top band sails more races than the ones
        # below it, so a correct parse of a split fleet has widths that form a
        # NON-INCREASING step function of finishing rank (better rank ⇒ ≥ races).
        # A GENUINE dropped score cell breaks that monotonicity: a shorter row
        # sitting above (better-ranked than) a longer one. We flag exactly those
        # inversions — never the legitimate step-downs of a split. Uniform
        # whole-column loss (every row short the same race) can't be seen this
        # way, so the 'Sailed: N' checksum below is the guard for that.
        for glabel, rows in _groups(entries):
            widths = [_race_width(e) for e in rows]
            nonzero = [w for w in widths if w > 0]
            # A group where NO row has any race scores = the format prints no
            # per-race breakdown (overall-results). Not a per-race gap.
            if not nonzero:
                continue
            full = max(nonzero)  # the top band's race count

            # The monotonic-by-rank argument only holds if we actually know the
            # finishing order. If most of the group lacks a real rank, we can't
            # order it, so we can't distinguish a legit band step from a drop —
            # skip the width check for this group (the checksum still guards it).
            ranked = sum(1 for e in rows if isinstance(e.get("pdf_rank"), int))
            if ranked < max(2, 0.6 * len(rows)):
                continue

            # PREFERRED signal: the per-row Total checksum. sum(races) == Total
            # proves a row has every race cell — independent of how many races the
            # row's fleet band sailed. This is what correctly PASSES a Gold/Silver
            # finals split, where the Gold and Silver series are independent so
            # Silver can sail MORE finals than a better-ranked Gold boat (real
            # manage2sail 49er championships do exactly this — a monotonic-by-rank
            # width comparison false-flags every one).
            n_tot = sum(1 for e in rows if isinstance(e.get("pdf_total"), (int, float)))
            if n_tot >= max(2, 0.6 * len(rows)):
                short = []
                for e in rows:
                    tot = e.get("pdf_total")
                    rs = _race_sum(e)
                    if not isinstance(tot, (int, float)) or rs is None:
                        continue          # can't checksum this row — don't guess
                    # Carry-forward series points (manage2sail Q-SP / F-SP) count
                    # towards the printed Total but are not a race score, so add
                    # them back before comparing or every carried boat false-flags.
                    carry = e.get("_carry")
                    rs_eff = rs + carry if isinstance(carry, (int, float)) else rs
                    # A shortfall vs the printed Total means a dropped race cell,
                    # UNLESS this row already has the group's max width: a
                    # medal-race boat's medal score is weighted (200%), so its
                    # face-value sum is legitimately below the printed Total.
                    if rs_eff < tot - 0.5 and _race_width(e) < full:
                        short.append(e)
                if short:
                    gaps.append({
                        "fleet": flabel, "group": glabel, "kind": "missing_cells",
                        "detail": f"{len(short)} row(s) whose race scores sum to less "
                                  f"than their printed Total (dropped score cells)",
                        "rows": [_row_id(e) for e in short[:40]],
                        "races": [],
                    })
            else:
                # No Total column to checksum against — fall back to the
                # monotonic-by-rank width model. Order by finishing rank so
                # "above" means "better result", the direction along which width
                # must not increase within one scoring group.
                order = sorted(range(len(rows)),
                               key=lambda i: (rows[i].get("pdf_rank")
                                              if isinstance(rows[i].get("pdf_rank"), int)
                                              else 10**9, i))
                ow = [widths[i] for i in order]
                suffix_max = [0] * (len(ow) + 1)
                for k in range(len(ow) - 1, -1, -1):
                    below = ow[k + 1] if k + 1 < len(ow) else 0
                    suffix_max[k] = max(suffix_max[k + 1], below)
                short_idx = [order[k] for k, w in enumerate(ow) if w < suffix_max[k]]
                short = [rows[i] for i in short_idx]
                if short:
                    gaps.append({
                        "fleet": flabel, "group": glabel, "kind": "missing_cells",
                        "detail": f"{len(short)} row(s) have fewer race columns than a "
                                  f"worse-ranked row in the same group (dropped score "
                                  f"cells; group top band sails {full})",
                        "rows": [_row_id(e) for e in short[:40]],
                        "races": [],
                    })

            # Declared race count for the fleet (Sailed: N) catches a whole
            # column dropped uniformly (invisible to the monotonicity check).
            # Only meaningful for a single-group fleet — a split fleet's declared
            # count is per-band and ambiguous when bands aren't separated. Accept
            # it either per-fleet (declared.fleets[label].sailed) or, for a lone
            # single-fleet result, as the top-level declared.sailed.
            dcl_sailed = fdcl.get("sailed")
            if dcl_sailed is None and len(fleets) == 1 and isinstance(declared, dict):
                dcl_sailed = declared.get("sailed")
            single_group = len(_groups(entries)) == 1
            if (single_group and isinstance(dcl_sailed, int) and dcl_sailed > 0
                    and full < dcl_sailed):
                gaps.append({
                    "fleet": flabel, "group": glabel, "kind": "missing_race_column",
                    "detail": f"parsed {full} race columns but 'Sailed: {dcl_sailed}' "
                              f"stated ({dcl_sailed - full} whole column(s) missing)",
                    "rows": [], "races": list(range(full, dcl_sailed)),
                })

        # -- 3. Empty required cells ----------------------------------------
        # A field is only "missing" if the SOURCE has that column. We infer the
        # column exists when it's populated on a majority of the fleet; a field
        # blank on (almost) every row is a column the format simply omits — a
        # NOC-only report has no sail column, a race-by-race club sheet has no
        # computed net — and demanding it would be a false gap. Name is the one
        # unconditional requirement (a row with no athlete is always wrong).
        n = len(entries)
        MAJ = 0.6

        def _col_exists(pred):
            return sum(1 for e in entries if pred(e)) >= max(1, MAJ * n)

        sail_exists = _col_exists(_has_real_sail)
        rank_exists = _col_exists(lambda e: isinstance(e.get("pdf_rank"), int))
        net_exists = _col_exists(lambda e: e.get("pdf_net") is not None)

        no_name, no_rank, no_net, no_sail = [], [], [], []
        for e in entries:
            if not str(e.get("helm") or e.get("name") or "").strip():
                no_name.append(e)
            if rank_exists and not isinstance(e.get("pdf_rank"), int):
                no_rank.append(e)
            if net_exists and e.get("pdf_net") is None:
                no_net.append(e)
            if sail_exists and not _has_real_sail(e):
                no_sail.append(e)

        for rows_bad, field in ((no_name, "helm/name"), (no_rank, "rank"),
                                (no_net, "net points"), (no_sail, "sail number")):
            if rows_bad:
                gaps.append({
                    "fleet": flabel, "group": "", "kind": "empty_field",
                    "field": field,
                    "detail": f"{len(rows_bad)} of {n} row(s) missing {field} "
                              f"(column present on the rest)",
                    "rows": [_row_id(e) for e in rows_bad[:40]],
                    "races": [],
                })

        # -- 4. Rank contiguity + suspicious duplicates ---------------------
        # Only meaningful when this fleet's ranks are 1-BASED. Qualifying flights
        # and age/gender sub-divisions carry GLOBAL ranks (a "Masters" group of 2
        # may be ranked 8 & 11 overall, a "Pearl" flight ranked 41..80) — there
        # "1..N absent" is expected, not a gap. When min rank > 1 the fleet is
        # such an offset sub-group, so we skip the contiguity check for it.
        ranks = [e.get("pdf_rank") for e in entries if isinstance(e.get("pdf_rank"), int)]
        if ranks and min(ranks) == 1:
            hi = max(ranks)
            expected = set(range(1, hi + 1))
            missing_ranks = sorted(expected - set(ranks))
            # Tolerate a small tail (ties consume numbers: 1,2,2,4 skips 3).
            if len(missing_ranks) > max(1, int(0.15 * hi)):
                gaps.append({
                    "fleet": flabel, "group": "", "kind": "rank_break",
                    "detail": f"{len(missing_ranks)} of ranks 1..{hi} absent "
                              f"(e.g. {missing_ranks[:8]}) — rows likely dropped",
                    "rows": [], "races": [],
                })
            # Duplicate rank whose tied rows have DIFFERENT nets is not a tie —
            # it is a duplicated row or two collapsed fleets (the DUP52 signal).
            by_rank: dict[int, list] = {}
            for e in entries:
                r = e.get("pdf_rank")
                if isinstance(r, int):
                    by_rank.setdefault(r, []).append(e)
            dup_bad = []
            for r, grp in by_rank.items():
                if len(grp) < 2:
                    continue
                nets = {e.get("pdf_net") for e in grp}
                if len(nets) > 1:
                    dup_bad.extend(grp)
            if dup_bad:
                gaps.append({
                    "fleet": flabel, "group": "", "kind": "dup_rank",
                    "detail": f"{len(dup_bad)} row(s) share a rank with a DIFFERENT "
                              f"net score (duplicated rows / collapsed fleets)",
                    "rows": [_row_id(e) for e in dup_bad[:40]],
                    "races": [],
                })

    # -- Overall row-count checksum for a flattened single-fleet result -----
    dcl_overall = declared.get("entries") if isinstance(declared, dict) else None
    if (isinstance(dcl_overall, int) and dcl_overall > 0
            and len(fleets) == 1 and not dcl_fleets):
        if total_rows < dcl_overall:
            gaps.append({
                "fleet": "", "group": "", "kind": "missing_rows",
                "detail": f"parsed {total_rows} of {dcl_overall} stated entries "
                          f"({dcl_overall - total_rows} rows missing)",
                "rows": [], "races": [], "missing_count": dcl_overall - total_rows,
            })

    complete = len(gaps) == 0
    kinds = sorted({g["kind"] for g in gaps})
    summary = ("PASS: complete" if complete
               else f"FAIL: {len(gaps)} gap(s) [{', '.join(kinds)}]")
    return {
        "complete": complete,
        "gaps": gaps,
        "stats": {"rows": total_rows, "fleets": len(fleets),
                  "gap_kinds": kinds},
        "summary": summary,
    }


def repair_hint(report: dict) -> str:
    """
    Compress a completeness report into a short instruction for an AI repair
    prompt — names the specific gaps so the model re-reads only what's missing
    (§6A: targeted, not a whole-document re-parse). Empty string when complete.
    """
    if report.get("complete"):
        return ""
    lines = []
    for g in report.get("gaps", []):
        where = " / ".join(x for x in (g.get("fleet"), g.get("group")) if x)
        where = f" [{where}]" if where else ""
        lines.append(f"- {g['kind']}{where}: {g['detail']}")
        rows = g.get("rows") or []
        if rows:
            lines.append(f"    affected: {', '.join(rows[:12])}"
                         + (" …" if len(rows) > 12 else ""))
    return ("The rule parser produced an INCOMPLETE result. Re-read the document "
            "and fix exactly these gaps (transcribe the source verbatim — never "
            "re-rank or recompute):\n" + "\n".join(lines))
