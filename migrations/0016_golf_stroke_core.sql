-- 0016_golf_stroke_core.sql
-- Golf stroke-play core: per-event scoring metadata on the SHARED events table.
-- The entries table is intentionally UNCHANGED — a golf round reuses entries.races[],
-- pdf_rank = finishing position, pdf_net = gross total, race_codes[] = per-round status.
-- Idempotent: safe to re-run. Sailing rows keep scoring_format NULL and are unaffected.

ALTER TABLE events ADD COLUMN IF NOT EXISTS scoring_format  text;   -- 'stroke' | (future) 'stableford' | 'match_play'
ALTER TABLE events ADD COLUMN IF NOT EXISTS rounds          int;    -- scheduled/played rounds (cut inference + "Sunday" = last round)
ALTER TABLE events ADD COLUMN IF NOT EXISTS cut_after_round int;    -- round the cut fell after; NULL = no cut
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_par      int;    -- par as printed on the document; NULL if silent

NOTIFY pgrst, 'reload schema';
