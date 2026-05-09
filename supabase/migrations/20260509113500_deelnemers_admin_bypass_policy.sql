-- Allow one (or more) explicitly marked admin users to bypass deelnemers RLS.
-- Keep all existing participant restrictions for regular authenticated users.

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() ->> 'role', '') IN ('service_role', 'supabase_admin');
$$;

DROP POLICY IF EXISTS deelnemers_select_policy ON public.deelnemers;
CREATE POLICY deelnemers_select_policy
ON public.deelnemers
FOR SELECT
TO anon, authenticated
USING (
  public.is_admin_user()
  OR email = '__config__'
  OR now() >= public.competition_deadline_at(competition_id)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS deelnemers_insert_policy ON public.deelnemers;
CREATE POLICY deelnemers_insert_policy
ON public.deelnemers
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_user()
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS deelnemers_update_policy ON public.deelnemers;
CREATE POLICY deelnemers_update_policy
ON public.deelnemers
FOR UPDATE
TO authenticated
USING (
  public.is_admin_user()
  OR (
    user_id = auth.uid()
    AND now() < public.competition_deadline_at(competition_id)
  )
)
WITH CHECK (
  public.is_admin_user()
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS deelnemers_delete_policy ON public.deelnemers;
CREATE POLICY deelnemers_delete_policy
ON public.deelnemers
FOR DELETE
TO authenticated
USING (
  public.is_admin_user()
  OR (
    user_id = auth.uid()
    AND now() < public.competition_deadline_at(competition_id)
  )
);

