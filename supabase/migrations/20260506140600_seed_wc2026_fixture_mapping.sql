-- Seed static WC2026 mapping skeleton. Fill api_fixture_id values once known from API-Football.
-- local_key scheme:
-- - gm-001..gm-072 group matches (ordered as in frontend schedule)
-- - r16-01..r16-16, qf-01..qf-08, sf-01..sf-04, thirdp-01, final-01

WITH wc AS (
  SELECT id FROM public.competitions WHERE slug = 'wc2026' LIMIT 1
),
keys AS (
  SELECT * FROM (VALUES
    ('gm-001','group'),('gm-002','group'),('gm-003','group'),('gm-004','group'),
    ('gm-005','group'),('gm-006','group'),('gm-007','group'),('gm-008','group'),
    ('gm-009','group'),('gm-010','group'),('gm-011','group'),('gm-012','group'),
    ('gm-013','group'),('gm-014','group'),('gm-015','group'),('gm-016','group'),
    ('gm-017','group'),('gm-018','group'),('gm-019','group'),('gm-020','group'),
    ('gm-021','group'),('gm-022','group'),('gm-023','group'),('gm-024','group'),
    ('gm-025','group'),('gm-026','group'),('gm-027','group'),('gm-028','group'),
    ('gm-029','group'),('gm-030','group'),('gm-031','group'),('gm-032','group'),
    ('gm-033','group'),('gm-034','group'),('gm-035','group'),('gm-036','group'),
    ('gm-037','group'),('gm-038','group'),('gm-039','group'),('gm-040','group'),
    ('gm-041','group'),('gm-042','group'),('gm-043','group'),('gm-044','group'),
    ('gm-045','group'),('gm-046','group'),('gm-047','group'),('gm-048','group'),
    ('gm-049','group'),('gm-050','group'),('gm-051','group'),('gm-052','group'),
    ('gm-053','group'),('gm-054','group'),('gm-055','group'),('gm-056','group'),
    ('gm-057','group'),('gm-058','group'),('gm-059','group'),('gm-060','group'),
    ('gm-061','group'),('gm-062','group'),('gm-063','group'),('gm-064','group'),
    ('gm-065','group'),('gm-066','group'),('gm-067','group'),('gm-068','group'),
    ('gm-069','group'),('gm-070','group'),('gm-071','group'),('gm-072','group'),
    ('r16-01','r16'),('r16-02','r16'),('r16-03','r16'),('r16-04','r16'),
    ('r16-05','r16'),('r16-06','r16'),('r16-07','r16'),('r16-08','r16'),
    ('r16-09','r16'),('r16-10','r16'),('r16-11','r16'),('r16-12','r16'),
    ('r16-13','r16'),('r16-14','r16'),('r16-15','r16'),('r16-16','r16'),
    ('qf-01','qf'),('qf-02','qf'),('qf-03','qf'),('qf-04','qf'),
    ('qf-05','qf'),('qf-06','qf'),('qf-07','qf'),('qf-08','qf'),
    ('sf-01','sf'),('sf-02','sf'),('sf-03','sf'),('sf-04','sf'),
    ('thirdp-01','thirdp'),('final-01','final')
  ) AS t(local_key, stage)
)
INSERT INTO public.fixture_mappings (competition_id, local_key, stage, api_fixture_id)
SELECT wc.id, keys.local_key, keys.stage, NULL
FROM wc
CROSS JOIN keys
ON CONFLICT (competition_id, local_key) DO NOTHING;
