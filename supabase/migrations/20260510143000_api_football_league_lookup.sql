-- Lookup: app league_type → API-Football `leagues.id` (for /fixtures?league=&season=).

CREATE TABLE IF NOT EXISTS public.api_football_league_lookup (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_type text NOT NULL,
  league_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_football_league_lookup_type_unique UNIQUE (league_type)
);

COMMENT ON TABLE public.api_football_league_lookup IS 'Maps league_type (app string) to API-Football league id.';
COMMENT ON COLUMN public.api_football_league_lookup.league_type IS 'Application key, e.g. world_cup, euros, premier_league.';
COMMENT ON COLUMN public.api_football_league_lookup.league_id IS 'API-Football leagues.id (v3).';

CREATE INDEX IF NOT EXISTS api_football_league_lookup_league_id_idx
  ON public.api_football_league_lookup (league_id);

ALTER TABLE public.api_football_league_lookup ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.api_football_league_lookup TO anon, authenticated;

DROP POLICY IF EXISTS api_football_league_lookup_select_public ON public.api_football_league_lookup;
CREATE POLICY api_football_league_lookup_select_public
  ON public.api_football_league_lookup
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Example data — verify ids against https://www.api-football.com/documentation-v3#tag/Leagues (or your plan’s league list).
INSERT INTO public.api_football_league_lookup (league_type, league_id) VALUES
  ('world_cup', 1),
  ('premier_league', 39),
  ('champions_league', 2),
  ('UEFA Europa League', 3)
ON CONFLICT (league_type) DO UPDATE
  SET league_id = EXCLUDED.league_id;
