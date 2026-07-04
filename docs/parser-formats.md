# Parser format registry — Phase 0 corpus inventory

_Generated 2026-07-03 from Casey's "Results to parse" corpus (~110 files:
54+ PDFs, 9 HTML, 4 XLSX, images, 1 .blw, plus 35 PDFs/images from the three
zipped HKSF emails). This is the ground-truth map that drives `detect_format()`
and the format-handler registry in `api/parse_pdf.py`._

**Reading this table:** one row per format family. "Rule parser" says what the
deterministic path can do today: ✅ existing path works, 🔧 existing path needs
extension, 🆕 new rule extractor needed, 👁 vision-AI only (no text layer /
no deterministic structure).

## Input-type census

| input type | count | route |
|---|---|---|
| PDF with text layer | ~60 | pdfplumber → family extractor |
| PDF rasterised / photocopier scan (zero text) | ~14 | vision AI (Gemini) |
| Standalone image (PNG/JPEG screenshots, photos) | 4 | vision AI (Gemini) |
| HTML (saved pages + native exports) | 9 | HTML table harvester |
| XLSX (club workbooks) | 4 | openpyxl grid reader |
| .blw (raw Sailwave project) | 1 | dedicated line parser |

## Format family registry

| family | generator / source | input types seen | detection signature | rule parser | samples |
|---|---|---|---|---|---|
| sailwave-table | Sailwave (native print, Excel round-trip, or Chrome print of Sailwave HTM) | pdf-text | footer `Sailwave Scoring Software x.y` (may be **last page only**), PDF Title `Sailwave results for …`, `Sailed: N, Discards: … Scoring system:` blocks | ✅ | 2023/24/25 asians, Southside 2020/22/23/24, OPTI HKRW, ILCA HKRW, HKRW 2026 set, ILCA Asians 2022 finals |
| sailwave-text / sailwave-geometry | Sailwave flighted or two-person layouts where the table grid shatters | pdf-text | same Sailwave signatures + deficient table parse | ✅ | OPTI HKRW 2017 (flights), 29er docs |
| sailwave-html | Sailwave HTML via ourclubadmin (doubled-letter bold headers) | html, pdf-text (Chrome print) | `ourclubadmin.com` URL stamp, `RRaannkk`-style doubled headers, `table.summarytable` | ✅ | UK nats 29er 2025, 2022 worlds.html, Euros 2022.html, HKRW htmls |
| sailwave-html-native | Sailwave "publish to HTML" direct (tablesorter th cells, no ourclubadmin wrapper) | html | `<title>Sailwave results for …` + `tablesorter-header-inner` th divs, per-class `<h3>` | 🔧 (extend `_TableHarvester`) | Asian Sailing Champs 2023 (RVYC) html |
| sailwave-raster | Sailwave HTM printed via "Microsoft: Print To PDF" — pages fully rasterised | pdf-scanned | PDF Title `Sailwave results for …` + zero extractable chars | 👁 (title hints family for the vision prompt) | 29er Worlds 2025, ILCA 4 Youth Worlds Boys/Girls 2025 |
| sailwave-blw | Raw Sailwave project file | blw | first line `"ser…"`; quoted 4-field CSV records, `serversion` key | 🆕 (richest data: compnat, comphelmname/compcrewname, per-race rpts/rdisc) | HK 29er Champs 2021.blw |
| manage2sail | manage2sail (combit List & Label; Producer varies wPDF3/PDFium — key on footer text) | pdf-text | footer `Powered by www.manage2sail.com`, Title `manage2sail Report` | ✅ (watch: Sponsor col, Q/F/M race prefixes, 200% medal race, decimal RDG stacked in cell, per-person clubs in Name cell) | JWC 2023/24/25, Kiel 2022/2023/2025, 49er Euros 2025 |
| sailti | Sailti Scoring Soft (TCPDF HTML2PDF) | pdf-text | footer `Sailti Scoring Soft Page x/y`, Producer TCPDF | 🔧 `try_sailti` exists; crew-line glyph interleaving ("RRiIcEhGaErRd") needs geometry-aware fix; Dragon variant has 3-person Crew/Club cells + Bow col | Palma 2026, SOF 2023, OP Worlds 2025/2026, Dragon Worlds 2025, U21 ILCA7 |
| sailti-web | scoring.sailti.com / SailOptimist / ILCA live-results web page (saved, printed, or paper-scanned) | html, pdf-text, pdf-scanned | `Last update: dd/mm/yyyy hh:mm:ss` stamp + colour-group header row; sailti.com/optiworld.org link annotations; hidden `punt_<Fleet> _0000NNN` sort spans in HTML | 🆕 (text order jumbled in prints; HTML needs hidden-span stripping) | Sailing Grand Slam.html, 2025 OP Asian & Oceanian, 2026 ILCA4 Euros scans, 2025 OP Worlds Girls |
| sailingresults | SailingResults.net (overall.aspx prints, incl. WordPress-embedded hansaworlds.org) | pdf-text | footer `Results by SailingResults.net Created <date>` | ✅ (`try_sailingresults`; watch: WordPress chrome pages, right-edge column clipping, Country+State cols) | Aussie nationals, Hansa Worlds 2025, Hansa 303/Liberty |
| clubspot | theclubspot.com | pdf-text | `theclubspot.com/regatta/<id>/results` URL stamp | ✅ (`try_clubspot`) | Hebe 2021 |
| overall-results | bilingual CN/EN championship books ("Overall Results of <division>") | pdf-text | heading `Overall Results of` | ✅ (`try_overall_results`) | 2023 ILCA Asians Overall |
| aspose-bilingual-cn | Chinese notice-board results (Aspose.PDF for .NET), Qinhuangdao ILCA events | pdf-text + pdf-scanned siblings | Producer `Aspose.PDF for .NET`; bilingual stacked header 排名/Rank 国籍/Nat. 帆号/Sail No. 姓名/Helm | 🆕 (text copies); 👁 (Konica scans of same layout) | 2025 ILCA Asian & Open Champs set, ILCA 4&6 AOC 2025 |
| cn-games-book | Chinese National Games results book (Pdftools SDK, full CJK) | pdf-text | Producer `Pdftools SDK`, 成绩册 title, 名次公告/成绩公告 sections | 🆕 (CJK, doubled glyphs 帆帆船船, vertical sidebar noise; province not IOC nat) | 第十五届全国运动会 book |
| bornan | Asian Games 2022 official timing (Stimulsoft Reports) | pdf-text | footer `Timing and Results provided by Bornan`; Swiss-Timing-style report code | 🆕 (H/C markers in Name cell, NOC Code col, medal-race col, stacked score codes) | AG2022 49er + ILCA6 |
| hubsail | HUBSAIL notice board (Chrome print) | pdf-text | PDF **metadata Title** `HUBSAIL - Notice board` (no in-text stamp) | 🆕 (multi-ranking docs: Overall/Corinthian/U23/Women; multi-person crew cells) | RS21 Worlds 2025 |
| 49er-org | 49er.org WordPress results page, rasterised print | pdf-scanned | Title `…International 49er Class Association`; 49er.org URL stamps | 👁 (**discards are strikethrough only** — vision prompt must ask for them) | Kiel Week 49er/FX 2025 |
| pya-events | events.pya.org.pl (Polish YA portal; Sailwave-scored data in Bootstrap markup) | html | domain + `table.table-results` inside `.tab-pane`, `<h5>Klasa: <class>` headings | 🔧 (extend `_TableHarvester`: skip decoy tables, h5 anchors, YOB cols) | events.pya.org.pl.html |
| asiansailing-wordpress | asiansailing.org news-article print with embedded Sailwave-derived tables | pdf-text | asiansailing.org URL stamp + `Sailed:… Appendix A` blocks with **no** Sailwave footer | 🆕 (skip 2-3 pages of article chrome; nat stacked atop sail no; some fleets Total-only) | First ASAF Youth Cup 2016-17 |
| excel-print-pdf | Excel sheets printed to PDF (ABC office: GPL Ghostscript + PScript5.dll; federation sheets: Microsoft Excel producer) | pdf-text | Producer `GPL Ghostscript`/`Microsoft® Excel®`, meta Title ends `.xls(x)`, merged title row above header | 🆕 (sub-layouts: overall-series grid; stacked per-race PY blocks; custom federation sheets) | RS Feva 2016, 2019 Prov, Southside 2018 set, 2nd SEA Para Sailing 2024 |
| club-custom-xlsx | hand-made club race-officer workbooks | xlsx | one sheet per fleet; merged title rows; `Race N (Division X)` stacked blocks; header on block row 3 | 🆕 (header located per block; PY/corrected-time vs points scoring; Excel-epoch garbage times) | Opening Regatta 2017, Southside 2017, SS Fast Boat / SS Open Div 2016 |
| ioda-word-notice | IODA "General Notice" Word doc — prose top-3 lists only | pdf-text | Producer `Microsoft Word`, Title `IODA Standard Form - General Notice`, `First:/Second:/Third:` lines | 🆕 prose extractor or AI text fallback (no ranks grid — placements only) | OP Asian Girls top places 2023 |
| topyacht | TopYacht (Australian club scoring; Southport YC etc.) | pdf-text | footer `Results by : TopYacht`; header `Series Results [<class>] up to Race N (Drops = N)`; `Updated: dd/mm/yyyy hh:mm:ss` | 🆕 (race columns in REVERSE order Race N…Race 1; codes as single letters suffixed to bracketed scores `[19.0O]` with legend line; Place/Ties/Sail No/Boat Name/Skipper/Sers Score) | Hansa Asia Pacific Champs 2024 (plain + highlighted) |
| worldsailing-resultscentre | World Sailing "Results Centre" event microsites (Hague 2023 Allianz Worlds, Youth Worlds Garda 2024), Chrome print | pdf-text (thin) | Title `… - Result(s Centre)`; nav chrome `The Championships / How to Follow / Results Centre`; header `Rank MNA Crew Race 1…` | 🆕 (MNA = nat col; multi-line wrapped crew names interleave with score rows; sparse text layer) | Allianz Hague 2023, Youth Worlds 29er F 2024 |
| unknown-scanned | photocopier scans (Konica Minolta bizhub) & raster web prints, family unknowable without OCR | pdf-scanned | zero text layer; Producer bizhub / Microsoft Print To PDF | 👁 | 2023 29er Worlds Silver, 2023 OP Asians/Worlds, SailingNet ILCA6, 2024 29er Asians scan, 2024 OP Europeans scan, OG 2024 ILCA7 |
| screenshots/photos | Kiel Week PNGs, optiworld JPEG, Allianz Hague PNG | image | mime | 👁 | Email 6/7 images |

