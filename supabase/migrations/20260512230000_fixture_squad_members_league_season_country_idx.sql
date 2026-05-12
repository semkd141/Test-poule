CREATE INDEX IF NOT EXISTS fixture_squad_members_league_season_country_idx
  ON public.fixture_squad_members (api_football_league_id, season, country);
