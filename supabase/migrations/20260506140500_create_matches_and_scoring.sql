-- Tier 5 data model for external fixtures + idempotent scoring ledger.

CREATE TABLE IF NOT EXISTS public.matches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  external_fixture_id bigint NOT NULL UNIQUE,
  status text NOT NULL,
  round text,
  kickoff_at timestamptz NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_goals integer,
  away_goals integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matches_competition_idx ON public.matches(competition_id, kickoff_at);
CREATE INDEX IF NOT EXISTS matches_status_idx ON public.matches(status);

CREATE TABLE IF NOT EXISTS public.fixture_mappings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  local_key text NOT NULL,
  api_fixture_id bigint,
  stage text NOT NULL DEFAULT 'group',
  kickoff_at timestamptz,
  home_team text,
  away_team text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, local_key)
);

-- Many rows may have api_fixture_id NULL until API-Football IDs are filled; only enforce uniqueness when set.
CREATE UNIQUE INDEX IF NOT EXISTS fixture_mappings_competition_api_fixture_unique
  ON public.fixture_mappings (competition_id, api_fixture_id)
  WHERE api_fixture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fixture_mappings_competition_idx ON public.fixture_mappings(competition_id);

CREATE TABLE IF NOT EXISTS public.participant_score_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  participant_id bigint NOT NULL REFERENCES public.deelnemers(id) ON DELETE CASCADE,
  match_id bigint NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  delta_points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, match_id, event_key)
);

CREATE INDEX IF NOT EXISTS participant_score_events_match_idx
  ON public.participant_score_events(match_id, participant_id);
