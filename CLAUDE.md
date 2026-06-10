# AthLink 2.0 — Claude Code context

## What this is
Verified-athlete data platform. Strategy: give class associations **free results
infrastructure** → athlete profiles auto-generated as a by-product → sponsorship
marketplace on top. B2B wedge, not direct-to-athlete.

Beachhead: Hong Kong sailing (29er, ILCA, Optimist). CEO Casey Law is a
national-team sailor, giving direct community access.

## Deployed stack
- **Frontend**: React 18 + Vite — `src/App.jsx` (single-file component, ~820 lines)
- **Backend**: Python serverless — `api/parse_pdf.py` (Vercel function, pdfplumber)
- **Database**: Supabase (PostgreSQL) — tables: `events`, `entries`, `athletes`, `verifications`
- **Hosting**: Vercel (auto-deploys from GitHub main branch)
- **Dependencies**: lucide-react (icons), pdfplumber==0.10.3 (`requirements.txt`)

## Env vars (Vercel + local .env)
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

## What the app does right now
- **Home**: "Hong Kong Sailing" with two tabs — Class Portals (3 class cards) and All Athletes
- **Class portal** (e.g. 29er): Regattas tab + Athletes tab
- **Regattas**: event cards → event detail table with inline score editing
- **Athletes**: searchable grid, alphabetical by first name, verified/unverified filter
- **Profiles**: cross-event aggregation (helm + crew), result history, race mini-dots
- **Import modal**: Upload PDF (server-parsed, multi-format) or Manual entry (live Net/Total calc)
- **Scoring engine**: Low Point RRS Appendix A, N discards, penalty codes = fleet+1
- **Doublehanded**: helm + crew each get individual profiles, linked as partners

## Real data loaded
2023 + 2024 29er Asian Championships (seeded to Supabase on first deploy).
If Supabase env vars missing, app falls back to hardcoded seed data.

## Design system
```
--navy:   #163a63   (primary backgrounds, topbar, table headers)
--navy2:  #1f4e80   (secondary navy, badges)
--accent: #0d8ecf   (CTAs, links, active states)
--sky:    #dcecf8   (light accent backgrounds)
--paper:  #f3f7fb   (page background)
--ink:    #14213a   (body text)
--mut:    #5b6b80   (muted/secondary text)
--line:   #d9e3ef   (borders, dividers)
--gold:   #c8920b   (1st place)
```
Typography: **Barlow** (700/800, display headings, `.disp`) + **DM Sans** (body).
No Tailwind — all CSS lives in the `<style>` block inside App.jsx.
All CSS uses CSS custom properties (var(--*)) defined on `.al-root`.

## Design direction (what to improve next)
The current UI is functional but generic. The goal is a **premium sports-data
aesthetic** — think Strava meets an Olympic timing board. Specific opportunities:

- **Motion**: subtle entrance animations exist (`@keyframes rise`) but are basic.
  Opportunities: staggered card reveals, number count-up on stats, smooth page
  transitions between portals/athletes/events.
- **Data visualisation**: race result rows are just numbers. Could be sparkline
  performance charts, win-rate badges, rank-trend indicators on profile pages.
- **Typography hierarchy**: Barlow 800 is used well for headings but body text
  is flat. Need clearer size scale — hero numbers larger, metadata smaller.
- **Event cards**: currently simple rows. Could have a stronger visual identity
  — class colour coding, podium preview (top 3 faces), weather/location imagery.
- **Athlete cards**: avatars are monogram circles. Could add national flag integration,
  division badges, sparkline of recent form.
- **Profile page**: the most important page. Needs a hero moment — biggest stat
  prominent, result history as a visual timeline not just a list.
- **Home hero**: static gradient. Could be animated with sailing-themed motion
  (subtle wave or wind-line animation).

## Code conventions
- All state in the single `AthLinkMVP` default export component
- CSS only in the `<style>` block — no external CSS files
- Navigation via `view` state object: `{name:"portals"|"athletes"|"events"|"event"|"profile", id?}`
- `portal` state = null (home) or class id string ("29er"|"ilca"|"optimist")
- Supabase calls via thin helpers: `sbGet`, `sbPost`, `sbPatch`, `sbDel`
- `scoreEvent(ev)` → `{rows, fleet, races}` — pure function, no side effects
- `aggregate(name, evList)` → `{history, wins, podiums, best, events}` — cross-event profile
- Dates stored as "dd/mm/yyyy", displayed via `formatDate()` → "8 Feb 2024"
- Athletes sorted alphabetically (`localeCompare`) in all lists

## Key product decisions (don't reverse without discussion)
- "Verified/Unverified" not "Claimed/Unclaimed" — signals trust architecture
- Boat count removed from stats (unreliable with crew changes across events)
- Profile aggregation uses ALL events regardless of class (cross-class careers)
- B2B entry point: results tools free to federations, monetise on sponsor side
