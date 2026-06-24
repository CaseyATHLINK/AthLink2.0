-- custom_classes_migration.sql
-- Persists the in-memory CUSTOM_CLASSES runtime registry (src/App.jsx) to Postgres.
-- Mirrors the JS object shape exactly: { id, short, full, color, canonical }.
--   id        — stable class id referenced by events.cls etc., format "custom:<canonical>"
--   canonical — normalised dedup key: lower-case, punctuation/whitespace stripped
--   short     — readable name as the host typed it (used as display label)
--   full      — long name; currently seeded equal to `short` in app code
--   color     — auto-assigned hex from CUSTOM_CLASS_PALETTE (navy-muted)
-- After running, the app can drop the "in-memory only" caveat and load/insert here.

create table if not exists public.custom_classes (
  id            text primary key,
  canonical     text not null unique,
  short         text not null,
  full          text not null,
  color         text not null,
  -- Provenance: which signed-in user created it (verified-host gating is enforced
  -- by the insert policy below). Nullable so seeds/back-fills don't require an author.
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  -- id must be exactly "custom:" + canonical, matching addCustomClass() in App.jsx.
  constraint custom_classes_id_format check (id = 'custom:' || canonical),
  -- canonical must be the normalised slug: lower-case alphanumerics only, non-empty.
  constraint custom_classes_canonical_format check (canonical ~ '^[a-z0-9]+$')
);

comment on table public.custom_classes is
  'Host-created boat classes beyond the four built-in CLASSES. Mirrors the CUSTOM_CLASSES registry in src/App.jsx.';

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.custom_classes enable row level security;

-- Read: classes are global reference data — anyone (incl. anon) may read them.
drop policy if exists custom_classes_select_all on public.custom_classes;
create policy custom_classes_select_all
  on public.custom_classes
  for select
  using (true);

-- Insert: only an active, *verified* host may create a custom class
-- (matches the "+ Other class" gating — verified=true on host_members).
drop policy if exists custom_classes_insert_verified_host on public.custom_classes;
create policy custom_classes_insert_verified_host
  on public.custom_classes
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.host_members hm
      where hm.user_id = auth.uid()
        and hm.verified = true
        and hm.status = 'active'
    )
  );

-- No update/delete policies: custom classes are append-only + dedup'd by canonical.
-- (Add an admin-only delete policy later if cleanup tooling is needed.)

-- PostgREST must reload its schema cache after any DDL.
notify pgrst, 'reload schema';
