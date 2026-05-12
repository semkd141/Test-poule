-- Pool "team" rows (same core fields as deelnemers, no spelers JSON).
-- Rollup: cumulative points per API player per league season, attributed to a teams row.

CREATE TABLE IF NOT EXISTS public.teams (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES public.competitions (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  email text,
  naam text,
  teamnaam text,
  systeem text,
  total_points integer NOT NULL DEFAULT 0,
  registration_deadline_at timestamptz,
  registration_deadline_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teams_competition_id_idx ON public.teams (competition_id);
CREATE INDEX IF NOT EXISTS teams_user_id_idx ON public.teams (user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teams_one_participant_email_per_competition
  ON public.teams (competition_id, lower(trim(both from email::text)))
  WHERE email IS NOT NULL AND email IS DISTINCT FROM '__config__';

CREATE UNIQUE INDEX IF NOT EXISTS teams_one_config_row_per_competition
  ON public.teams (competition_id)
  WHERE email = '__config__';

COMMENT ON TABLE public.teams IS 'Pool team registration (mirrors deelnemers core columns; no spelers JSON — picks live elsewhere / fixture_squad_members + rollup).';
COMMENT ON COLUMN public.teams.email IS 'Same semantics as deelnemers.email; unique per pool when not null.';
COMMENT ON COLUMN public.teams.total_points IS 'Team aggregate points (e.g. sum of player rollups or denormalized from scoring).';
COMMENT ON COLUMN public.teams.registration_deadline_at IS 'Pool registration deadline for __config__ rows (replaces JSON deadline in deelnemers).';
COMMENT ON COLUMN public.teams.registration_deadline_label IS 'Human label for the registration deadline (optional).';

CREATE TABLE IF NOT EXISTS public.player_points_rollup (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES public.competitions (id) ON DELETE CASCADE,
  team_id bigint NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  api_football_league_id bigint NOT NULL,
  season integer NOT NULL,
  player_id bigint NOT NULL,
  pos text,
  is_captain boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_points_rollup_unique_scope UNIQUE (team_id, api_football_league_id, season, player_id)
);

CREATE INDEX IF NOT EXISTS player_points_rollup_competition_idx
  ON public.player_points_rollup (competition_id, api_football_league_id, season);

CREATE INDEX IF NOT EXISTS player_points_rollup_league_season_idx
  ON public.player_points_rollup (api_football_league_id, season);

CREATE INDEX IF NOT EXISTS player_points_rollup_player_idx
  ON public.player_points_rollup (competition_id, api_football_league_id, season, player_id);

COMMENT ON TABLE public.player_points_rollup IS 'Cumulative points per API-Football player per league+season, scoped to a pool team (teams.id).';
COMMENT ON COLUMN public.player_points_rollup.team_id IS 'FK to public.teams.id.';
COMMENT ON COLUMN public.player_points_rollup.api_football_league_id IS 'API-Football leagues.id.';
COMMENT ON COLUMN public.player_points_rollup.season IS 'API-Football season year.';
COMMENT ON COLUMN public.player_points_rollup.player_id IS 'API-Football players.id.';
COMMENT ON COLUMN public.player_points_rollup.pos IS 'Lineup position label (e.g. API-Football pos; Coach for coaches).';
COMMENT ON COLUMN public.player_points_rollup.is_captain IS 'True when this player is the team captain pick (bonus scoring).';
COMMENT ON COLUMN public.player_points_rollup.points IS 'Running total; increment from background scoring jobs.';
