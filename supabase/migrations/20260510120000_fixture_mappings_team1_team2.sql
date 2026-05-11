-- fixture_mappings: neutral side labels (not home/away).

ALTER TABLE public.fixture_mappings
  RENAME COLUMN home_team TO team_1;

ALTER TABLE public.fixture_mappings
  RENAME COLUMN away_team TO team_2;
