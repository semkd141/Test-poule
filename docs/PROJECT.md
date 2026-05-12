# Project delivery document

**Prepared for:** Client handoff (e.g. Fiverr delivery)  
**Product working name:** Tournament pool / “WK Poule” style football competition app  
**Repository layout:** Monorepo — `web-app` (Next.js), `backend` (Express + TypeScript), `supabase` (SQL migrations)

This document describes what was built, how it is structured, what the client needs to run and host it, and where to look in the code. It is a technical–functional overview, not legal advice; adjust branding and ownership clauses with your lawyer if required.

---

## 1. Executive summary

The application is a **multi-competition football pool** where users can:

- Browse **competitions**, **fixtures/mappings**, **rankings**, and **results**
- **Register** a team for a pool (with API-Football–based **squad rosters** and **lineups** stored as structured data, not only legacy JSON)
- Use **My Team** to maintain picks after registration
- **Pool owners** manage participants, fixture mappings, invites, and **points** (including **`player_points_rollup`** aligned with API-Football player IDs)
- A **superadmin** sees an **Admin** area (competitions, site-wide deadline, analytics-style counters, etc.)

Live football data integrates with **API-Football (api-sports.io)** where configured: fixtures, squad members, match statistics, and background jobs that can update rollups after goals.

---

## 2. Technology stack

| Layer | Technology |
|--------|------------|
| Frontend | **Next.js 16**, **React 19**, **Tailwind CSS 4**, **TypeScript** |
| Backend | **Express 5**, **TypeScript**, **Pino** logging |
| Database & auth | **Supabase** (Postgres + Row Level Security + Auth) |
| HTTP client | **Axios** (backend) |
| Validation | **Zod** (backend env and payloads) |
| Email | **Brevo** and/or **Resend** (optional, transactional) |
| Excel export | **xlsx** (participant / pool exports in the UI) |
| External API | **API-Football v3** (`API_FOOTBALL_KEY`) for fixtures, squads, statistics |

---

## 3. High-level architecture

