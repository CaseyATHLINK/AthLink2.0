-- 0014_scout_portal.sql
-- Scout portal (Casey, 2026-07-15): watchlist "binders" of athletes with
-- polymorphic saved "clips" (results / events / upcoming entry lists / links /
-- chart snapshots), scouting notes with rubric scores, public "Result
-- Highlights" pins (athletes/hosts, max 3), an append-only activity ledger
-- (stored from day one, revealed later — freemium phase), and digest prefs.
--
-- `owner` is TEXT, not a uuid FK: signed-in users store auth.uid(); the
-- signed-out/dev flows store a per-browser anon id ("anon_<rand>") so the
-- portal works before the auth phase (same app-gated stance as 0013).
-- `athlete_key` is the normalised athlete name key used by athlete_profiles /
-- athlete_usernames (results are PDF-sourced; the athletes table is unused).
-- Every clip/pin carries a `snapshot` jsonb of its display data at save time —
-- events get re-imported/merged, so FKs are best-effort live links
-- (on delete set null) and the UI falls back to the snapshot.
--
-- ⚠ SECURITY TRADE-OFF (same as 0013, accepted for this phase): policies are
-- permissive (`using (true)`) — reads/writes are app-gated, not RLS-gated.
-- The auth/monetisation phase must replace them with owner-keyed policies
-- (and scout_notes MUST become owner-read-only before real scout accounts).
--
-- Idempotent: safe to re-run. Ends with:  NOTIFY pgrst, 'reload schema';

-- ── binders: a scout's watchlist folders ────────────────────────────────────
create table if not exists public.scout_binders (
  id         uuid primary key default gen_random_uuid(),
  owner      text not null,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists scout_binders_owner_idx on public.scout_binders(owner);
alter table public.scout_binders enable row level security;
drop policy if exists scout_binders_read  on public.scout_binders;
create policy scout_binders_read  on public.scout_binders for select using (true);
drop policy if exists scout_binders_write on public.scout_binders;
create policy scout_binders_write on public.scout_binders for all using (true) with check (true);

-- ── clips: polymorphic saved items inside a binder ──────────────────────────
--    kind=athlete  → the binder's spine (a watched athlete; athlete_key set)
--    kind=result   → one athlete's placement in one event (entry_id + event_id)
--    kind=event    → a whole competition
--    kind=upcoming → an entry list published before racing (fleet-forecast page)
--    kind=snapshot → a frozen chart/stat blob (all in `snapshot`)
--    kind=link     → an external URL (video, article)
create table if not exists public.scout_clips (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null,
  binder_id   uuid references public.scout_binders(id) on delete cascade,
  kind        text not null check (kind in ('athlete','result','event','upcoming','snapshot','link')),
  athlete_key text,
  event_id    uuid references public.events(id)  on delete set null,
  entry_id    uuid references public.entries(id) on delete set null,
  url         text,
  title       text,
  snapshot    jsonb not null default '{}'::jsonb,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists scout_clips_owner_idx   on public.scout_clips(owner);
create index if not exists scout_clips_binder_idx  on public.scout_clips(binder_id);
create index if not exists scout_clips_athlete_idx on public.scout_clips(athlete_key);
alter table public.scout_clips enable row level security;
drop policy if exists scout_clips_read  on public.scout_clips;
create policy scout_clips_read  on public.scout_clips for select using (true);
drop policy if exists scout_clips_write on public.scout_clips;
create policy scout_clips_write on public.scout_clips for all using (true) with check (true);

-- ── notes: scouting observations, attached to an athlete (optionally pinned
--    to one event), with quick-tap rubric scores {starts:4, speed:5, ...} ────
create table if not exists public.scout_notes (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null,
  athlete_key text not null,
  event_id    uuid references public.events(id) on delete set null,
  body        text not null default '',
  rubric      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists scout_notes_owner_idx   on public.scout_notes(owner);
create index if not exists scout_notes_athlete_idx on public.scout_notes(athlete_key);
alter table public.scout_notes enable row level security;
drop policy if exists scout_notes_read  on public.scout_notes;
create policy scout_notes_read  on public.scout_notes for select using (true);
drop policy if exists scout_notes_write on public.scout_notes;
create policy scout_notes_write on public.scout_notes for all using (true) with check (true);

-- ── pinned "Result Highlights": public, max 3 slots (0-2) per profile ───────
--    owner_kind=athlete → owner_key is the athlete_key
--    owner_kind=host    → owner_key is hosts.id (as text)
create table if not exists public.pinned_results (
  id         uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('athlete','host')),
  owner_key  text not null,
  entry_id   uuid references public.entries(id) on delete set null,
  event_id   uuid references public.events(id)  on delete set null,
  snapshot   jsonb not null default '{}'::jsonb,
  sort_order int  not null default 0 check (sort_order between 0 and 2),
  created_at timestamptz not null default now(),
  unique (owner_kind, owner_key, sort_order)
);
create index if not exists pinned_results_owner_idx on public.pinned_results(owner_kind, owner_key);
alter table public.pinned_results enable row level security;
drop policy if exists pinned_results_read  on public.pinned_results;
create policy pinned_results_read  on public.pinned_results for select using (true);
drop policy if exists pinned_results_write on public.pinned_results;
create policy pinned_results_write on public.pinned_results for all using (true) with check (true);

-- ── activity ledger: append-only "who looked at / saved whom". No UI reveals
--    identities yet — the data is banked for the freemium phase. ─────────────
create table if not exists public.scout_activity (
  id          bigint generated always as identity primary key,
  actor       text,
  athlete_key text not null,
  kind        text not null check (kind in ('viewed_profile','saved_result','added_watchlist')),
  created_at  timestamptz not null default now()
);
create index if not exists scout_activity_athlete_idx on public.scout_activity(athlete_key, created_at);
alter table public.scout_activity enable row level security;
drop policy if exists scout_activity_read  on public.scout_activity;
create policy scout_activity_read  on public.scout_activity for select using (true);
drop policy if exists scout_activity_write on public.scout_activity;
create policy scout_activity_write on public.scout_activity for insert with check (true);

-- ── digest prefs: per-binder (or global, binder_id null) report settings ────
create table if not exists public.scout_digest_prefs (
  id         uuid primary key default gen_random_uuid(),
  owner      text not null,
  binder_id  uuid references public.scout_binders(id) on delete cascade,
  kind       text not null default 'watchlist',
  frequency  text not null default 'weekly',
  filters    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists scout_digest_prefs_owner_idx on public.scout_digest_prefs(owner);
alter table public.scout_digest_prefs enable row level security;
drop policy if exists scout_digest_prefs_read  on public.scout_digest_prefs;
create policy scout_digest_prefs_read  on public.scout_digest_prefs for select using (true);
drop policy if exists scout_digest_prefs_write on public.scout_digest_prefs;
create policy scout_digest_prefs_write on public.scout_digest_prefs for all using (true) with check (true);

notify pgrst, 'reload schema';
