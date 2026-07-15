-- =============================================================================
-- 0015_role_rls_hardening.sql
-- Role-based RLS hardening (Casey, 2026-07-15).
--
-- The baseline (0001) and the app-gated phases (0013 dev-mode anon writes,
-- 0014 scout portal) left most write policies as `for all using(true)
-- with check(true)` — meaning ANY client holding the public anon key could
-- write nearly every table. This migration tightens the write path around the
-- three viewer types (Athlete / Host / Scout) so that:
--
--   ★ HARD GUARANTEE OF THIS MIGRATION: no ANONYMOUS writes.
--     Every tightened write policy is scoped `to authenticated` and/or requires
--     `auth.uid()`, so a bare anon-key client can no longer insert/update/delete
--     the tables in scope. Reads stay public where they already were.
--
-- ── is_athlink_admin() PLACEHOLDER CAVEAT (intentional) ──────────────────────
-- Per the governing design decision, every tightened WRITE policy is written as
--     is_athlink_admin() OR <real per-user check>
-- is_athlink_admin() is STILL the placeholder from 0001 — its body resolves to
-- `auth.uid() in (auth.uid())`, i.e. it returns true for ANY authenticated user.
-- That is deliberate here: today the admin branch short-circuits, so the only
-- thing these policies actually enforce is "you must be authenticated" (the hard
-- no-anon-writes guarantee above). The per-user branches (is_verified_host_member,
-- is_host_owner, claim/ownership checks) become REAL automatically the moment the
-- placeholder is fixed — a ONE-FUNCTION UPGRADE PATH: replace the body of
-- public.is_athlink_admin() with your real admin UUID(s) and every policy below
-- tightens from "any authenticated user" to "admin or the specific right-holder"
-- with no further migration. See migrations/README.md > Action items #1.
--
-- ── DEV-MODE IMPLICATION ─────────────────────────────────────────────────────
-- 0013 added anon write policies so the dev view (Ctrl/Cmd+Shift+D) could persist
-- DB writes while SIGNED OUT. This migration DROPS the anon write policies on
-- athlete_profiles + athlete_usernames and closes the open scout/pin/host/event
-- write paths. Consequence: signed-out dev-mode edits that hit these tables now
-- FAIL at the DB. Sign in first (any authenticated user passes today, per the
-- placeholder). NOT affected: the landing-page copy editor — site_content keeps
-- its open write policy (0013), and the athlete-photo / athlete-media / host-logo
-- STORAGE buckets keep their anon insert/update policies (out of scope here).
--
-- ── KNOWN GAPS LEFT OPEN (deliberately, documented) ──────────────────────────
--   • hi_read still exposes host_invites rows — INCLUDING the invite token —
--     publicly (select using true). Required by the pre-auth invite-fetch flow
--     (fetchInviteByToken / fetchInviteByShortCode run before sign-in, on the
--     anon key). Not fixed here; a future phase should move that fetch behind an
--     RPC / edge function so tokens stop being world-readable.
--   • hm_insert_self (0001) still lets an authenticated user insert their OWN
--     host_members row with an arbitrary `role`/`status`; membership integrity
--     (owner-approval, verified flag) is enforced app-side + by the update/delete
--     policies below, not on insert. Left as-is (out of scope).
--   • Storage bucket anon policies (0013) are intentionally left in place.
--   • is_athlink_admin() is still the placeholder (see caveat above).
--
-- ── SCOPE NOTES ──────────────────────────────────────────────────────────────
--   • custom_classes: NO CHANGE. An earlier plan draft flagged it, but 0002's
--     insert policy is already verified-host-gated (custom_classes are global
--     reference data, append-only, admin-or-verified-host insert). Correct as-is.
--   • scout_activity: NO CHANGE. Intentionally open, insert-only analytics ledger
--     (append-only "who viewed/saved whom", banked for the freemium phase). Left
--     world-writable-insert by design; carries no read exposure of interest yet.
--   • athletes / entries: entries tightened (parented to events); the `athletes`
--     table itself is NOT in this migration's scope and keeps its open policy.
--
-- Idempotent: every function is CREATE OR REPLACE; every policy is
-- DROP POLICY IF EXISTS … CREATE. Ends with NOTIFY pgrst, 'reload schema';
-- Apply order: 0014 -> 0015 (this file).
-- =============================================================================

-- ── Helper functions ─────────────────────────────────────────────────────────

-- Like is_host_member(h) (0001) but ALSO requires the membership to be verified.
-- Security definer + stable + search_path public, mirroring is_host_member.
create or replace function public.is_verified_host_member(h text)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select exists (
    select 1 from public.host_members
    where host_id = h
      and user_id = auth.uid()
      and status = 'active'
      and verified = true
  );
$function$;

-- The verified OWNER of a host (active + verified + role='owner'). Used to gate
-- membership management (promote/demote/remove) to owners only.
create or replace function public.is_host_owner(h text)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select exists (
    select 1 from public.host_members
    where host_id = h
      and user_id = auth.uid()
      and status = 'active'
      and verified = true
      and role = 'owner'
  );
$function$;

