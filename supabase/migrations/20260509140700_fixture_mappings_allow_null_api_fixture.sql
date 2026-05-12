-- Replace UNIQUE NULLS NOT DISTINCT (competition_id, api_fixture_id): it allows only one row with
-- api_fixture_id IS NULL per competition. Seed inserts many unmapped rows (NULL); use a partial unique index instead.

ALTER TABLE public.fixture_mappings DROP CONSTRAINT IF EXISTS fixture_mappings_competition_id_api_fixture_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS fixture_mappings_competition_api_fixture_unique
  ON public.fixture_mappings (competition_id, api_fixture_id)
  WHERE api_fixture_id IS NOT NULL;
