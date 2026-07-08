-- 0012_host_dossier.sql
-- Host auto-grab (AI onboarding): store the confirmed web-research dossier on the
-- host row. Populated when a signing-up host confirms the "Is this you?" card
-- (api/research_host.py, mode=identity) and extended by the discovery view
-- (mode=competitions). Shape:
--   {
--     "identity":     { official_name, acronym, website, country, classes[], blurb },
--     "competitions": [ { name, year, class, url, kind } ],
--     "pending_import": [ <competition keys the host selected to import> ],
--     "needs_review":  [ <low-confidence parse results awaiting host review> ],
--     "fetched_at":   "<ISO timestamp>",
--     "confirmed":    true
--   }
-- All keys optional; the frontend treats a missing dossier as "no research yet".
--
-- No new RLS needed: the dossier column lives on `hosts`, whose existing write
-- policies already restrict writes to the host's owner/admins. In practice the
-- dossier is written by the signing-up OWNER (via the normal host save path) and
-- is world-readable like the rest of the host row. The `verified` gate on bulk
-- import is enforced in the app + by RLS on `events`, not on this column.
--
-- Idempotent: safe to re-run.

alter table public.hosts
  add column if not exists dossier jsonb;

notify pgrst, 'reload schema';