-- ── hosts: signup creates hosts pre-membership; only verified members edit ────
-- Read stays public (hosts_read from 0001, unchanged — not recreated here).
drop policy if exists hosts_write on public.hosts;
-- Live-DB stragglers the reconstructed baseline never captured (found via
-- pg_policies during the 2026-07-15 apply): a fully-open ALL twin + a duplicate
-- read policy from the ad-hoc SQL-editor era. 0099 missed these names.
drop policy if exists hosts_write_all on public.hosts;
drop policy if exists hosts_read_all  on public.hosts;

drop policy if exists hosts_insert on public.hosts;
create policy hosts_insert on public.hosts
  for insert to authenticated
  with check (true);          -- onboarding creates a host BEFORE any membership exists

drop policy if exists hosts_update on public.hosts;
create policy hosts_update on public.hosts
  for update to authenticated
  using      (is_athlink_admin() or is_verified_host_member(id))
  with check (is_athlink_admin() or is_verified_host_member(id));

drop policy if exists hosts_delete on public.hosts;
create policy hosts_delete on public.hosts
  for delete to authenticated
  using (is_athlink_admin());

-- ── events: verified owner or a verified collaborator (host id in collabs[]) ──
-- Read stays public (public_read_events from 0001, unchanged).
-- NOTE: events with owner = NULL (unclaimed / auto-imported provenance) are
-- ADMIN-ONLY to write — is_verified_host_member(null) is false and null is not
-- in collabs[]. Claiming such an event (setting owner) is an admin/dev action
-- until the placeholder is fixed.
drop policy if exists public_write_events on public.events;

drop policy if exists events_write on public.events;
create policy events_write on public.events
  for all to authenticated
  using (
    is_athlink_admin()
    or is_verified_host_member(owner)
    or exists (
      select 1 from jsonb_array_elements_text(collabs) c
      where is_verified_host_member(c.value)
    )
  )
  with check (
    is_athlink_admin()
    or is_verified_host_member(owner)
    or exists (
      select 1 from jsonb_array_elements_text(collabs) c
      where is_verified_host_member(c.value)
    )
  );

-- ── entries: write allowed when the PARENT event passes the same host check ───
-- Read stays public (public_read_entries from 0001, unchanged).
drop policy if exists public_write_entries on public.entries;

drop policy if exists entries_write on public.entries;
create policy entries_write on public.entries
  for all to authenticated
  using (
    is_athlink_admin()
    or exists (
      select 1 from public.events e
      where e.id = entries.event_id
        and (
          is_verified_host_member(e.owner)
          or exists (
            select 1 from jsonb_array_elements_text(e.collabs) c
            where is_verified_host_member(c.value)
          )
        )
    )
  )
  with check (
    is_athlink_admin()
    or exists (
      select 1 from public.events e
      where e.id = entries.event_id
        and (
          is_verified_host_member(e.owner)
          or exists (
            select 1 from jsonb_array_elements_text(e.collabs) c
            where is_verified_host_member(c.value)
          )
        )
    )
  );

-- ── host_members: owners promote/demote; owners or self remove ───────────────
-- hm_read + hm_insert_self (0001) unchanged — not recreated here.
-- Only host OWNERS may UPDATE members (change role/status/verified).
drop policy if exists hm_update_member on public.host_members;
create policy hm_update_member on public.host_members
  for update to authenticated
  using      (is_athlink_admin() or is_host_owner(host_id))
  with check (is_athlink_admin() or is_host_owner(host_id));

-- Owners may remove any member; anyone may remove THEMSELF (leave the host).
drop policy if exists hm_delete_member on public.host_members;
create policy hm_delete_member on public.host_members
  for delete to authenticated
  using (is_athlink_admin() or is_host_owner(host_id) or user_id = auth.uid());

-- ── host_invites: redeem stays possible for a freshly-signed-up authed user ──
-- The app redeems via markInviteUsed() → PATCH host_invites?token=eq.<token>
-- with body { used_at, used_by: <auth.uid()> } (see data/hosts.js). The redeemer
-- is authenticated and knows the token but is NOT yet a host member, so the
-- policy must let them PATCH an unused, unexpired invite while writing used_by to
-- their own uid. Members also manage invites (revoke/mark). Mass/anon updates
-- fail: `to authenticated` blocks anon, and the with-check pins used_by to
-- auth.uid() for the redeem path.
-- hi_read / hi_insert_member / hi_delete_member (0001) unchanged. hi_read still
-- exposes tokens publicly — see KNOWN GAPS in the header (required pre-auth).
drop policy if exists hi_update_redeem on public.host_invites;
create policy hi_update_redeem on public.host_invites
  for update to authenticated
  using (
    is_athlink_admin()
    or is_host_member(host_id)                       -- members manage their invites
    or (used_at is null and expires_at > now())      -- redeemer: unused + unexpired
  )
  with check (
    is_athlink_admin()
    or is_host_member(host_id)
    -- redeem path: the app sends used_by, so constrain it to the redeemer's uid.
    -- (used_by may still be null on a member-side non-redeem PATCH, hence the OR.)
    or used_by = auth.uid()
    or used_by is null
  );

