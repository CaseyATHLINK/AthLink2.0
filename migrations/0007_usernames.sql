-- 0007_usernames.sql
-- Persistent, editable public usernames for the flat URL scheme:
--   athletes → athlink.win/CaseyLaw    (from athlete_usernames.username)
--   hosts    → athlink.win/HKSF        (from hosts.slug; internal hosts.id stays)
--
-- Athlete identity is keyed by NAME (the app never had athlete ids), normalised
-- to name_key = lower(btrim(name)) — the SAME key athlete_profiles uses — so an
-- identical name stays ONE profile (per product decision). Default username is
-- FirstnameLastname (PascalCase, punctuation stripped); ties are broken by first
-- appearance (earliest entry) so the later one gets a trailing number. Usernames
-- must also dodge host slugs and reserved routes.
--
-- Idempotent: safe to re-run. After applying:  NOTIFY pgrst, 'reload schema';

-- ── helper: PascalCase a display name ─────────────────────────────────────
create or replace function public.athlink_pascal(txt text) returns text
language sql immutable as $$
  select coalesce(string_agg(initcap(w), ''), '')
  from unnest(
    regexp_split_to_array(
      btrim(regexp_replace(coalesce(txt,''), '[^A-Za-z0-9]+', ' ', 'g')),
      '\s+')
  ) as w
  where w <> '';
$$;

-- ── hosts: editable public slug ───────────────────────────────────────────
alter table public.hosts add column if not exists slug text;
create unique index if not exists hosts_slug_uniq
  on public.hosts (lower(slug)) where (slug is not null);

-- Backfill host slugs = PascalCase(name), numbered on collision, ordered oldest-first.
with h as (
  select id,
         athlink_pascal(name) as base,
         row_number() over (partition by lower(athlink_pascal(name))
                            order by created_at, id) as rn
  from public.hosts
  where slug is null and athlink_pascal(name) <> ''
)
update public.hosts t
set slug = case when h.rn = 1 then h.base else h.base || (h.rn - 1)::text end
from h where t.id = h.id;

-- ── athlete_usernames: the roster of public usernames, keyed by name_key ───
create table if not exists public.athlete_usernames (
  name_key     text primary key,
  username     text not null,
  display_name text,
  is_custom    boolean not null default false,  -- true once an owner edits it
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint athlete_usernames_key_norm check (name_key = lower(btrim(name_key)))
);
create unique index if not exists athlete_usernames_username_uniq
  on public.athlete_usernames (lower(username));

comment on table public.athlete_usernames is
  'Public URL username per athlete (keyed by normalised name). Default FirstnameLastname, owner-editable. Distinct from profiles.username (the account login handle).';

-- ── Backfill: one username per distinct athlete name, oldest-first ─────────
do $$
declare
  r     record;
  base  text;
  cand  text;
  n     int;
begin
  -- Seed the set of already-taken lowercased handles: reserved routes,
  -- existing host slugs, and any usernames already assigned.
  create temp table if not exists _taken(lc text primary key) on commit drop;
  insert into _taken(lc)
    values ('sailing'),('athletes'),('ranking'),('event'),('class'),('api'),('sailti')
    on conflict do nothing;
  insert into _taken(lc) select lower(slug) from public.hosts where slug is not null
    on conflict do nothing;
  insert into _taken(lc) select lower(username) from public.athlete_usernames
    on conflict do nothing;

  for r in
    select name_key, display_name, first_seen from (
      select lower(btrim(name)) as name_key,
             (array_agg(name order by created_at, name))[1] as display_name,
             min(created_at) as first_seen
      from (
        select helm_name as name, created_at from public.entries where coalesce(btrim(helm_name),'') <> ''
        union all
        select crew_name as name, created_at from public.entries where coalesce(btrim(crew_name),'') <> ''
      ) s
      group by lower(btrim(name))
    ) g
    where not exists (select 1 from public.athlete_usernames au where au.name_key = g.name_key)
    order by first_seen, name_key
  loop
    base := athlink_pascal(r.display_name);
    if base = '' then base := 'Athlete'; end if;
    cand := base; n := 0;
    while exists (select 1 from _taken t where t.lc = lower(cand)) loop
      n := n + 1; cand := base || n::text;
    end loop;
    insert into public.athlete_usernames(name_key, username, display_name)
      values (r.name_key, cand, r.display_name)
      on conflict (name_key) do nothing;
    insert into _taken(lc) values (lower(cand)) on conflict do nothing;
  end loop;
end $$;

-- ── Auto-assign a username to any newly-seen athlete on future imports ─────
create or replace function public.ensure_athlete_username() returns trigger
language plpgsql security definer as $$
declare nm text; nk text; base text; cand text; n int;
begin
  foreach nm in array array[new.helm_name, new.crew_name] loop
    if coalesce(btrim(nm),'') = '' then continue; end if;
    nk := lower(btrim(nm));
    if exists (select 1 from public.athlete_usernames where name_key = nk) then continue; end if;
    base := public.athlink_pascal(nm); if base = '' then base := 'Athlete'; end if;
    cand := base; n := 0;
    while exists (select 1 from public.athlete_usernames where lower(username) = lower(cand))
       or exists (select 1 from public.hosts where lower(slug) = lower(cand))
       or lower(cand) in ('sailing','athletes','ranking','event','class','api','sailti') loop
      n := n + 1; cand := base || n::text;
    end loop;
    insert into public.athlete_usernames(name_key, username, display_name)
      values (nk, cand, nm)
      on conflict (name_key) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists trg_ensure_athlete_username on public.entries;
create trigger trg_ensure_athlete_username
  after insert on public.entries
  for each row execute function public.ensure_athlete_username();

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.athlete_usernames enable row level security;

-- Read: public (URLs resolve for everyone).
drop policy if exists athlete_usernames_select_all on public.athlete_usernames;
create policy athlete_usernames_select_all
  on public.athlete_usernames for select using (true);

-- Write: the verified owner of that athlete (approved athlete_claims) or an admin.
drop policy if exists athlete_usernames_write_owner on public.athlete_usernames;
create policy athlete_usernames_write_owner
  on public.athlete_usernames for all to authenticated
  using (
    is_athlink_admin()
    or exists (
      select 1 from public.athlete_claims c
      where c.user_id = auth.uid() and c.status = 'approved'
        and lower(btrim(c.profile_name)) = athlete_usernames.name_key
    )
  )
  with check (
    is_athlink_admin()
    or exists (
      select 1 from public.athlete_claims c
      where c.user_id = auth.uid() and c.status = 'approved'
        and lower(btrim(c.profile_name)) = athlete_usernames.name_key
    )
  );

notify pgrst, 'reload schema';
