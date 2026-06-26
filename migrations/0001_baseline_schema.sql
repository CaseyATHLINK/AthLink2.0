-- =============================================================================
-- 0001_baseline_schema.sql
-- AthLink 2.0 — canonical baseline of the LIVE public schema.
--
-- Reconstructed on 2026-06-25 by introspecting the live Supabase project
-- (ref ylzoburtpibbgqdggjty). The live DB has NO tracked migration history —
-- it was built by ad-hoc queries in the SQL Editor — so this file recreates
-- the current state as a single, ordered, idempotent source of truth.
--
-- Safe to re-run: every statement is IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS ... CREATE. Running this against the live DB is a
-- no-op; running it against a fresh DB rebuilds the schema.
--
-- Apply order: 0001 (this file) -> 0002_custom_classes.sql (pending).
-- =============================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp" with schema extensions;

-- ── Helper functions ─────────────────────────────────────────────────────────

-- NOTE: this is still the PLACEHOLDER shipped in the editor. As written it
-- effectively returns true for any logged-in user (auth.uid() in (auth.uid())).
-- Replace the body with your real admin UUID(s) before relying on admin gating.
-- See migrations/README.md > "Action items".
create or replace function public.is_athlink_admin()
  returns boolean
  language sql
  stable
as $function$
  select auth.uid() in (
    -- '00000000-0000-0000-0000-000000000000'::uuid   -- ← your admin user id
    auth.uid()  -- placeholder; replace with real admin id(s)
  ) and auth.uid() in (
    auth.uid()  -- placeholder; replace with real admin id(s)
  );
$function$;

create or replace function public.is_host_member(h text)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select exists (
    select 1 from public.host_members
    where host_id = h and user_id = auth.uid() and status = 'active'
  );
$function$;

create or replace function public.touch_profiles_updated_at()
  returns trigger
  language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ── Tables ───────────────────────────────────────────────────────────────────

-- events ----------------------------------------------------------------------
create table if not exists public.events (
  id              uuid primary key default extensions.uuid_generate_v4(),
  name            text not null,
  class           text not null default '29er',
  venue           text,
  date            text,
  discards        integer not null default 1,
  scoring         text,
  source          text,
  status          text default 'Final',
  doublehanded    boolean default true,
  created_at      timestamptz default now(),
  country         text,
  -- provenance (source ≠ organizer model)
  owner           text,
  owner_confirmed boolean default true,
  imported_by     text,
  organizer_name  text,
  fingerprint     text,
  sources         jsonb default '[]'::jsonb,
  collabs         jsonb not null default '[]'::jsonb,
  subclass        text
);

-- athletes --------------------------------------------------------------------
create table if not exists public.athletes (
  id         uuid primary key default extensions.uuid_generate_v4(),
  name       text not null unique,
  nat        text,
  ws_id      text,
  created_at timestamptz default now()
);

-- entries ---------------------------------------------------------------------
create table if not exists public.entries (
  id               uuid primary key default extensions.uuid_generate_v4(),
  event_id         uuid not null references public.events(id) on delete cascade,
  sail             text,
  division         text,
  helm_name        text not null,
  crew_name        text,
  races            jsonb not null default '[]'::jsonb,
  helm_athlete_id  uuid references public.athletes(id),
  crew_athlete_id  uuid references public.athletes(id),
  created_at       timestamptz default now(),
  nat              text,
  pdf_rank         integer,
  pdf_net          numeric,
  race_codes       jsonb,
  birth_year       integer,
  crew_birth_year  integer,
  gender           text check (gender is null or gender = any (array['M','F','Mix'])),
  category         text
);

-- verifications ---------------------------------------------------------------
create table if not exists public.verifications (
  id          uuid primary key default extensions.uuid_generate_v4(),
  athlete_id  uuid not null unique references public.athletes(id),
  user_id     uuid,
  verified_at timestamptz default now()
);

-- profiles --------------------------------------------------------------------
create table if not exists public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  role            text not null default 'guest',
  display_name    text,
  class_id        text,
  athlete_name    text,
  created_at      timestamptz not null default now(),
  birth_year      integer,
  guardian_pending boolean default false,
  guardian_email  text,
  first_name      text,
  last_name       text,
  username        text,
  updated_at      timestamptz not null default now()
);

-- hosts -----------------------------------------------------------------------
create table if not exists public.hosts (
  id         text primary key,
  type       text not null check (type = any (array['association','club','federation'])),
  scope      text not null default 'HK',
  cls        text,
  name       text not null,
  country    text,
  created_at timestamptz not null default now()
);

