-- Idempotent: older DBs may have run 20260506140600 before `location` existed.
-- Full schedule seed with location is in 20260506140600 (re-run only on fresh migrate or manual).

ALTER TABLE public.fixture_mappings ADD COLUMN IF NOT EXISTS location text;
