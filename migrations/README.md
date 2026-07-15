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
| 0013 | `0013_devmode_anon_writes.sql` | ✅ **Applied 2026-07-13** | Dev-mode admin editing WITHOUT a signed-in session: anon write policies on `athlete_profiles` + `athlete_usernames` (anon rows carry `updated_by null`), anon insert/update on the `athlete-photos` / `athlete-media` / `host-logos` buckets, and the new `site_content` table (public read, open write) backing the landing-page dev copy editor. ⚠ Extends the "app-gated, not RLS-gated" stance of `hosts_write` — drop the `*_anon` policies together with fixing `is_athlink_admin()` (action item 1). |
| 0014 | `0014_scout_portal.sql` | ✅ **Applied 2026-07-15** | Scout portal: `scout_binders` (watchlists), `scout_clips` (polymorphic saves: athlete/result/event/upcoming/snapshot/link, with re-import-proof `snapshot jsonb`), `scout_notes` (rubric jsonb), `pinned_results` (public "Result Highlights", 3 slots per athlete/host), `scout_activity` (append-only who-viewed/saved ledger, banked for the freemium phase), `scout_digest_prefs`. `owner` is text (auth uid or per-browser anon id) — auth phase pending. ⚠ Same app-gated policy stance as 0013; `scout_notes` MUST become owner-read-only before real scout accounts launch. |
| 0015 | `0015_role_rls_hardening.sql` | ✅ applied 2026-07-15 (via Supabase MCP; also dropped live-DB stragglers `hosts_write_all`/`hosts_read_all` missed by the 0001 baseline & 0099) | Role-based RLS hardening around Athlete/Host/Scout. **Hard guarantee: no anonymous writes** — every tightened write policy is scoped `to authenticated`. Adds helpers `is_verified_host_member(h)` (verified member) and `is_host_owner(h)` (verified active owner). Tightens: `hosts` (open write → authed insert / verified-member update / admin delete), `events` (owner-or-collab verified-host write; owner-null events admin-only), `entries` (parented to the event's host check), `host_members` (owners promote/demote; owners-or-self remove), `host_invites` (`hi_update_redeem` re-scoped so a freshly-signed-up authed user with the token can still redeem via `markInviteUsed`'s `{used_at, used_by}` PATCH, but anon/mass updates fail), `pinned_results` (host/athlete key ownership), and the `scout_*` workspace tables (`scout_binders`/`clips`/`notes`/`digest_prefs` → private per-account `owner = auth.uid()::text`, both read + write closed; legacy `anon_*` rows become admin-only). Drops the 0013 anon write policies on `athlete_profiles` + `athlete_usernames` (signed-out dev-mode edits to these now fail — sign in first; **site_content landing copy editor + storage buckets unaffected**). Every admin branch uses the `is_athlink_admin()` placeholder (still true for any authed user) — one-function upgrade path: fix that function's body and every per-user branch tightens with no further migration. **No change** to `custom_classes` (already verified-host-gated in 0002), `scout_activity` (intentionally open insert-only), or the `athletes` table. Known gaps left open: `hi_read` token exposure (pre-auth invite fetch), `hm_insert_self` role field, storage buckets, `is_athlink_admin()` placeholder. |

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