-- host_members ----------------------------------------------------------------
create table if not exists public.host_members (
  id         uuid primary key default gen_random_uuid(),
  host_id    text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'editor' check (role = any (array['owner','editor'])),
  status     text not null default 'pending' check (status = any (array['active','pending'])),
  verified   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (host_id, user_id)
);

-- host_invites ----------------------------------------------------------------
create table if not exists public.host_invites (
  token      text primary key,
  host_id    text not null,
  role       text not null default 'editor' check (role = any (array['owner','editor'])),
  created_by uuid references auth.users(id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references auth.users(id),
  created_at timestamptz not null default now(),
  short_code text
);

-- host_audit ------------------------------------------------------------------
create table if not exists public.host_audit (
  id             uuid primary key default gen_random_uuid(),
  host_id        text not null,
  actor_user_id  uuid references auth.users(id),
  action         text not null,
  target_user_id uuid references auth.users(id),
  detail         text,
  ts             timestamptz not null default now()
);

-- athlete_claims (PAUSED feature — table exists, flow disabled in app) ---------
create table if not exists public.athlete_claims (
  id           uuid primary key default gen_random_uuid(),
  profile_name text not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status = any (array['pending','approved','denied'])),
  vouched_by   uuid references auth.users(id),
  host_id      text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  unique (profile_name, user_id)
);

