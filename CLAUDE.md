# AthLink — project context for Claude Code

This file orients any Claude (or developer) working on this repo.

## What AthLink is
A verified-athlete data platform that uses competition results as the entry point to
sports sponsorship. Results → auto-build verified profiles → athlete claims →
sponsor discovery. B2B first: sell/give results infrastructure to class associations,
athlete profiles are a by-product.

## Current build state
src/App.jsx is a self-contained front-end prototype (no backend yet):
- Two real events loaded: 2023 + 2024 29er Asian Championships (from Sailwave PDFs).
- Scoring engine: Low Point, N discards, penalty codes (DNF/DNC/DSQ/etc). Reproduces
  Sailwave nett scores from raw race finishes.
- Doublehanded model: helm + crew each get their own profile, linked per result.
- In-app result editor: click any race cell → input → Enter to save → re-scores live.
- Import modal: Upload PDF (heuristic Sailwave parser) or Manual import (paste format).
- Athletes: Verified/Unverified status, profile aggregation across events.
- Branding: navy/Olympic-blue, Barlow + DM Sans, white-label federation portal.
- State is in-memory (no persistence yet — next build priority).

## What's next (real build)
1. Backend + DB: persist events/athletes/claims, user accounts.
2. PDF/XRR ingestion pipeline (server-side, reliable).
3. Federation admin panel: affiliate clubs, approve events.
4. Athlete enrichment: bio, social, sponsorship ask on top of verified results.
5. Sponsor discovery layer.
6. HK PDPO compliance + minors consent model.

## Design
Navy #163a63, accent #0d8ecf, paper #f3f7fb. Barlow 800 display, DM Sans body.
White-label: each federation gets their own branded portal ("Hong Kong 29er Class
Association") sitting on the same AthLink infrastructure.

## Stack
Vite + React 18 + lucide-react. No Tailwind (plain CSS in style block). No backend yet.
