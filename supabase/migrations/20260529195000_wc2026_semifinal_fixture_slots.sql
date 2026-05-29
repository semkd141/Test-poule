INSERT INTO public.fixture_mappings (
  api_football_league_id,
  season,
  local_key,
  api_fixture_id,
  stage,
  kickoff_at,
  team_1,
  team_2,
  location
)
VALUES
  (1, 2026, 'semi-01', NULL, 'semi', NULL, NULL, NULL, NULL),
  (1, 2026, 'semi-02', NULL, 'semi', NULL, NULL, NULL, NULL)
ON CONFLICT (api_football_league_id, season, local_key) DO NOTHING;
