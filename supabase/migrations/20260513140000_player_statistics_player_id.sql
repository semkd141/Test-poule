ALTER TABLE public.player_statistics
  ADD COLUMN IF NOT EXISTS player_id bigint;

COMMENT ON COLUMN public.player_statistics.player_id IS 'API-Football players.id when present on the fixture payload.';

CREATE INDEX IF NOT EXISTS player_statistics_fixture_player_id_idx
  ON public.player_statistics (fixture_id, player_id)
  WHERE player_id IS NOT NULL;
