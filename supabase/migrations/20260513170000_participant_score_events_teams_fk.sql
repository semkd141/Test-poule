-- Point participant_score_events.participant_id at public.teams(id) instead of deelnemers(id).
-- Clears the idempotent scoring ledger (re-run scoring after migration).
-- When teams is empty and deelnemers exists, copies participant/config rows preserving id.

DELETE FROM public.participant_score_events;

DO $$
DECLARE
  team_count int;
  has_deelnemers boolean;
BEGIN
  SELECT count(*)::int INTO team_count FROM public.teams;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deelnemers'
  ) INTO has_deelnemers;

  IF team_count = 0 AND has_deelnemers THEN
    INSERT INTO public.teams (
      id,
      competition_id,
      user_id,
      email,
      naam,
      teamnaam,
      systeem,
      total_points,
      registration_deadline_at,
      registration_deadline_label,
      created_at,
      updated_at
    )
    SELECT
      d.id,
      d.competition_id,
      d.user_id,
      d.email,
      d.naam,
      d.teamnaam,
      d.systeem,
      COALESCE(d.total_points, 0),
      NULL,
      NULL,
      now(),
      now()
    FROM public.deelnemers d
    OVERRIDING SYSTEM VALUE;
  END IF;
END $$;

ALTER TABLE public.participant_score_events
  DROP CONSTRAINT IF EXISTS participant_score_events_participant_id_fkey;

ALTER TABLE public.participant_score_events
  ADD CONSTRAINT participant_score_events_participant_id_fkey
  FOREIGN KEY (participant_id) REFERENCES public.teams (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.participant_score_events.participant_id IS 'Pool team id (public.teams.id); formerly deelnemers.id.';
