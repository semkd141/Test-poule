CREATE OR REPLACE FUNCTION public.apply_player_score_event(
  p_participant_id bigint,
  p_match_id bigint,
  p_event_key text,
  p_delta_points integer,
  p_rollup_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.participant_score_events (
    participant_id,
    match_id,
    event_key,
    delta_points
  )
  VALUES (
    p_participant_id,
    p_match_id,
    p_event_key,
    p_delta_points
  )
  ON CONFLICT (participant_id, match_id, event_key) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.player_points_rollup
  SET
    points = points + p_delta_points,
    updated_at = now()
  WHERE id = p_rollup_id
    AND team_id = p_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_points_rollup % for team % not found', p_rollup_id, p_participant_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_player_score_event(bigint, bigint, text, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_player_score_event(bigint, bigint, text, integer, bigint) TO service_role;

COMMENT ON FUNCTION public.apply_player_score_event(bigint, bigint, text, integer, bigint)
IS 'Atomically inserts an idempotent fantasy score event and increments the selected player rollup.';
