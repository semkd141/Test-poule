-- Tier 6 leaderboard aggregates persisted by scoring engine.

ALTER TABLE public.deelnemers
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attacker_goals integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS deelnemers_leaderboard_idx
  ON public.deelnemers (competition_id, total_points DESC, attacker_goals DESC, id ASC);
