-- 0003_athlete_claim_constraints.sql
-- Athlete-claim integrity rules, enforced at the DB level (not just the UI).
--
-- Model: MULTIPLE people may submit PENDING claims on the same profile, but a
-- profile can have at most ONE APPROVED owner, and a user can own at most ONE
-- profile. When a host approves one claim, the app rejects the sibling pending
-- claims for that profile (application logic), and these indexes guarantee the
-- "only one approved" invariant even against races or direct API calls.
--
-- Idempotent: safe to re-run. After applying:  NOTIFY pgrst, 'reload schema';

-- One APPROVED claim per profile (case-insensitive name). Pending duplicates allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_approved_claim_per_profile
  ON athlete_claims (lower(profile_name))
  WHERE status = 'approved';

-- One APPROVED claim per user (a person can own only one profile).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_approved_claim_per_user
  ON athlete_claims (user_id)
  WHERE status = 'approved';

-- Stop a single user from spamming duplicate PENDING claims on the same profile.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_claim_per_user_profile
  ON athlete_claims (user_id, lower(profile_name))
  WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
