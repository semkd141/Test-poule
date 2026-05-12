-- Align existing DBs that already ran 20260513150000 before teams/rollup schema tweaks.

ALTER TABLE public.teams
  DROP COLUMN IF EXISTS attacker_goals;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS registration_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_deadline_label text;

ALTER TABLE public.player_points_rollup
  ADD COLUMN IF NOT EXISTS pos text;

ALTER TABLE public.player_points_rollup
  ADD COLUMN IF NOT EXISTS is_captain boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.player_points_rollup.pos IS 'Lineup position label (e.g. API-Football pos; Coach for coaches).';
COMMENT ON COLUMN public.player_points_rollup.is_captain IS 'True when this player is the team captain pick (bonus scoring).';
COMMENT ON COLUMN public.teams.registration_deadline_at IS 'Pool registration deadline for __config__ rows (replaces JSON deadline in deelnemers).';
COMMENT ON COLUMN public.teams.registration_deadline_label IS 'Human label for the registration deadline (optional).';

CREATE UNIQUE INDEX IF NOT EXISTS teams_one_config_row_per_competition
  ON public.teams (competition_id)
  WHERE email = '__config__';
