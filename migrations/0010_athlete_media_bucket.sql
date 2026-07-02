-- 0010_athlete_media_bucket.sql
-- Storage bucket for the athlete media gallery (photos + uploaded videos).
-- The existing `athlete-photos` bucket is images-only with a 5MB cap, so video
-- needs its own bucket. Public read; authenticated write — mirrors the
-- athlete-photos policies exactly (edit-UI gating is enforced client-side by
-- isProfileOwner). Uploaded to by uploadAthleteMedia in src/App.jsx.
--
-- Idempotent: safe to re-run.

-- Bucket: public, 50MB per file, images + common web video types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-media', 'athlete-media', true, 52428800,
  array['image/png','image/jpeg','image/jpg','image/webp','image/gif',
        'video/mp4','video/quicktime','video/webm']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policies on storage.objects, scoped to this bucket.
drop policy if exists athlete_media_read   on storage.objects;
drop policy if exists athlete_media_insert on storage.objects;
drop policy if exists athlete_media_update on storage.objects;
drop policy if exists athlete_media_delete on storage.objects;

create policy athlete_media_read   on storage.objects
  for select to public        using (bucket_id = 'athlete-media');
create policy athlete_media_insert on storage.objects
  for insert to authenticated  with check (bucket_id = 'athlete-media');
create policy athlete_media_update on storage.objects
  for update to authenticated  using (bucket_id = 'athlete-media') with check (bucket_id = 'athlete-media');
create policy athlete_media_delete on storage.objects
  for delete to authenticated  using (bucket_id = 'athlete-media');
