-- 0005_athlete_profiles_admin_write.sql
-- Extend the athlete_profiles write policy so an AthLink admin can edit ANY
-- profile's extras (needed for dev/admin editing in the UI), in addition to the
-- profile's own verified owner. Read stays public.
--
-- NOTE: is_athlink_admin() is currently a placeholder that returns true for any
-- logged-in user (see CLAUDE.md action items). Once it's restricted to real
-- admin UUIDs, this policy automatically tightens with it.
--
-- Idempotent: safe to re-run. After applying:  NOTIFY pgrst, 'reload schema';

drop policy if exists athlete_profiles_write_owner on public.athlete_profiles;
create policy athlete_profiles_write_owner
  on public.athlete_profiles
  for all
  to authenticated
  using (
    is_athlink_admin()
    or exists (
      select 1 from public.athlete_claims c
      where c.user_id = auth.uid()
        and c.status = 'approved'
        and lower(btrim(c.profile_name)) = athlete_profiles.name_key
    )
  )
  with check (
    updated_by = auth.uid()
    and (
      is_athlink_admin()
      or exists (
        select 1 from public.athlete_claims c
        where c.user_id = auth.uid()
          and c.status = 'approved'
          and lower(btrim(c.profile_name)) = athlete_profiles.name_key
      )
    )
  );

notify pgrst, 'reload schema';
