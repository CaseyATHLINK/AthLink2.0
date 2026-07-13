-- 0013_devmode_anon_writes.sql
-- Dev-mode admin editing WITHOUT a signed-in session (Casey's request, 2026-07-13).
--
-- Dev view (Ctrl/Cmd+Shift+D) already bypasses every gate client-side, but DB
-- writes still hit RLS, so nothing persisted while signed out. This migration
-- extends the "app-gated, not RLS-gated" stance the `hosts` table has had since
-- the baseline (hosts_write: using(true)) to the tables/buckets behind the
-- host + athlete settings pages, and adds the `site_content` table backing the
-- landing-page dev editor.
--
-- ⚠ SECURITY TRADE-OFF (accepted for this phase, same as hosts_write):
-- these anon policies mean writes are gated by the app, not the DB. Tighten
-- them together with is_athlink_admin() (still a placeholder — see CLAUDE.md
-- action items): once real admin UUIDs exist, drop the *_write_anon policies
-- and the anon storage policies below.
--
-- Idempotent: safe to re-run. After applying:  NOTIFY pgrst, 'reload schema';

-- ── athlete_profiles: allow anon writes (settings-page extras: bio, nat,
--    instagram, photo_url, media). updated_by is nullable, so anon rows carry
--    updated_by = null (readable as "edited via dev view"). ──────────────────
drop policy if exists athlete_profiles_write_anon on public.athlete_profiles;
create policy athlete_profiles_write_anon
  on public.athlete_profiles for all to anon
  using (true) with check (true);

-- ── athlete_usernames: allow anon writes (the "Profile link" field). ────────
drop policy if exists athlete_usernames_write_anon on public.athlete_usernames;
create policy athlete_usernames_write_anon
  on public.athlete_usernames for all to anon
  using (true) with check (true);

-- ── Storage buckets behind the settings pages: anon insert/update so photo /
--    media / logo uploads work signed-out. Read is already public; delete stays
--    authenticated-only. ──────────────────────────────────────────────────────
drop policy if exists athlete_photos_insert_anon on storage.objects;
create policy athlete_photos_insert_anon on storage.objects
  for insert to anon with check (bucket_id = 'athlete-photos');
drop policy if exists athlete_photos_update_anon on storage.objects;
create policy athlete_photos_update_anon on storage.objects
  for update to anon using (bucket_id = 'athlete-photos') with check (bucket_id = 'athlete-photos');

drop policy if exists athlete_media_insert_anon on storage.objects;
create policy athlete_media_insert_anon on storage.objects
  for insert to anon with check (bucket_id = 'athlete-media');
drop policy if exists athlete_media_update_anon on storage.objects;
create policy athlete_media_update_anon on storage.objects
  for update to anon using (bucket_id = 'athlete-media') with check (bucket_id = 'athlete-media');

drop policy if exists host_logos_insert_anon on storage.objects;
create policy host_logos_insert_anon on storage.objects
  for insert to anon with check (bucket_id = 'host-logos');
drop policy if exists host_logos_update_anon on storage.objects;
create policy host_logos_update_anon on storage.objects
  for update to anon using (bucket_id = 'host-logos') with check (bucket_id = 'host-logos');

-- ── site_content: copy overrides for static pages (landing). One row per page
--    id; `content` is a flat {slug: text} map merged over the hard-coded
--    defaults at load. Public read (the landing page is public); writes open
--    like hosts_write (app-gated to dev view). ────────────────────────────────
create table if not exists public.site_content (
  id         text primary key,
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
drop policy if exists site_content_read on public.site_content;
create policy site_content_read  on public.site_content for select using (true);
drop policy if exists site_content_write on public.site_content;
create policy site_content_write on public.site_content for all using (true) with check (true);

notify pgrst, 'reload schema';
