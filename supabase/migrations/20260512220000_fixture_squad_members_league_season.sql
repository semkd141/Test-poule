-- Denormalize API-Football league + season on squad rows (same meaning as fixture_mappings.api_football_league_id / season).

ALTER TABLE public.fixture_squad_members
  ADD COLUMN IF NOT EXISTS api_football_league_id bigint,
  ADD COLUMN IF NOT EXISTS season integer;

CREATE INDEX IF NOT EXISTS fixture_squad_members_league_season_idx
  ON public.fixture_squad_members (api_football_league_id, season);

COMMENT ON COLUMN public.fixture_squad_members.api_football_league_id IS 'API-Football leagues.id for this fixture (from /fixtures league.id or pool fixture_mappings).';
COMMENT ON COLUMN public.fixture_squad_members.season IS 'API-Football season year for this fixture (from /fixtures league.season or pool fixture_mappings).';
