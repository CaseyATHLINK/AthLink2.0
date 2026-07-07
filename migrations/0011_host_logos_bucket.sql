-- 0011_host_logos_bucket.sql
-- Public storage bucket for host/association portal logos. The client uploads a
-- PRE-PROCESSED navy-monochrome-on-transparent PNG (recolor baked in App.jsx at
-- save time via uploadHostLogo/recolorLogoToNavy), so this only needs to accept
-- PNG (+ webp) and be publicly readable. The recolored URL is written to the
-- existing hosts.logo_url column (added in 0008 — this SUPERSEDES that data-URL
-- approach with a real bucket).
-- Public read; authenticated write — mirrors athlete-media policies. Edit-UI
-- gating is enforced client-side by canManageMembers; DB writes still hit RLS.
-- Idempotent: safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('host-logos','host-logos', true, 5242880,
        array['image/png','image/webp'])
on conflict (id) do update
  set public=excluded.public,
      file_size_limit=excluded.file_size_limit,
      allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists host_logos_read   on storage.objects;
drop policy if exists host_logos_insert on storage.objects;
drop policy if exists host_logos_update on storage.objects;
drop policy if exists host_logos_delete on storage.objects;

create policy host_logos_read   on storage.objects
  for select to public       using (bucket_id = 'host-logos');
create policy host_logos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'host-logos');
create policy host_logos_update on storage.objects
  for update to authenticated using (bucket_id = 'host-logos') with check (bucket_id = 'host-logos');
create policy host_logos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'host-logos');

notify pgrst, 'reload schema';
