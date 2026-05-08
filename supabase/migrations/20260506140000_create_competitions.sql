-- competitions: logical tournament / pool (WC 2026, club league, etc.)
-- Apply with Supabase CLI (`supabase db push`) or `psql` against the project database.

CREATE TABLE IF NOT EXISTS public.competitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  season_label text,
  starts_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.competitions IS 'Tournament or pool; deelnemers (participant teams) reference competition_id.';
CREATE INDEX IF NOT EXISTS competitions_slug_idx ON public.competitions (slug);

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.competitions TO anon, authenticated;

DROP POLICY IF EXISTS competitions_select_public ON public.competitions;
CREATE POLICY competitions_select_public
  ON public.competitions
  FOR SELECT
  TO anon, authenticated
  USING (true);