-- event_claims ----------------------------------------------------------------
create table if not exists public.event_claims (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  host_id    text not null,
  user_id    uuid not null,
  status     text not null default 'pending',
  vouched_by uuid,
  detail     text,
  ts         timestamptz default now(),
  decided_at timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists events_owner_idx        on public.events (owner);
create index if not exists events_fingerprint_idx  on public.events (fingerprint);
create index if not exists events_collabs_idx      on public.events using gin (collabs);

create index if not exists athletes_name_idx       on public.athletes (name);

create index if not exists entries_event_idx        on public.entries (event_id);
create index if not exists entries_helm_athlete_idx on public.entries (helm_athlete_id);
create index if not exists entries_crew_athlete_idx on public.entries (crew_athlete_id);
create index if not exists entries_helm_name_idx    on public.entries (helm_name);
create index if not exists entries_crew_name_idx    on public.entries (crew_name);

create index if not exists verifications_athlete_idx on public.verifications (athlete_id);

create unique index if not exists profiles_username_uniq
  on public.profiles (lower(username)) where (username is not null);

create index if not exists host_members_host_idx on public.host_members (host_id);
create index if not exists host_members_user_idx on public.host_members (user_id);

create index if not exists host_invites_host_idx on public.host_invites (host_id);
create index if not exists host_invites_short_code_idx on public.host_invites (short_code);
create unique index if not exists host_invites_short_code_uniq
  on public.host_invites (upper(short_code)) where (short_code is not null);

create index if not exists host_audit_host_idx on public.host_audit (host_id);

create index if not exists athlete_claims_profile_idx on public.athlete_claims (profile_name);
create index if not exists athlete_claims_status_idx  on public.athlete_claims (status);
create index if not exists athlete_claims_user_idx    on public.athlete_claims (user_id);

create index if not exists event_claims_event_idx on public.event_claims (event_id);
create index if not exists event_claims_host_idx  on public.event_claims (host_id);

-- ── Triggers ─────────────────────────────────────────────────────────────────
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.events         enable row level security;
alter table public.athletes       enable row level security;
alter table public.entries        enable row level security;
alter table public.verifications  enable row level security;
alter table public.profiles       enable row level security;
alter table public.hosts          enable row level security;
alter table public.host_members   enable row level security;
alter table public.host_invites   enable row level security;
alter table public.host_audit     enable row level security;
alter table public.athlete_claims enable row level security;
alter table public.event_claims   enable row level security;

-- events: public read + public write (results are open data) -------------------
drop policy if exists public_read_events  on public.events;
create policy public_read_events  on public.events for select using (true);
drop policy if exists public_write_events on public.events;
create policy public_write_events on public.events for all using (true) with check (true);

-- athletes ---------------------------------------------------------------------
drop policy if exists public_read_athletes  on public.athletes;
create policy public_read_athletes  on public.athletes for select using (true);
drop policy if exists public_write_athletes on public.athletes;
create policy public_write_athletes on public.athletes for all using (true) with check (true);

-- entries ----------------------------------------------------------------------
drop policy if exists public_read_entries  on public.entries;
create policy public_read_entries  on public.entries for select using (true);
drop policy if exists public_write_entries on public.entries;
create policy public_write_entries on public.entries for all using (true) with check (true);

-- verifications ----------------------------------------------------------------
drop policy if exists public_read_verif  on public.verifications;
create policy public_read_verif  on public.verifications for select using (true);
drop policy if exists public_write_verif on public.verifications;
create policy public_write_verif on public.verifications for all using (true) with check (true);

-- hosts: public read; writes currently open (app-gated, not RLS-gated) ---------
drop policy if exists hosts_read  on public.hosts;
create policy hosts_read  on public.hosts for select using (true);
drop policy if exists hosts_write on public.hosts;
create policy hosts_write on public.hosts for all using (true) with check (true);

-- profiles: owner-scoped + admin read/delete -----------------------------------
drop policy if exists profiles_read_own   on public.profiles;
create policy profiles_read_own   on public.profiles for select using (auth.uid() = user_id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin reads all profiles" on public.profiles;
create policy "admin reads all profiles" on public.profiles for select using (is_athlink_admin());
drop policy if exists "admin deletes profiles" on public.profiles;
create policy "admin deletes profiles" on public.profiles for delete using (is_athlink_admin());

-- host_members: members manage own host; admin read/delete ---------------------
drop policy if exists hm_read          on public.host_members;
create policy hm_read          on public.host_members for select using (true);
drop policy if exists hm_insert_self   on public.host_members;
create policy hm_insert_self   on public.host_members for insert with check (user_id = auth.uid());
drop policy if exists hm_update_member on public.host_members;
create policy hm_update_member on public.host_members for update using (is_host_member(host_id)) with check (is_host_member(host_id));
drop policy if exists hm_delete_member on public.host_members;
create policy hm_delete_member on public.host_members for delete using (is_host_member(host_id));
drop policy if exists "admin reads all members" on public.host_members;
create policy "admin reads all members" on public.host_members for select using (is_athlink_admin());
drop policy if exists "admin deletes members"  on public.host_members;
create policy "admin deletes members"  on public.host_members for delete using (is_athlink_admin());

-- host_invites -----------------------------------------------------------------
drop policy if exists hi_read          on public.host_invites;
create policy hi_read          on public.host_invites for select using (true);
drop policy if exists hi_insert_member on public.host_invites;
create policy hi_insert_member on public.host_invites for insert with check (is_host_member(host_id));
drop policy if exists hi_update_redeem on public.host_invites;
create policy hi_update_redeem on public.host_invites for update using (true) with check (true);
drop policy if exists hi_delete_member on public.host_invites;
create policy hi_delete_member on public.host_invites for delete using (is_host_member(host_id));

-- host_audit -------------------------------------------------------------------
drop policy if exists ha_read_member on public.host_audit;
create policy ha_read_member on public.host_audit for select using (is_host_member(host_id));
drop policy if exists ha_insert_self on public.host_audit;
create policy ha_insert_self on public.host_audit for insert with check (actor_user_id = auth.uid());

-- athlete_claims ---------------------------------------------------------------
drop policy if exists ac_read         on public.athlete_claims;
create policy ac_read         on public.athlete_claims for select using (true);
drop policy if exists ac_insert_self  on public.athlete_claims;
create policy ac_insert_self  on public.athlete_claims for insert with check (user_id = auth.uid());
drop policy if exists ac_update_member on public.athlete_claims;
create policy ac_update_member on public.athlete_claims for update using (
  exists (
    select 1 from public.host_members
    where host_members.user_id = auth.uid()
      and host_members.status = 'active'
      and host_members.verified = true
  )
) with check (true);
drop policy if exists ac_delete_self  on public.athlete_claims;
create policy ac_delete_self  on public.athlete_claims for delete using (user_id = auth.uid());
drop policy if exists "admin deletes claims" on public.athlete_claims;
create policy "admin deletes claims" on public.athlete_claims for delete using (is_athlink_admin());

-- event_claims (authenticated-only) --------------------------------------------
drop policy if exists event_claims_select on public.event_claims;
create policy event_claims_select on public.event_claims for select to authenticated using (true);
drop policy if exists event_claims_insert on public.event_claims;
create policy event_claims_insert on public.event_claims for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists event_claims_update on public.event_claims;
create policy event_claims_update on public.event_claims for update to authenticated using (
  is_athlink_admin() or exists (
    select 1 from public.host_members m
    where m.host_id = event_claims.host_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.verified = true
      and m.role = any (array['owner','editor'])
  )
);

-- PostgREST must reload its schema cache after any DDL.
notify pgrst, 'reload schema';
