-- Remove legacy UNIQUE(email) so one person can register in multiple competitions.
-- Uniqueness per pool stays on: deelnemers_one_participant_email_per_competition.

ALTER TABLE public.deelnemers
  DROP CONSTRAINT IF EXISTS deelnemers_email_key;

-- If uniqueness was created as a standalone unique index (no table constraint), remove it too.
DROP INDEX IF EXISTS public.deelnemers_email_key;
