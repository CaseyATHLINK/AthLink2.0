-- 0004_athlete_profiles.sql
-- Owner-editable athlete profile fields, layered on top of the auto-built
-- (PDF-derived) profile. The PDF stays ground truth for RESULTS; this table
-- only holds presentation extras the verified owner sets themselves:
--   bio          — free-text athlete bio
--   instagram_url- Instagram link (shown as a button to ALL viewers when set)
--   nat_override — owner-chosen nationality (IOC code) overriding the sail-derived guess
--   photo_url    — public URL of an uploaded headshot (see athlete-photos bucket)
--
-- Profiles are keyed by NAME (the app keys athletes by name, not an id). We
-- store a normalised name_key = lower(trim(name)) as the PK so lookups are
-- stable and case-insensitive, plus the display name as last written.
--
-- Write access is gated to the VERIFIED OWNER: a user with an APPROVED
-- athlete_claims row for that profile name. Read is public.
--
-- Idempotent: safe to re-run. After applying:  NOTIFY pgrst, 'reload schema';

create table if not exists public.athlete_profiles (
  name_key      text primary key,
  display_name  text,
  bio           text,
  instagram_url text,
  nat_override  text,
  photo_url     text,
  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),

  -- name_key must already be normalised (lower-case, trimmed). Guards against
  -- the client writing a raw/mixed-case key that would dodge the PK dedup.
  constraint athlete_profiles_name_key_norm check (name_key = lower(btrim(name_key)))
);

comment on table public.athlete_profiles is
  'Owner-editable extras (bio, instagram, nationality override, photo) for an auto-built athlete profile, keyed by normalised name. Results remain PDF-sourced.';

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.athlete_profiles enable row level security;

-- Read: public — profiles are shown to everyone (Instagram button, photo, bio).
drop policy if exists athlete_profiles_select_all on public.athlete_profiles;
create policy athlete_profiles_select_all
  on public.athlete_profiles
  for select
  using (true);

-- Write (insert/update/delete): only the verified owner of THIS profile name,
-- i.e. a user with an approved athlete_claims row whose profile_name matches.
drop policy if exists athlete_profiles_write_owner on public.athlete_profiles;
create policy athlete_profiles_write_owner
  on public.athlete_profiles
  for all
  to authenticated
  using (
    exists (
      select 1 from public.athlete_claims c
      where c.user_id = auth.uid()
        and c.status = 'approved'
        and lower(btrim(c.profile_name)) = athlete_profiles.name_key
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1 from public.athlete_claims c
      where c.user_id = auth.uid()
        and c.status = 'approved'
        and lower(btrim(c.profile_name)) = athlete_profiles.name_key
    )
  );

-- PostgREST must reload its schema cache after any DDL.
notify pgrst, 'reload schema';