```
Browser (Next.js)
    │
    ├─► Supabase Auth (Google / magic link / email-password as configured)
    │
    └─► REST API ──► Express `/api/*`
                        │
                        ├─► Supabase PostgREST (service role for server-side writes)
                        ├─► Supabase Auth (JWT verification, admin helpers)
                        └─► API-Football (when `API_FOOTBALL_KEY` is set)
```

- The **web app** calls the **Express API** (`NEXT_PUBLIC_API_BASE`, often `/api` in production with a Next.js rewrite/proxy).
- The **backend** holds all privileged DB access patterns; the browser must not receive **service role** keys.

---

## 4. Repository structure (what each folder is for)

| Path | Purpose |
|------|--------|
| `web-app/` | Next.js UI: tabs (ranking, matches, results, teams, competitions, register, edit, rules, competition, pool points, admin), `lib/wk/` API client and config |
| `backend/src/` | Express app: `app.ts`, `routes/`, `controllers/`, `services/`, `middleware/`, `config/env.ts` |
| `backend/src/services/supabase-gateway.ts` | Centralized PostgREST calls to Supabase |
| `supabase/migrations/` | Versioned SQL: competitions, teams, rollups, matches, player statistics, fixture mappings, squad members, invites, RLS policies, etc. |
| `backend/test-api2.js` | Standalone script: slim fixture + derived stats (optional `USE_FIXTURE_JSON=1`) |

---

## 5. Main product features (functional)

### 5.1 Public & participant

- **Leaderboard** — competition-scoped ranking using server data
- **Matches / results** — fixture mappings and outcomes as stored/synced
- **Teams** — display of registered teams (subject to deadline / visibility rules)
- **Competitions** — catalogue and detail; **join** flows (`competition_members`)
- **Register / Register 2** — team signup tied to **API-Football league + season** metadata on the competition; **squad roster** from `fixture_squad_members`; **picks** persisted to **`player_points_rollup`**
- **My Team** — edit lineup and captain within pool rules and deadlines
- **Rules** — static/help content via i18n strings

### 5.2 Pool owner (“Manage points” / `my-competitions`)

Authenticated users who **own or manage** a competition can:

- List **participants** for that pool
- Maintain **fixture mappings** (link local schedule keys to API fixture IDs)
- **Invites** — email invitations when Brevo/Resend + `PUBLIC_APP_URL` are configured
- **Points management** — same family of UI as admin: per-team **rollup** lines (read-only **player id** and **position** from registration; editable **points** and **captain** where allowed)

### 5.3 Superadmin

- **`NEXT_PUBLIC_SUPERADMIN_UID`** (frontend) must match **`ADMIN_UID`** (backend) for the designated Supabase user
- **Admin** tab: site-wide registration deadline row, competition CRUD at platform level, analytics counts, etc.

### 5.4 Football data pipeline (when API key is active)

- **Fixture squad sync** — internal/owner routes fetch squads and store **`fixture_squad_members`** (with league, season, team, player id)
- **Fixture statistics** — `POST .../fixture-statistics`: upsert **`matches`** + **`player_statistics`** (includes **`player_id`**)
- **Background goal rollup** — after a **first-time** API sync for a fixture, a non-blocking job can increment **`player_points_rollup`** and refresh **`teams.total_points`**, with idempotency via **`participant_score_events`**
- **Scoring engine** — separate path for winner/captain/final-style bonuses using the same ledger pattern

---

## 6. Database model (conceptual)

Important **public** tables (names may vary slightly; see migrations for exact columns):

- **`competitions`** — pool definition, slug, owner, `league_type`, `season_label`, metadata for API-Football league/season
- **`teams`** — one row per registered team in a competition (`total_points`, email, names); `email = '__config__'` used for pool-level config in some flows
- **`competition_members`** / **`competition_invites`** — membership and invitations
- **`fixture_mappings`** — local match keys ↔ `api_fixture_id`, kickoff, teams, stage
- **`fixture_squad_members`** — API players eligible in a league/season (with `player_id`)
- **`player_points_rollup`** — per team, per API `player_id`, `pos`, `is_captain`, cumulative **`points`**
- **`matches`** — synced match rows (`external_fixture_id`, scores, status, payload)
- **`player_statistics`** — per-fixture player lines (`punten`, optional **`player_id`**)
- **`participant_score_events`** — idempotent scoring ledger (unique per team + match + event key)
- **`wk_spelers`** — legacy/static player catalogue for older UI paths where still referenced

**RLS** and **admin bypass** policies are defined in migrations; production should be reviewed with Supabase advisors.

---

## 7. API surface (Express, prefix `/api`)

Public / semi-public examples:

- `GET /competitions`, `GET /competitions/:id/fixture-mappings`, `GET /competitions/:id/squad-roster`
- `POST /competitions/:competitionId/fixture-statistics` — match + player stats (DB or API-Football)
- `GET /leaderboard`, `GET /participants`, `GET /players`
- `POST /participants/join` (JWT)

Authenticated / gated participant routes (see `participants.routes.ts`):

- `GET /participants/:id/player-rollups`
- `PATCH /participants/:id/players` — replace rollup set for that team + league scope; recomputes team total
- `PATCH /participants/:id`, `DELETE /participants/:id`, `POST /participants`

Pool owner router: **`/api/my-competitions/...`** (JWT required) — participants, mappings, invites, etc.

Internal / operator: **`/api/internal/...`** — fixture squad fetch batch, sync helpers, guarded by env secrets or platform operator rules (see `internal.routes.ts`).

---

## 8. Configuration & secrets

### 8.1 Backend (`backend/.env`)

Validated in `backend/src/config/env.ts`. Minimum typically includes:

- `SUPABASE_URL`, `SUPABASE_KEY` (anon/publishable for some paths), **`SUPABASE_JWT_SECRET`**
- **`SUPABASE_SERVICE_ROLE_KEY`** — strongly recommended for server operations and RLS bypass where implemented
- **`API_FOOTBALL_KEY`** — optional but required for live fixture/squad/statistics sync
- **`ADMIN_UID`**, **`ADMIN_API_SECRET`**, **`PUBLIC_APP_URL`**, email provider keys — optional depending on features
- **`PARTICIPANT_LEGACY_OPEN_MUTATIONS`** — tighten to `false` in production when all clients send JWTs

Full comments: **`backend/.env.example`**.

### 8.2 Frontend (`web-app/.env.local` or host env)

Documented in `web-app/lib/wk/config.ts`:

- `NEXT_PUBLIC_API_BASE` — e.g. `http://localhost:4000/api` or `/api` behind a proxy
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — OAuth/magic-link redirects (must be a clean https URL in production)
- `NEXT_PUBLIC_SUPERADMIN_UID` — must match backend `ADMIN_UID`

Next.js dev proxy: `web-app/app/api/[...path]/route.ts` can forward to Express using `API_PROXY_TARGET` / `BACKEND_API_ORIGIN`.

---

## 9. How to run locally (developer)

1. **Supabase:** create project, run migrations from `supabase/migrations/` (Supabase CLI or SQL editor in order).
2. **Backend:** `cd backend && cp .env.example .env` → fill secrets → `npm install` → `npm run dev` (or `npm run build && npm start`).
3. **Web app:** `cd web-app` → set `NEXT_PUBLIC_*` → `npm install` → `npm run dev`.
4. **API-Football:** add key to backend `.env` for any live football sync.

---

## 10. Deployment checklist (client / ops)

- [ ] Supabase project in correct region; **migrations** applied; **Auth** providers enabled (Google, etc.) as needed  
- [ ] **Redirect URLs** in Supabase Auth match `NEXT_PUBLIC_SITE_URL` (no hash-only redirects for magic links)  
- [ ] Backend hosted with **HTTPS**, **CORS** if frontend is another origin  
- [ ] **Secrets** only on server; rotate `ADMIN_API_SECRET`, `CRON_SECRET`, API keys periodically  
- [ ] Set **`PARTICIPANT_LEGACY_OPEN_MUTATIONS=false`** when JWT-based access is verified end-to-end  
- [ ] **API-Football** plan limits and billing (account suspension returns empty fixtures)  
- [ ] **Email** DNS (SPF/DKIM) for Brevo/Resend deliverability  

---

## 11. Intellectual property & delivery (template)

Fill in before sending to the client:

- **Deliverable:** Source code repository (branch/commit: _______________)  
- **Licence / ownership:** _______________ (e.g. full assignment to client upon final payment — your standard Fiverr terms)  
- **Third-party services:** Supabase, API-Football, Brevo/Resend, hosting — **accounts and billing** are the client’s unless agreed otherwise  
- **Warranty / support period:** _______________  
- **Excluded:** Penetration testing, legal compliance sign-off, app store submissions, unless separately scoped  

---

## 12. Known operational notes

- **API-Football** responses are empty if the subscription is **suspended** or the key is invalid; use local `backend/fixture.json` with `USE_FIXTURE_JSON=1` in `test-api2.js` for offline shape checks.
- **Rollup PATCH** validates players against **`fixture_squad_members`** for the pool’s league/season; if squads were never synced, saves may return a **400** with a clear message.
- **Superadmin** visibility is **UID-based**; wrong UID means no Admin tab even if the user “should” be admin.

---

## 13. Support references

- API-Football: https://www.api-football.com/documentation-v3  
- Supabase: https://supabase.com/docs  
- Next.js: https://nextjs.org/docs  

---

*Document generated from a full-repo scan of the **Test-poule** codebase structure, routes, migrations, and configuration. Customize sections 1, 11, and branding before sending to your client.*
