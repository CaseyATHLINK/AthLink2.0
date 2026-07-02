-- 0009_athlete_media.sql
-- Athlete-owned media gallery (photos + uploaded videos) layered on the
-- auto-built profile. Items live as a JSON array on athlete_profiles; each item:
--   { "url": "<public storage url>", "type": "image" | "video", "caption": "" }
-- Files are uploaded to the existing public `athlete-photos` bucket under a
-- `media/` path prefix (see uploadAthleteMedia in src/App.jsx), so no new bucket
-- is required. Read is public and write is owner-gated by the table's existing
-- RLS policies (migrations/0004_athlete_profiles.sql + 0005), which apply to the
-- new column automatically.
--
-- Idempotent: safe to re-run.

alter table public.athlete_profiles
  add column if not exists media jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
