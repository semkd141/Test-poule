-- fixture_mappings: scope by API-Football league + season (shared across all pools for that tournament).
-- Replaces competition_id FK so deleting one pool does not remove shared fixture rows.

ALTER TABLE public.fixture_mappings
  ADD COLUMN IF NOT EXISTS api_football_league_id bigint,
  ADD COLUMN IF NOT EXISTS season integer;

-- Backfill from parent competition (pre-drop).
UPDATE public.fixture_mappings fm
SET
  api_football_league_id = COALESCE(NULLIF(c.api_football_league_id, 0), 1),
  season = COALESCE(
    NULLIF(TRIM(COALESCE(c.metadata->'api_football'->>'season', '')), '')::integer,
    CASE
      WHEN c.league_type IS NOT NULL AND (
        c.league_type ILIKE '%premier%' OR LOWER(TRIM(c.league_type)) = 'premier_league'
      ) THEN 2024
      WHEN c.league_type IS NOT NULL AND (
        c.league_type ILIKE '%champions%' OR LOWER(TRIM(c.league_type)) = 'champions_league'
      ) THEN 2024
      ELSE 2026
    END
  )
FROM public.competitions c
WHERE fm.competition_id = c.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.fixture_mappings
    WHERE api_football_league_id IS NULL OR season IS NULL
  ) THEN
    RAISE EXCEPTION 'fixture_mappings: backfill left null api_football_league_id or season';
  END IF;
END $$;

ALTER TABLE public.fixture_mappings
  DROP CONSTRAINT IF EXISTS fixture_mappings_competition_id_fkey;

ALTER TABLE public.fixture_mappings
  DROP CONSTRAINT IF EXISTS fixture_mappings_competition_id_local_key_key;

DROP INDEX IF EXISTS fixture_mappings_competition_api_fixture_unique;
DROP INDEX IF EXISTS fixture_mappings_competition_idx;

ALTER TABLE public.fixture_mappings DROP COLUMN IF EXISTS competition_id;

ALTER TABLE public.fixture_mappings
  ALTER COLUMN api_football_league_id SET NOT NULL,
  ALTER COLUMN season SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fixture_mappings_league_season_local_key_unique
  ON public.fixture_mappings (api_football_league_id, season, local_key);

CREATE UNIQUE INDEX IF NOT EXISTS fixture_mappings_league_season_api_fixture_unique
  ON public.fixture_mappings (api_football_league_id, season, api_fixture_id)
  WHERE api_fixture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fixture_mappings_league_season_idx
  ON public.fixture_mappings (api_football_league_id, season);

COMMENT ON COLUMN public.fixture_mappings.api_football_league_id IS 'API-Football leagues.id; rows are shared for all app competitions with this league + season.';
COMMENT ON COLUMN public.fixture_mappings.season IS 'API-Football season year (e.g. 2022, 2026).';
