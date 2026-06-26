-- 0006_dup_dismissals.sql
-- Remembers which near-duplicate athlete pairs the team has already reviewed
-- (merged OR explicitly "don't merge"), so the Duplicates tab never re-surfaces
-- the same pairs after a reload or on another device. Previously these lived
-- only in localStorage (per-browser), so decisions weren't truly remembered.
--
-- key = the dup group's key: the two canonical names, sorted, joined by "~".
-- Public read/write matches the existing permissive model for entries/events
-- (pre-launch). Idempotent. After applying:  NOTIFY pgrst, 'reload schema';

create table if not exists public.dup_dismissals (
  key         text primary key,
  created_at  timestamptz not null default now()
);

comment on table public.dup_dismissals is
  'Reviewed duplicate-athlete pairs (merged or kept-separate) to hide from the Duplicates tab across reloads/devices. key = sorted canonical name pair joined by ~.';

alter table public.dup_dismissals enable row level security;

drop policy if exists dup_dismissals_read on public.dup_dismissals;
create policy dup_dismissals_read on public.dup_dismissals for select using (true);

drop policy if exists dup_dismissals_write on public.dup_dismissals;
create policy dup_dismissals_write on public.dup_dismissals for all using (true) with check (true);

notify pgrst, 'reload schema';
