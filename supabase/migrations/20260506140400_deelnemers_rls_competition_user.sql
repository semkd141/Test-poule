-- Tier 4 security/privacy policies:
-- - competition scoped rows
-- - user scoped writes (user_id = auth.uid())
-- - hide others before deadline, reveal after deadline

ALTER TABLE public.deelnemers ENABLE ROW LEVEL SECURITY;

-- Deadline source is the __config__ row for each competition.
CREATE OR REPLACE FUNCTION public.competition_deadline_at(_competition_id bigint)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(d.spelers::jsonb ->> 'deadline', '')::timestamptz,
    '2026-06-10T23:59:59+02:00'::timestamptz
  )
  FROM public.deelnemers d
  WHERE d.competition_id = _competition_id
    AND d.email = '__config__'
  ORDER BY d.id DESC
  LIMIT 1
$$;

DROP POLICY IF EXISTS deelnemers_select_policy ON public.deelnemers;
CREATE POLICY deelnemers_select_policy
ON public.deelnemers
FOR SELECT
TO anon, authenticated
USING (
  email = '__config__'
  OR now() >= public.competition_deadline_at(competition_id)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS deelnemers_insert_policy ON public.deelnemers;
CREATE POLICY deelnemers_insert_policy
ON public.deelnemers
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS deelnemers_update_policy ON public.deelnemers;
CREATE POLICY deelnemers_update_policy
ON public.deelnemers
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND now() < public.competition_deadline_at(competition_id)
)
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS deelnemers_delete_policy ON public.deelnemers;
CREATE POLICY deelnemers_delete_policy
ON public.deelnemers
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND now() < public.competition_deadline_at(competition_id)
);
