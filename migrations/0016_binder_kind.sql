-- 0016_binder_kind.sql
-- Binder namespaces as a real column (Casey, 2026-07-16): scout_binders.kind
-- says which folder namespace a binder belongs to —
--   'athletes' → watchlist folders (kind='athlete' clips only)
--   'results'  → saved results/events folders (result/event/upcoming/link clips)
-- #125 shipped this split as a "res::" prefix on scout_binders.name because
-- that session had no Supabase write access. The backfill below moves those
-- rows onto the column and strips the prefix from the stored name.
-- data/scout.js reads+writes the column from this migration on, keeping a
-- prefix-reading fallback for stragglers (rows written by a stale pre-0016
-- tab land as kind='athletes' with a "res::" name until touched).
--
-- Idempotent: safe to re-run — the column add is `if not exists`, and the
-- backfill matches zero rows on a re-run because no legit name starts with
-- "res::" (the client strips a typed prefix from user input).
-- Ends with:  NOTIFY pgrst, 'reload schema';

alter table public.scout_binders
  add column if not exists kind text not null default 'athletes'
  check (kind in ('athletes','results'));

update public.scout_binders
   set kind = 'results',
       name = substring(name from 6)
 where name like 'res::%';

notify pgrst, 'reload schema';
