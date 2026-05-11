-- One participant registration per (competition_id, email), case-insensitive.
-- Same person may join multiple competitions; __config__ rows stay one per pool.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT competition_id, lower(trim(both from email::text)) AS em
      FROM public.deelnemers
      WHERE email IS DISTINCT FROM '__config__'
      GROUP BY competition_id, lower(trim(both from email::text))
      HAVING count(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: duplicate (competition_id, email) rows in public.deelnemers for participants. Remove or merge duplicates, then re-run.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT competition_id
      FROM public.deelnemers
      WHERE email = '__config__'
      GROUP BY competition_id
      HAVING count(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: multiple __config__ rows for the same competition_id in public.deelnemers.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS deelnemers_one_participant_email_per_competition
  ON public.deelnemers (competition_id, lower(trim(both from email::text)))
  WHERE email IS DISTINCT FROM '__config__';

CREATE UNIQUE INDEX IF NOT EXISTS deelnemers_one_config_row_per_competition
  ON public.deelnemers (competition_id)
  WHERE email = '__config__';

COMMENT ON INDEX public.deelnemers_one_participant_email_per_competition IS
  'At most one team per email per pool; email compared case-insensitively after trim.';

COMMENT ON INDEX public.deelnemers_one_config_row_per_competition IS
  'At most one synthetic __config__ row per competition (deadline / pool settings).';
