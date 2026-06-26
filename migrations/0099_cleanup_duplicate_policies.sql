-- =============================================================================
-- 0099_cleanup_duplicate_policies.sql   (OPTIONAL — review before running)
--
-- The live DB accumulated duplicate RLS policies from re-running near-identical
-- snippets in the SQL Editor. Each duplicate has the SAME predicate as its
-- canonical twin, so dropping it changes no behaviour — it only de-clutters.
--
-- 0001_baseline_schema.sql defines the canonical names this keeps. Run this
-- only against the live DB (it's a no-op on a fresh DB built from 0001).
-- =============================================================================

-- profiles: drop the space-named twins (keep the underscore-named canonical set)
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles read own"   on public.profiles;
drop policy if exists "profiles update own" on public.profiles;

-- hosts: drop the "_all" twins (keep hosts_read / hosts_write)
drop policy if exists hosts_read_all  on public.hosts;
drop policy if exists hosts_write_all on public.hosts;

notify pgrst, 'reload schema';