-- ── athlete_profiles / athlete_usernames: drop the 0013 anon write policies ───
-- The authenticated owner-claim policies from 0005/0007 remain and are NOT
-- recreated here. Dropping these removes the signed-out write path (dev-mode
-- must sign in). Storage bucket anon policies (0013) are intentionally kept.
drop policy if exists athlete_profiles_write_anon  on public.athlete_profiles;
drop policy if exists athlete_usernames_write_anon on public.athlete_usernames;

-- ── pinned_results: public read; write by the host/athlete who owns the key ──
-- Read stays public (pinned_results_read from 0014 — highlights are public).
-- owner_kind='host'    → owner_key is hosts.id; verified member of that host.
-- owner_kind='athlete' → owner_key is canonName(name) (see NOTE below).
drop policy if exists pinned_results_write on public.pinned_results;

drop policy if exists pinned_results_owner_write on public.pinned_results;
create policy pinned_results_owner_write on public.pinned_results
  for all to authenticated
  using (
    is_athlink_admin()
    or (owner_kind = 'host' and is_verified_host_member(owner_key))
    or (owner_kind = 'athlete' and exists (
          select 1 from public.athlete_claims c
          where c.user_id = auth.uid()
            and c.status = 'approved'
            and lower(btrim(c.profile_name)) = lower(btrim(owner_key))
        ))
  )
  with check (
    is_athlink_admin()
    or (owner_kind = 'host' and is_verified_host_member(owner_key))
    or (owner_kind = 'athlete' and exists (
          select 1 from public.athlete_claims c
          where c.user_id = auth.uid()
            and c.status = 'approved'
            and lower(btrim(c.profile_name)) = lower(btrim(owner_key))
        ))
  );
-- NOTE (owner_key semantics / deviation, fail-closed): the app writes athlete
-- pins with owner_key = canonName(name) — a lowercased, accent-stripped,
-- punctuation-collapsed, WORD-SORTED key (util/name.js), e.g. "Jack Smith" and
-- "Smith, Jack" both → "jack smith". athlete_claims.profile_name, by contrast,
-- is a raw DISPLAY name. So `lower(btrim(profile_name)) = lower(btrim(owner_key))`
-- only matches when the display name already equals the canon form; the app has
-- no SQL-reproducible canonName(). Additionally the app gates athlete pin editing
-- on profiles.athlete_name (canonName-matched), NOT athlete_claims (a PAUSED
-- feature). Both mismatches are ACCEPTED because this branch fails CLOSED and is
-- moot today: the admin branch short-circuits for any authed user (placeholder),
-- so worst case an athlete cannot self-pin via RLS and only admin/dev can. When
-- the placeholder is fixed, revisit this branch to match the app's real
-- athlete-ownership signal (profiles.athlete_name via a canon-name helper).

-- ── scout_* workspace: private per-account (owner = auth.uid()::text) ─────────
-- Drops BOTH the open read and open write policies from 0014 on binders, clips,
-- notes, digest prefs. New: every op (select/insert/update/delete) restricted to
-- admin or the owning account. The app sets owner = auth.uid() when signed in via
-- scoutOwnerId(); legacy signed-out "anon_<rand>" rows become invisible to
-- everyone but admin — intentional (private workspaces, no anon access).
-- scout_activity is intentionally NOT touched (open insert-only ledger).

drop policy if exists scout_binders_read  on public.scout_binders;
drop policy if exists scout_binders_write on public.scout_binders;
drop policy if exists scout_binders_owner on public.scout_binders;
create policy scout_binders_owner on public.scout_binders
  for all to authenticated
  using      (is_athlink_admin() or owner = auth.uid()::text)
  with check (is_athlink_admin() or owner = auth.uid()::text);

drop policy if exists scout_clips_read  on public.scout_clips;
drop policy if exists scout_clips_write on public.scout_clips;
drop policy if exists scout_clips_owner on public.scout_clips;
create policy scout_clips_owner on public.scout_clips
  for all to authenticated
  using      (is_athlink_admin() or owner = auth.uid()::text)
  with check (is_athlink_admin() or owner = auth.uid()::text);

drop policy if exists scout_notes_read  on public.scout_notes;
drop policy if exists scout_notes_write on public.scout_notes;
drop policy if exists scout_notes_owner on public.scout_notes;
create policy scout_notes_owner on public.scout_notes
  for all to authenticated
  using      (is_athlink_admin() or owner = auth.uid()::text)
  with check (is_athlink_admin() or owner = auth.uid()::text);

drop policy if exists scout_digest_prefs_read  on public.scout_digest_prefs;
drop policy if exists scout_digest_prefs_write on public.scout_digest_prefs;
drop policy if exists scout_digest_prefs_owner on public.scout_digest_prefs;
create policy scout_digest_prefs_owner on public.scout_digest_prefs
  for all to authenticated
  using      (is_athlink_admin() or owner = auth.uid()::text)
  with check (is_athlink_admin() or owner = auth.uid()::text);

-- PostgREST must reload its schema cache after any DDL.
notify pgrst, 'reload schema';
