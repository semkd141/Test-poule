# Staging Checklist (Auth, RLS, Deadline, Sync, Leaderboard)

## 1) Environment and Secrets
- Backend set: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET`.
- Tier 5 set: `API_FOOTBALL_KEY`, `CRON_SECRET`.
- Tier 7 set: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- Web set: `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Production hardening: `PARTICIPANT_LEGACY_OPEN_MUTATIONS=false`.
- Keep `NEXT_PUBLIC_ALLOW_LEGACY_ADMIN_PASSWORD=false` in production.

## 2) Database Migrations
- Apply all `supabase/migrations/*.sql` in timestamp order.
- Verify schema:
  - `competitions`, `matches`, `fixture_mappings`, `participant_score_events`.
  - `deelnemers` has `competition_id`, `user_id`, `total_points`, `attacker_goals`.
- Verify RLS is enabled on `competitions` and `deelnemers`.

## 3) Auth + Privacy
- Sign in as User A and User B.
- Before deadline:
  - User A can read own team via `/api/participants/by-email`.
  - User A cannot read User B team via `/api/participants/by-email` (expect 403).
  - `/api/participants` returns public summary for others (no `spelers` details).
- After deadline:
  - `/api/participants` exposes full leaderboard rows as expected by product rules.

## 4) Mutation Authorization + Deadline Lock
- Before deadline:
  - User can `PATCH/DELETE` only own row.
  - Other-user mutation attempts return 403.
- After deadline:
  - `PATCH/DELETE` on participant rows return 403 for non-admin calls.
- Admin override:
  - With `X-Admin-Secret: <ADMIN_API_SECRET>`, internal/admin maintenance paths work.

## 5) API-Football Sync (Mock + Real)
- Mock run recommendation:
  - In staging, temporarily point the API client to fixture test IDs and ensure no duplicate score deltas after repeated sync.
  - Verify idempotency: same `/api/internal/sync-fixtures` call twice should not re-award points.
- Real run:
  - `POST /api/internal/sync-fixtures` with `X-Cron-Secret`.
  - Verify `matches` upserted and `participant_score_events` appended once per unique event key.

## 6) Leaderboard + Tie-break
- `GET /api/leaderboard` sorted by:
  1. `total_points` desc
  2. `attacker_goals` desc
  3. `teamnaam` asc
- UI ranking order matches API order in tie scenarios.

## 7) Transactional Email
- Signup confirmation:
  - Register participant; verify confirmation email is received.
  - If Resend is down/misconfigured, registration still succeeds (non-blocking send).
- Invite flow:
  - Admin call `POST /api/auth/invite` with `X-Admin-Secret` body:
    `{ "email":"x@y.com","competitionName":"WK 2026","inviteUrl":"https://..." }`
  - Verify 200 response and email delivery.

## 8) Smoke Commands
- Backend compile: `cd backend && npm run build`
- Frontend lint: `cd web-app && npm run lint`
- Manual sync test:
  - `curl -X POST "$API_BASE/internal/sync-fixtures" -H "X-Cron-Secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"competitionSlug":"wc2026"}'`
