-- 0017_claim_role_gating.sql
-- Athlete-claim role gating (Casey, 2026-07-16): only ATHLETE accounts may
-- claim an athlete profile, and an account can hold at most ONE live
-- (pending or approved) claim — ever. Before this, ac_insert_self let ANY
-- authenticated user (scout/host/fan) file a claim; a scout-account claim on
-- a profile existed in prod (removed by the backfill below), and 0003's
-- indexes only guarded the APPROVED stage.
--
-- NOTE deliberately NO `is_athlink_admin() OR …` branch here: the placeholder
-- still returns true for every authenticated user (see 0015 header), so an
-- admin branch would neuter the whole policy. Admins approve/deny claims
-- (ac_update_member / delete policies) — they don't file them.
--
-- Idempotent: create-or-replace / drop-if-exists / if-not-exists throughout.
-- Ends with:  NOTIFY pgrst, 'reload schema';

-- The signed-in account is an athlete account (profiles.role = 'athlete').
-- security definer so the check doesn't depend on profiles' RLS.
create or replace function public.is_athlete_account()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role = 'athlete'
  );
$function$;

-- The signed-in account already holds a live (non-denied) claim. security
-- definer also avoids self-referential RLS evaluation on athlete_claims.
create or replace function public.has_live_athlete_claim()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select exists (
    select 1 from public.athlete_claims
    where user_id = auth.uid()
      and status <> 'denied'
  );
$function$;

-- Backfill: drop live claims filed by non-athlete accounts (the bug this
-- migration closes). Denied rows are left as history. One row matched on
-- 2026-07-16 (a scout-account claim); re-runs match zero.
delete from public.athlete_claims ac
 using public.profiles p
 where p.user_id = ac.user_id
   and p.role <> 'athlete'
   and ac.status <> 'denied';

-- One LIVE claim per user, at any stage — tightens 0003's approved-only
-- guarantee so a user can't hold pending claims on several profiles either.
create unique index if not exists uniq_live_claim_per_user
  on public.athlete_claims (user_id)
  where status <> 'denied';

-- Claims: self-filed + athlete account + no live claim yet.
drop policy if exists ac_insert_self on public.athlete_claims;
create policy ac_insert_self on public.athlete_claims
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_athlete_account()
    and not public.has_live_athlete_claim()
  );

notify pgrst, 'reload schema';
