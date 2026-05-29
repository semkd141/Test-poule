ALTER TABLE public.matches
  ALTER COLUMN competition_id DROP NOT NULL;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_competition_id_fkey;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_competition_id_fkey
  FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.matches.competition_id
IS 'Originating pool id for legacy/admin filtering. Match rows are keyed globally by API-Football external_fixture_id and must survive pool deletion.';
