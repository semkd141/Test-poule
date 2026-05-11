-- So fixture import can reuse mappings from this pool, `metadata.api_football.season` must match peers.
UPDATE public.competitions c
SET metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object(
  'api_football',
  jsonb_build_object(
    'league', c.api_football_league_id,
    'season', 2026
  )
)
WHERE c.slug = 'wc2026'
  AND c.api_football_league_id IS NOT NULL;