Email 7 additions folded in above: Aarhus 29er Worlds 2024 → sailwave-table;
49er Worlds Overall 2024 → manage2sail; 2024 OP Europeans (Colourful) + 2024 OP
Asian & Oceanian ALL → sailti-web; Hansa Asia Pacific → topyacht (NEW); Allianz
Hague + Youth Worlds → worldsailing-resultscentre (NEW); 2nd SEA Para Sailing →
excel-print-pdf; three Konica scans + OG 2024 → unknown-scanned/vision.

## Casey's three named primaries — coverage check

- **Manage2sail** — ✅ well covered (7 samples), existing rule path holds; needs
  the quirk list above folded into tests.
- **Sailti** — ✅ covered in three flavours: TCPDF prints (existing `try_sailti`),
  the NEW `sailti-web` live-results family, and paper scans of the web page.
- **SailSys** — ⚠️ **no SailSys sample anywhere in the corpus** (the Australian
  club candidates turned out to be TopYacht and SailingResults.net). The
  registry reserves the family; we need a sample from Casey (or a public
  SailSys PDF) to key its signature and build the extractor. Open item.

## Cross-cutting facts the pipeline must respect

1. **Signatures live in different places per family**: page text (footers/URL
   stamps), PDF metadata (Title/Producer/Creator — hubsail is metadata-only),
   HTML structure (css classes), or file structure (.blw first line). The
   detector must check all four cheaply before any extraction.
