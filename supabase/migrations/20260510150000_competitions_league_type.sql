-- Link each competition to an API-Football league id via app-defined league_type (see api_football_league_lookup).

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS league_type text,
  ADD COLUMN IF NOT EXISTS api_football_league_id integer;

COMMENT ON COLUMN public.competitions.league_type IS 'Key matching api_football_league_lookup.league_type (e.g. world_cup).';
COMMENT ON COLUMN public.competitions.api_football_league_id IS 'API-Football leagues.id; copied from lookup when league_type is set.';

CREATE INDEX IF NOT EXISTS competitions_league_type_idx ON public.competitions (league_type);

UPDATE public.competitions c
SET
  league_type = 'world_cup',
  api_football_league_id = l.league_id
FROM public.api_football_league_lookup l
WHERE l.league_type = 'world_cup'
  AND c.slug = 'wc2026'
  AND (c.league_type IS NULL OR c.api_football_league_id IS NULL);
