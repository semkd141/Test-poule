-- Squad side label: API-Football `lineups[].team.name` / `players[].team.name` (see fixture.json).
-- Idempotent: some DBs never had `fixture_squad_members_league_season_country_idx` (optional earlier migration).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fixture_squad_members'
      AND column_name = 'country'
  ) THEN
    ALTER TABLE public.fixture_squad_members RENAME COLUMN country TO team;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'fixture_squad_members_country_idx'
  ) THEN
    ALTER INDEX public.fixture_squad_members_country_idx RENAME TO fixture_squad_members_team_idx;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'fixture_squad_members_team_idx'
  ) THEN
    CREATE INDEX IF NOT EXISTS fixture_squad_members_team_idx ON public.fixture_squad_members (team);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'fixture_squad_members_league_season_country_idx'
  ) THEN
    ALTER INDEX public.fixture_squad_members_league_season_country_idx RENAME TO fixture_squad_members_league_season_team_idx;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'fixture_squad_members_league_season_team_idx'
  ) THEN
    CREATE INDEX IF NOT EXISTS fixture_squad_members_league_season_team_idx
      ON public.fixture_squad_members (api_football_league_id, season, team);
  END IF;
END $$;

COMMENT ON COLUMN public.fixture_squad_members.team IS 'Lineup side name from API-Football fixtures (lineups[].team.name, e.g. Wales / England).';
