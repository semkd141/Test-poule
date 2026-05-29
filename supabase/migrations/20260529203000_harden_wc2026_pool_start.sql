-- Ensure the platform WK 2026 pool always has the start time that drives privacy redaction and edit locking.

UPDATE public.competitions
SET starts_at = '2026-06-11T18:00:00+02:00'::timestamptz
WHERE slug = 'wc2026'
  AND starts_at IS NULL;
