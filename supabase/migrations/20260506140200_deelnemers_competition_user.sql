-- Link participant teams (deelnemers) to a competition; optional auth user link.

ALTER TABLE public.deelnemers
  ADD COLUMN IF NOT EXISTS competition_id bigint REFERENCES public.competitions (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

UPDATE public.deelnemers d
SET competition_id = c.id
FROM public.competitions c
WHERE c.slug = 'wc2026'
  AND d.competition_id IS NULL;

-- Enforce membership in a competition after backfill.
ALTER TABLE public.deelnemers
  ALTER COLUMN competition_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS deelnemers_competition_id_idx ON public.deelnemers (competition_id);
CREATE INDEX IF NOT EXISTS deelnemers_user_id_idx ON public.deelnemers (user_id) WHERE user_id IS NOT NULL;

-- Inserts that omit competition_id still default to wc2026 (until the app passes explicit ids).
CREATE OR REPLACE FUNCTION public.set_deelnemers_default_competition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.competition_id IS NULL THEN
    SELECT c.id INTO NEW.competition_id
    FROM public.competitions c
    WHERE c.slug = 'wc2026'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deelnemers_default_competition ON public.deelnemers;
CREATE TRIGGER trg_deelnemers_default_competition
  BEFORE INSERT ON public.deelnemers
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_deelnemers_default_competition();

COMMENT ON COLUMN public.deelnemers.competition_id IS 'FK to competitions; NOT NULL — default wc2026 via trigger if omitted.';
COMMENT ON COLUMN public.deelnemers.user_id IS 'Optional Supabase Auth user owning this registration; NULL during migration / anonymous rows.';
