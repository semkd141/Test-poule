-- Grant authenticated admin users full access on every RLS-enabled table
-- in schema `public`, while keeping existing non-admin policies intact.

-- Recreate helper to ensure it exists even if only this migration is applied.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() ->> 'role', '') IN ('service_role', 'supabase_admin');
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relrowsecurity = true
      AND n.nspname = 'public'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS admin_full_access ON %I.%I',
      r.schema_name,
      r.table_name
    );

    EXECUTE format(
      'CREATE POLICY admin_full_access ON %I.%I FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())',
      r.schema_name,
      r.table_name
    );
  END LOOP;
END
$$;

