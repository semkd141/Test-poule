-- API-Football fixture squads: players + coaches (one row per person per fixture).
-- `country` = national team / club name from the API `team.name`.
-- `fixture_squad_fetched` records that we already called the upstream API for this fixture_id
-- (so we skip the API when all squad rows were filtered out by the “existing country” rule).

CREATE TABLE IF NOT EXISTS public.fixture_squad_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_id bigint NOT NULL,
  name text,
  country text,
  player_id bigint NOT NULL,
  pos text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixture_squad_members_fixture_player_pos_unique UNIQUE (fixture_id, player_id, pos)
);

CREATE INDEX IF NOT EXISTS fixture_squad_members_fixture_idx ON public.fixture_squad_members (fixture_id);
CREATE INDEX IF NOT EXISTS fixture_squad_members_country_idx ON public.fixture_squad_members (country);

COMMENT ON TABLE public.fixture_squad_members IS 'Squad lines from API-Football fixtures (lineups + optional /fixtures/players stats); coaches use pos = Coach.';

CREATE TABLE IF NOT EXISTS public.fixture_squad_fetched (
  fixture_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fixture_squad_fetched IS 'Fixture ids for which the backend already performed an API-Football fetch for squad import.';
