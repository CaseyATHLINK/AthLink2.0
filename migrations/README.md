# Database migrations

Canonical SQL for the AthLink 2.0 Supabase project (ref `ylzoburtpibbgqdggjty`).

These files are the **source of truth** for the schema. The live database was
originally built by running ad-hoc queries in the Supabase SQL Editor (the pile
of "Untitled query" snippets), so it has **no tracked migration history**. This
folder replaces that: numbered, ordered, idempotent files you can read, diff,
and re-run safely.

## Files & apply order

| Order | File | Status | Purpose |
|-------|------|--------|---------|
| 0001 | `0001_baseline_schema.sql` | ✅ Already live | Full reconstruction of the current public schema — tables, indexes, triggers, RLS policies, helper functions. Re-running it is a no-op. |
| 0002 | `0002_custom_classes.sql` | ✅ **Applied 2026-07-01** | Adds the `custom_classes` table to persist the `CUSTOM_CLASSES` registry. Fixes the grey unrecognized-class nuggets. |
| 0011 | `0011_host_logos_bucket.sql` | ✅ **Applied 2026-07-07** | Public `host-logos` storage bucket (5MB, PNG/webp) + public-read/authenticated-write policies (mirrors 0010). Backs host/association self-logos: client uploads a navy-recolored-on-transparent PNG (baked at save time in App.jsx), URL saved to the existing `hosts.logo_url` column (from 0008). Supersedes 0008's data-URL approach. |
| 0012 | `0012_host_dossier.sql` | ✅ **Applied 2026-07-08** | Host auto-grab (AI onboarding): adds `hosts.dossier jsonb` to store the confirmed web-research dossier (`identity`, `competitions[]`, `pending_import[]`, `needs_review[]`, `fetched_at`, `confirmed`). Written by the signing-up owner via the normal host save path; no new RLS (host write policies already cover it). Backs `api/research_host.py` + the "Is this you?" card and discovery view. Schema reloaded via `notify pgrst, 'reload schema';`. |

Every statement is idempotent (`if not exists` / `create or replace` /
`drop policy if exists … create`). After any DDL, run
`notify pgrst, 'reload schema';` (already included at the end of each file).

## Audit findings — 2026-06-25

Inspected the live DB via the Supabase connector. CLAUDE.md's "Pending
migrations" list was **stale** — most of it is already applied:

- ✅ `profiles.username` + unique index — **applied** (not pending)
- ✅ `host_invites.short_code` + indexes — **applied** (not pending)
- ✅ Event provenance columns (`owner`, `owner_confirmed`, `imported_by`,
  `organizer_name`, `fingerprint`, `sources`, `collabs`, `subclass`) — **applied**
- ✅ `country` column on `hosts` (and on `events`) — **applied** (CLAUDE.md
  marked this "NOT YET RUN" — that note was wrong)
- ✅ `custom_classes` table — applied 2026-07-01 (see 0002)

Live tables (11): `events`, `athletes`, `entries`, `verifications`, `profiles`,
`hosts`, `host_members`, `host_invites`, `host_audit`, `athlete_claims`,
`event_claims`. Note `verifications` exists but isn't in CLAUDE.md's table list.

## Action items (worth a look)

1. **`is_athlink_admin()` is still a placeholder.** Its body resolves to
   `auth.uid() in (auth.uid())` — i.e. effectively **true for any logged-in
   user**. Every "admin" RLS policy (admin reads/deletes profiles, members,
   claims; `event_claims` update) currently grants those rights to *all*
   authenticated users. Replace the body with your real admin UUID(s) before
   relying on admin gating. This matches the `dev_admin_select_migration.sql`
   "replace admin UUID placeholder first" note in CLAUDE.md.

2. **Duplicate RLS policies live in the DB** (leftovers from re-running near-
   identical snippets). They're harmless (same predicates) but messy:
   - `profiles`: `profiles insert own` **and** `profiles_insert_own`; same for
     read/update (space-named vs underscore-named pairs).
   - `hosts`: `hosts_read` **and** `hosts_read_all`; `hosts_write` **and**
     `hosts_write_all`.
   `0001` keeps only the canonical (underscore / non-`_all`) names. To drop the
   redundant ones from the live DB, run `0099_cleanup_duplicate_policies.sql`
   (optional — review before applying).
