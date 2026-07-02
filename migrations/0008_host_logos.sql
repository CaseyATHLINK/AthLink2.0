-- 0008_host_logos.sql
-- Adds a per-host logo so federations (and clubs/associations) can brand their
-- portal. Stored as a compact data URL (client downscales to <=256px PNG in
-- HostEditModal → src/App.jsx), so no storage bucket is required — the value is
-- written through the existing hosts REST PATCH/UPSERT path (saveHost).
--
-- Idempotent: safe to re-run.

alter table public.hosts
  add column if not exists logo_url text;

-- Make sure PostgREST picks up the new column immediately.
notify pgrst, 'reload schema';
