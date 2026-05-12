-- Standalone: recreate public.fixture_mappings after DROP.
-- Rows are scoped by API-Football league + season (shared by all app pools for that tournament).
-- Then load schedule: run seed_wc2026_fixture_mappings.sql (same folder) or use API import.

DROP TABLE IF EXISTS public.fixture_mappings;

CREATE TABLE public.fixture_mappings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_football_league_id bigint NOT NULL,
  season integer NOT NULL,
  local_key text NOT NULL,
  api_fixture_id bigint,
  stage text NOT NULL DEFAULT 'group',
  kickoff_at timestamptz,
  team_1 text,
  team_2 text,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_football_league_id, season, local_key)
);

CREATE UNIQUE INDEX fixture_mappings_league_season_api_fixture_unique
  ON public.fixture_mappings (api_football_league_id, season, api_fixture_id)
  WHERE api_fixture_id IS NOT NULL;

CREATE INDEX fixture_mappings_league_season_idx
  ON public.fixture_mappings (api_football_league_id, season);
