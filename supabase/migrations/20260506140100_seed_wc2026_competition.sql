-- Default competition row for existing and new participant data (slug wc2026).

INSERT INTO public.competitions (slug, name, season_label, starts_at, metadata)
VALUES (
  'wc2026',
  'FIFA World Cup 2026',
  '2026',
  '2026-06-11T18:00:00+02:00'::timestamptz,
  '{"code": "WC", "host_years": [2026]}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