2. **~18 of the PDFs have no text layer at all** (photocopier scans and
   rasterised prints). These are only detectable as "scanned" + optional
   metadata hint, and route straight to vision. PDF Title often still names the
   family (e.g. `Sailwave results for …`) — pass it to the vision prompt as a
   hint.
3. **Nationality appears five different ways**: dedicated Nat/Country/NOC
   column; "Sail Prefix"/"Sail National Letter" columns; fused into the sail
   number (`HKG929`, `CHN200777`); flag images with an empty Nat column
   (existing `nat_from_flags` AI read); or absent entirely (club-only docs,
   Chinese province affiliations).
4. **Penalty codes are ground truth and fragile**: they wrap across lines
   (`(26.0\nDSQ)`), stack vertically in cells (STP above the score), fall onto
   continuation lines (sailingresults), or are strikethrough-only (49er-org
   raster). Every extractor must preserve them verbatim.
5. **Multi-something is the norm**: multi-class documents (one table per fleet),
   colour flights (Gold/Silver), category-filtered views with non-contiguous
   ranks (sailti-web Girls), multi-ranking notice boards (hubsail), and
   compound books (cn-games-book). Grouping logic in `_finalize` already models
   most of this.
6. **Dates are usually printed** ("as of …", "Created …", footer stamps, date
   ranges) but several families carry only a year or nothing (Southside 2020/22,
   abc-excel-pdf, club-custom-xlsx, hubsail) → enrichment path needed.
7. **CJK support required** for aspose-bilingual-cn, cn-games-book, bornan
   (bilingual titles) and Chinese athlete names inside otherwise-English docs
   (abc-excel-pdf OP 2018).
