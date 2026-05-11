-- Per-fixture player lines + points (e.g. API-Football squad / pool punten per player).
-- fixture_id = API-Football fixture id, aligned with public.matches.external_fixture_id.

CREATE TABLE IF NOT EXISTS public.player_statistics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_id bigint NOT NULL REFERENCES public.matches (external_fixture_id) ON DELETE CASCADE,
  land text NOT NULL,
  speler_naam text NOT NULL,
  punten integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_statistics_fixture_player_unique UNIQUE (fixture_id, land, speler_naam)
);

CREATE INDEX IF NOT EXISTS player_statistics_fixture_idx ON public.player_statistics (fixture_id);

COMMENT ON TABLE public.player_statistics IS 'Player rows for a match: country (land), name (speler_naam), points (punten); keyed by API fixture id.';
COMMENT ON COLUMN public.player_statistics.fixture_id IS 'Same as matches.external_fixture_id (API-Football fixtures.id).';
COMMENT ON COLUMN public.player_statistics.land IS 'Country / team label for the player row.';
COMMENT ON COLUMN public.player_statistics.speler_naam IS 'Display name of the player (maps from JSON spelerNaam).';
COMMENT ON COLUMN public.player_statistics.punten IS 'Points attributed to this player for this fixture in the pool rules.';

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS applied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matches.applied IS 'True when fixture-derived stats/scoring for this row have been applied (e.g. to participants).';
