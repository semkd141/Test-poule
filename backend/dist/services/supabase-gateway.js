import { createHash, randomBytes } from "node:crypto";
import { UpstreamHttpError } from "../shared/upstream-error.js";
import { createSupabaseAdmin } from "./supabase-admin.js";
import { defaultApiFootballSeasonForLeagueType, parseApiFootballSeasonYearFromSeasonLabel, } from "../league-type-resolve.js";
/**
 * Encapsulates all HTTP calls to Supabase Auth and PostgREST.
 * Single place for URLs, headers, and error handling.
 */
export class SupabaseGateway {
    env;
    log;
    dbBase;
    authBase;
    /** Lazily created; null if {@link Env.SUPABASE_SERVICE_ROLE_KEY} is unset. */
    supabaseAdminClient;
    constructor(env, log) {
        this.env = env;
        this.log = log;
        const base = env.SUPABASE_URL.replace(/\/$/, "");
        this.dbBase = `${base}/rest/v1`;
        this.authBase = `${base}/auth/v1`;
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
            this.log.warn("SUPABASE_SERVICE_ROLE_KEY is unset. With Row Level Security on `teams`, PostgREST queries using only the anon/publishable SUPABASE_KEY may return zero rows for other users' emails — password signup will falsely say no team registration exists. Add the service_role key from Supabase Dashboard → API.");
        }
    }
    /** Auth Admin (`auth.admin.*`) via `@supabase/supabase-js` + service role key. */
    supabaseAdmin() {
        if (this.supabaseAdminClient !== undefined)
            return this.supabaseAdminClient;
        const client = createSupabaseAdmin(this.env);
        this.supabaseAdminClient = client;
        return client;
    }
    /** PostgREST: use service role when set so server reads/writes are not blocked by RLS. User JWT requests keep anon apikey + Bearer user. */
    serviceHeaders(accessToken) {
        if (accessToken) {
            return {
                "Content-Type": "application/json",
                apikey: this.env.SUPABASE_KEY,
                Authorization: `Bearer ${accessToken}`,
            };
        }
        const key = this.env.SUPABASE_SERVICE_ROLE_KEY ?? this.env.SUPABASE_KEY;
        return {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${key}`,
        };
    }
    async parseJsonSafe(r) {
        try {
            return await r.json();
        }
        catch {
            return { error: `Upstream failed with status ${r.status}` };
        }
    }
    async parseSuccessBody(r) {
        const text = await r.text();
        if (!text.trim())
            return null;
        try {
            return JSON.parse(text);
        }
        catch {
            return { raw: text };
        }
    }
    async request(label, url, init) {
        const started = Date.now();
        this.log.debug({ label, method: init.method ?? "GET", url }, "upstream request");
        const r = await fetch(url, init);
        const ms = Date.now() - started;
        if (!r.ok) {
            const payload = await this.parseJsonSafe(r);
            this.log.warn({ label, status: r.status, ms, payload }, "upstream error");
            throw new UpstreamHttpError(r.status, payload);
        }
        this.log.debug({ label, status: r.status, ms }, "upstream ok");
        return r;
    }
    // --- Auth ---
    async sendOtp(email) {
        const r = await this.request("auth.otp", `${this.authBase}/otp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.env.SUPABASE_KEY,
            },
            body: JSON.stringify({ email, create_user: true }),
        });
        return this.parseSuccessBody(r);
    }
    async signInWithPassword(email, password) {
        const r = await this.request("auth.password", `${this.authBase}/token?grant_type=password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.env.SUPABASE_KEY,
            },
            body: JSON.stringify({ email, password }),
        });
        return this.parseSuccessBody(r);
    }
    /**
     * Uses GoTrue `GET /admin/users?filter=…` (service role). The JS client's `listUsers()`
     * does not pass `filter`, so we keep this HTTP call; {@link adminDeleteUser} uses `auth.admin` instead.
     */
    async lookupAuthUserByEmail(email) {
        if (!this.supabaseAdmin())
            return "unavailable";
        const trimmed = email.trim();
        const filter = encodeURIComponent(trimmed);
        const serviceKey = this.env.SUPABASE_SERVICE_ROLE_KEY;
        const url = `${this.authBase}/admin/users?page=1&per_page=100&filter=${filter}`;
        const started = Date.now();
        this.log.debug({ label: "auth.admin.users", method: "GET" }, "upstream request");
        let r;
        try {
            r = await fetch(url, {
                method: "GET",
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                },
            });
        }
        catch (e) {
            this.log.warn({ err: e }, "auth admin users request failed");
            return "unavailable";
        }
        const ms = Date.now() - started;
        if (!r.ok) {
            const payload = await this.parseJsonSafe(r);
            this.log.warn({ status: r.status, ms, payload }, "auth admin users lookup failed");
            return "unavailable";
        }
        const data = (await this.parseJsonSafe(r));
        const rows = Array.isArray(data.users) ? data.users : [];
        const needle = trimmed.toLowerCase();
        for (const u of rows) {
            if (u && typeof u === "object" && !Array.isArray(u)) {
                const em = String(u.email ?? "").toLowerCase();
                if (em === needle)
                    return "exists";
            }
        }
        return "absent";
    }
    /** Removes an Auth user via `supabase.auth.admin.deleteUser` (service role). Logs on failure; does not throw. */
    async adminDeleteUser(userId) {
        const admin = this.supabaseAdmin();
        if (!admin) {
            this.log.warn("adminDeleteUser skipped: SUPABASE_SERVICE_ROLE_KEY unset");
            return;
        }
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) {
            this.log.warn({ userId, message: error.message, status: error.status }, "auth.admin.deleteUser failed");
        }
    }
    async signUpWithPassword(email, password, redirectTo) {
        const body = { email, password };
        // Confirmation/magic-link URLs must match Dashboard → Auth → Redirect URLs
        if (redirectTo)
            body.redirect_to = redirectTo;
        const r = await this.request("auth.signup", `${this.authBase}/signup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.env.SUPABASE_KEY,
            },
            body: JSON.stringify(body),
        });
        return this.parseSuccessBody(r);
    }
    async verifyOtp(email, token) {
        const r = await this.request("auth.verify", `${this.authBase}/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.env.SUPABASE_KEY,
            },
            body: JSON.stringify({ type: "email", email, token }),
        });
        return this.parseSuccessBody(r);
    }
    async refreshSession(refreshToken) {
        const r = await this.request("auth.refresh", `${this.authBase}/token?grant_type=refresh_token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: this.env.SUPABASE_KEY,
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        return this.parseSuccessBody(r);
    }
    async logout(accessToken) {
        await this.request("auth.logout", `${this.authBase}/logout`, {
            method: "POST",
            headers: {
                apikey: this.env.SUPABASE_KEY,
                Authorization: `Bearer ${accessToken}`,
            },
        });
    }
    async getUser(accessToken) {
        const r = await this.request("auth.user", `${this.authBase}/user`, {
            headers: {
                apikey: this.env.SUPABASE_KEY,
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return this.parseSuccessBody(r);
    }
    /**
     * Auth user record for public competition “creator” display (service role only).
     * Returns null if service role is not configured or the user does not exist.
     */
    async adminGetUserById(userId) {
        const admin = this.supabaseAdmin();
        if (!admin)
            return null;
        const trimmed = userId.trim();
        if (!trimmed)
            return null;
        const { data, error } = await admin.auth.admin.getUserById(trimmed);
        if (error) {
            this.log.debug({ userId: trimmed, message: error.message }, "adminGetUserById failed");
            return null;
        }
        if (!data?.user)
            return null;
        return data.user;
    }
    /** Count non-config teams per competition (single query). */
    async fetchParticipantCountsByCompetition() {
        const r = await this.request("db.teams.competitionCounts", `${this.dbBase}/teams?email=not.eq.__config__&select=competition_id`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        const map = new Map();
        if (!Array.isArray(data))
            return map;
        for (const row of data) {
            if (!row || typeof row !== "object" || Array.isArray(row))
                continue;
            const cid = Number(row.competition_id);
            if (!Number.isFinite(cid))
                continue;
            map.set(cid, (map.get(cid) ?? 0) + 1);
        }
        return map;
    }
    // --- REST (teams / wk_spelers) — pool team rows; picks live in player_points_rollup + fixture_squad_members ---
    async listParticipants() {
        const r = await this.request("db.teams.list", `${this.dbBase}/teams?select=*&order=id`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async getParticipant(id) {
        const enc = encodeURIComponent(id);
        const r = await this.request("db.teams.byId", `${this.dbBase}/teams?id=eq.${enc}&select=*&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return data[0];
    }
    async findParticipantByEmail(email) {
        const enc = encodeURIComponent(email.trim());
        // ilike = case-insensitive match (eq. on text is case-sensitive and breaks lookups vs registration casing)
        const r = await this.request("db.teams.byEmail", `${this.dbBase}/teams?email=ilike.${enc}&email=not.eq.__config__&limit=1`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    /** All team rows for an email (multiple competitions). */
    async findAllParticipantsByEmail(email) {
        const enc = encodeURIComponent(email.trim());
        const r = await this.request("db.teams.byEmailAll", `${this.dbBase}/teams?email=ilike.${enc}&email=not.eq.__config__&select=*&order=id`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async findParticipantByEmailAndCompetition(email, competitionId) {
        const enc = encodeURIComponent(email.trim());
        const cid = encodeURIComponent(String(competitionId));
        const r = await this.request("db.teams.byEmailCompetition", `${this.dbBase}/teams?email=ilike.${enc}&email=not.eq.__config__&competition_id=eq.${cid}&limit=1`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async getCompetitionConfigRow(competitionId) {
        const enc = encodeURIComponent(String(competitionId));
        const r = await this.request("db.teams.configByCompetition", `${this.dbBase}/teams?competition_id=eq.${enc}&email=eq.__config__&select=*&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return data[0];
    }
    async listWkSpelers() {
        const r = await this.request("db.wk_spelers.list", `${this.dbBase}/wk_spelers?select=*&order=land,positie,naam`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async listParticipantsByCompetition(competitionId) {
        const r = await this.request("db.teams.byCompetition", `${this.dbBase}/teams?competition_id=eq.${encodeURIComponent(String(competitionId))}&select=*&email=not.eq.__config__&order=id`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    /**
     * All pool teams that picked this API-Football player for the competition's league + season
     * (used after fixture goal stats sync to increment rollups in one query).
     */
    async listPlayerRollupsByCompetitionLeagueSeasonPlayer(competitionId, leagueId, season, playerId) {
        const cid = encodeURIComponent(String(Math.floor(competitionId)));
        const lid = encodeURIComponent(String(Math.floor(leagueId)));
        const sid = encodeURIComponent(String(Math.floor(season)));
        const pid = encodeURIComponent(String(Math.floor(playerId)));
        const sel = encodeURIComponent("id,competition_id,team_id,api_football_league_id,season,player_id,points,pos,is_captain");
        const r = await this.request("db.player_points_rollup.byCompetitionLeagueSeasonPlayer", `${this.dbBase}/player_points_rollup?competition_id=eq.${cid}&api_football_league_id=eq.${lid}&season=eq.${sid}&player_id=eq.${pid}&select=${sel}`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async listPlayerRollupsByTeamLeagueSeason(teamId, leagueId, season, orderBy = "player_id") {
        const tid = encodeURIComponent(String(teamId));
        const lid = encodeURIComponent(String(leagueId));
        const sid = encodeURIComponent(String(season));
        const sel = encodeURIComponent("id,competition_id,team_id,api_football_league_id,season,player_id,pos,is_captain,points,created_at,updated_at");
        const ord = encodeURIComponent(orderBy);
        const r = await this.request("db.player_points_rollup.byTeamLeagueSeason", `${this.dbBase}/player_points_rollup?team_id=eq.${tid}&api_football_league_id=eq.${lid}&season=eq.${sid}&select=${sel}&order=${ord}`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    /** All squad lines for a league+season (multiple fixtures); caller dedupes by `player_id`. */
    async listFixtureSquadMembersByLeagueSeason(leagueId, season) {
        const lid = encodeURIComponent(String(Math.floor(leagueId)));
        const sid = encodeURIComponent(String(Math.floor(season)));
        const sel = encodeURIComponent("player_id,name,team,pos");
        const r = await this.request("db.fixture_squad_members.byLeagueSeason", `${this.dbBase}/fixture_squad_members?api_football_league_id=eq.${lid}&season=eq.${sid}&select=${sel}&limit=50000`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    /** Distinct `team` (lineup side) labels for a player in a league+season (from fixture squads). */
    async listFixtureSquadTeamsForPlayer(playerId, leagueId, season) {
        const pid = encodeURIComponent(String(playerId));
        const lid = encodeURIComponent(String(leagueId));
        const sid = encodeURIComponent(String(season));
        const r = await this.request("db.fixture_squad_members.teamsForPlayer", `${this.dbBase}/fixture_squad_members?player_id=eq.${pid}&api_football_league_id=eq.${lid}&season=eq.${sid}&select=team`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        const out = new Set();
        if (!Array.isArray(data))
            return [];
        for (const row of data) {
            if (!row || typeof row !== "object" || Array.isArray(row))
                continue;
            const t = row.team;
            if (typeof t === "string" && t.trim())
                out.add(t.trim());
        }
        return [...out];
    }
    async deletePlayerRollupsByTeamLeagueSeason(teamId, leagueId, season) {
        const tid = encodeURIComponent(String(teamId));
        const lid = encodeURIComponent(String(leagueId));
        const sid = encodeURIComponent(String(season));
        const r = await this.request("db.player_points_rollup.deleteByTeamLeagueSeason", `${this.dbBase}/player_points_rollup?team_id=eq.${tid}&api_football_league_id=eq.${lid}&season=eq.${sid}`, { method: "DELETE", headers: this.serviceHeaders() });
        await this.parseSuccessBody(r);
    }
    async insertPlayerRollupsBatch(rows) {
        if (rows.length === 0)
            return;
        const CHUNK = 100;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const slice = rows.slice(i, i + CHUNK);
            const r = await this.request("db.player_points_rollup.insertBatch", `${this.dbBase}/player_points_rollup`, {
                method: "POST",
                headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify(slice),
            });
            await this.parseSuccessBody(r);
        }
    }
    async patchPlayerRollupById(id, body) {
        const enc = encodeURIComponent(id);
        const r = await this.request("db.player_points_rollup.patch", `${this.dbBase}/player_points_rollup?id=eq.${enc}`, {
            method: "PATCH",
            headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
        });
        await this.parseSuccessBody(r);
    }
    /** Recompute `teams.total_points` as the sum of rollup `points` for this team (all league/season rows). */
    async recomputeTeamTotalPointsFromRollups(teamId) {
        const tid = encodeURIComponent(teamId);
        const r = await this.request("db.player_points_rollup.sumForTeam", `${this.dbBase}/player_points_rollup?team_id=eq.${tid}&select=points`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        let sum = 0;
        if (Array.isArray(data)) {
            for (const row of data) {
                if (!row || typeof row !== "object" || Array.isArray(row))
                    continue;
                sum += Number(row.points) || 0;
            }
        }
        await this.patchTeamTotalPoints(teamId, sum);
    }
    async patchTeamTotalPoints(teamId, totalPoints) {
        const r = await this.request("db.teams.patchTotalPoints", `${this.dbBase}/teams?id=eq.${encodeURIComponent(teamId)}`, {
            method: "PATCH",
            headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({
                total_points: Math.floor(Number(totalPoints)) || 0,
                updated_at: new Date().toISOString(),
            }),
        });
        return this.parseSuccessBody(r);
    }
    metadataApiFootballSeason(meta) {
        if (!meta || typeof meta !== "object" || Array.isArray(meta))
            return null;
        const af = meta.api_football;
        if (!af || typeof af !== "object" || Array.isArray(af))
            return null;
        const s = Number(af.season);
        return Number.isFinite(s) && s > 0 ? Math.floor(s) : null;
    }
    metadataApiFootballLeague(meta) {
        if (!meta || typeof meta !== "object" || Array.isArray(meta))
            return null;
        const af = meta.api_football;
        if (!af || typeof af !== "object" || Array.isArray(af))
            return null;
        const l = Number(af.league);
        return Number.isFinite(l) && l > 0 ? Math.floor(l) : null;
    }
    /**
     * Resolve API-Football league id + season for fixture_mappings (shared rows for that tournament).
     */
    getFixtureMappingScopeForCompetition(comp) {
        const metaLeague = this.metadataApiFootballLeague(comp.metadata);
        const colLeague = Number(comp.api_football_league_id);
        const leagueId = metaLeague ?? (Number.isFinite(colLeague) && colLeague > 0 ? Math.floor(colLeague) : null);
        if (leagueId == null)
            return null;
        const metaSeason = this.metadataApiFootballSeason(comp.metadata);
        const labelSeason = parseApiFootballSeasonYearFromSeasonLabel(comp.season_label);
        const lt = String(comp.league_type ?? "").trim();
        const season = labelSeason ??
            metaSeason ??
            (lt ? defaultApiFootballSeasonForLeagueType(lt) : null);
        if (season == null || !Number.isFinite(season) || season <= 0)
            return null;
        return { leagueId, season: Math.floor(season) };
    }
    /** True if any fixture_mapping rows exist for this league + season (shared across pools). */
    async fixtureMappingsExistForLeagueSeason(leagueId, season) {
        const r = await this.request("db.fixture_mappings.existsLeagueSeason", `${this.dbBase}/fixture_mappings?api_football_league_id=eq.${encodeURIComponent(String(leagueId))}&season=eq.${encodeURIComponent(String(season))}&select=id&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        return Array.isArray(data) && data.length > 0;
    }
    async listFixtureMappingsByLeagueSeason(leagueId, season) {
        const select = encodeURIComponent("id,api_football_league_id,season,local_key,api_fixture_id,stage,kickoff_at,team_1,team_2,location,created_at");
        const r = await this.request("db.fixture_mapping.listByLeagueSeason", `${this.dbBase}/fixture_mappings?api_football_league_id=eq.${encodeURIComponent(String(leagueId))}&season=eq.${encodeURIComponent(String(season))}&select=${select}&order=local_key`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    /** List mappings for a pool by resolving its competition row to API league + season. */
    async listFixtureMappings(competitionId) {
        const comp = await this.getCompetitionById(String(competitionId));
        if (!comp || typeof comp !== "object" || Array.isArray(comp))
            return [];
        const scope = this.getFixtureMappingScopeForCompetition(comp);
        if (!scope)
            return [];
        return this.listFixtureMappingsByLeagueSeason(scope.leagueId, scope.season);
    }
    async getFixtureMappingById(id) {
        const select = encodeURIComponent("id,api_football_league_id,season,local_key,api_fixture_id,stage,kickoff_at,team_1,team_2,location,created_at");
        const r = await this.request("db.fixture_mapping.byId", `${this.dbBase}/fixture_mappings?id=eq.${encodeURIComponent(id)}&select=${select}&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return data[0];
    }
    async patchFixtureMapping(id, body) {
        const r = await this.request("db.fixture_mapping.patch", `${this.dbBase}/fixture_mappings?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(body),
        });
        return this.parseSuccessBody(r);
    }
    /**
     * Upsert many fixture_mappings rows in chunks (composite key api_football_league_id + season + local_key).
     */
    async upsertFixtureMappingsBatch(rows) {
        const CHUNK = 200;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const slice = rows.slice(i, i + CHUNK);
            const r = await this.request("db.fixture_mappings.upsertBatch", `${this.dbBase}/fixture_mappings?on_conflict=api_football_league_id,season,local_key`, {
                method: "POST",
                headers: {
                    ...this.serviceHeaders(),
                    Prefer: "resolution=merge-duplicates,return=minimal",
                },
                body: JSON.stringify(slice),
            });
            await this.parseSuccessBody(r);
        }
    }
    async upsertMatch(body) {
        const r = await this.request("db.matches.upsert", `${this.dbBase}/matches?on_conflict=external_fixture_id`, {
            method: "POST",
            headers: {
                ...this.serviceHeaders(),
                Prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(body),
        });
        return this.parseSuccessBody(r);
    }
    async getMatchByCompetitionAndExternalFixture(competitionId, externalFixtureId) {
        const r = await this.request("db.matches.byCompetitionFixture", `${this.dbBase}/matches?competition_id=eq.${encodeURIComponent(String(competitionId))}&external_fixture_id=eq.${encodeURIComponent(String(externalFixtureId))}&select=*&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return data[0];
    }
    async listPlayerStatisticsByFixture(fixtureId) {
        const sel = encodeURIComponent("land,speler_naam,player_id,punten,created_at");
        const r = await this.request("db.player_statistics.byFixture", `${this.dbBase}/player_statistics?fixture_id=eq.${encodeURIComponent(String(fixtureId))}&select=${sel}&order=land,speler_naam`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async deletePlayerStatisticsByFixture(fixtureId) {
        const r = await this.request("db.player_statistics.deleteByFixture", `${this.dbBase}/player_statistics?fixture_id=eq.${encodeURIComponent(String(fixtureId))}`, { method: "DELETE", headers: this.serviceHeaders() });
        await this.parseSuccessBody(r);
    }
    async insertPlayerStatisticsBatch(rows) {
        const CHUNK = 150;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const slice = rows.slice(i, i + CHUNK);
            const r = await this.request("db.player_statistics.insertBatch", `${this.dbBase}/player_statistics`, {
                method: "POST",
                headers: {
                    ...this.serviceHeaders(),
                    Prefer: "return=minimal",
                },
                body: JSON.stringify(slice),
            });
            await this.parseSuccessBody(r);
        }
    }
    async listScorableMatches(competitionId) {
        const r = await this.request("db.matches.scorable", `${this.dbBase}/matches?competition_id=eq.${encodeURIComponent(String(competitionId))}&status=in.(FT,AET,PEN)&select=*&order=kickoff_at.asc`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async insertScoreEventIfMissing(participantId, matchId, eventKey, deltaPoints) {
        const body = {
            participant_id: participantId,
            match_id: matchId,
            event_key: eventKey,
            delta_points: deltaPoints,
        };
        const r = await fetch(`${this.dbBase}/participant_score_events`, {
            method: "POST",
            headers: {
                ...this.serviceHeaders(),
                Prefer: "resolution=ignore-duplicates,return=representation",
            },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const payload = await this.parseJsonSafe(r);
            this.log.warn({ participantId, matchId, eventKey, payload }, "score event insert failed");
            throw new UpstreamHttpError(r.status, payload);
        }
        const out = await this.parseSuccessBody(r);
        return Array.isArray(out) && out.length > 0;
    }
    async getCompetitionBySlug(slug) {
        const r = await this.request("db.competitions.bySlug", `${this.dbBase}/competitions?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return data[0];
    }
    async getCompetitionById(id) {
        const r = await this.request("db.competitions.byId", `${this.dbBase}/competitions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return data[0];
    }
    async listCompetitionsByOwner(ownerUserId) {
        const r = await this.request("db.competitions.byOwner", `${this.dbBase}/competitions?owner_user_id=eq.${encodeURIComponent(ownerUserId)}&select=*&order=id`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    /** Competition ids where the user has a `competition_members` row (joined / invited). */
    async listCompetitionMemberIdsForUser(userId) {
        const r = await this.request("db.competition_members.byUser", `${this.dbBase}/competition_members?user_id=eq.${encodeURIComponent(userId)}&select=competition_id`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data))
            return [];
        const out = [];
        for (const row of data) {
            if (!row || typeof row !== "object" || Array.isArray(row))
                continue;
            const id = Number(row.competition_id);
            if (Number.isFinite(id) && id > 0)
                out.push(id);
        }
        return out;
    }
    async listCompetitionsByIds(ids) {
        const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
        if (uniq.length === 0)
            return [];
        const inList = uniq.map((n) => encodeURIComponent(String(n))).join(",");
        const r = await this.request("db.competitions.byIds", `${this.dbBase}/competitions?id=in.(${inList})&select=*`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async listCompetitions() {
        const r = await this.request("db.competitions.list", `${this.dbBase}/competitions?select=*&order=id`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    /** Public lookup rows for league-type dropdown (same as PostgREST anon SELECT). */
    async listApiFootballLeagueLookup() {
        const r = await this.request("db.api_football_league_lookup.list", `${this.dbBase}/api_football_league_lookup?select=league_type,league_id&order=league_type`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data))
            return [];
        const out = [];
        for (const row of data) {
            if (!row || typeof row !== "object" || Array.isArray(row))
                continue;
            const o = row;
            const lt = o.league_type;
            const lid = Number(o.league_id);
            if (typeof lt === "string" && lt.trim() && Number.isFinite(lid) && lid > 0) {
                out.push({ league_type: lt.trim(), league_id: Math.floor(lid) });
            }
        }
        return out;
    }
    async getApiFootballLeagueIdByType(leagueType) {
        const key = leagueType.trim().toLowerCase();
        if (!key)
            return null;
        const r = await this.request("db.api_football_league_lookup.byType", `${this.dbBase}/api_football_league_lookup?league_type=eq.${encodeURIComponent(key)}&select=league_id&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        const row = data[0];
        const lid = Number(row.league_id);
        return Number.isFinite(lid) && lid > 0 ? Math.floor(lid) : null;
    }
    async createCompetition(body) {
        const r = await this.request("db.competitions.insert", `${this.dbBase}/competitions`, {
            method: "POST",
            headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(body),
        });
        return this.parseSuccessBody(r);
    }
    async patchCompetition(id, body) {
        const r = await this.request("db.competitions.patch", `${this.dbBase}/competitions?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(body),
        });
        return this.parseSuccessBody(r);
    }
    async deleteCompetition(id) {
        await this.request("db.competitions.delete", `${this.dbBase}/competitions?id=eq.${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
        });
    }
    async createParticipant(body) {
        const row = typeof body === "object" && body !== null && !Array.isArray(body)
            ? { ...body }
            : {};
        delete row.competition_name;
        delete row.spelers;
        delete row.attacker_goals;
        delete row.pool_registration_starts_at;
        const r = await this.request("db.teams.insert", `${this.dbBase}/teams`, {
            method: "POST",
            headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(row),
        });
        return this.parseSuccessBody(r);
    }
    async patchParticipant(id, body) {
        const b = typeof body === "object" && body !== null && !Array.isArray(body)
            ? { ...body }
            : {};
        delete b.spelers;
        delete b.attacker_goals;
        const r = await this.request("db.teams.patch", `${this.dbBase}/teams?id=eq.${id}`, {
            method: "PATCH",
            headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(b),
        });
        return this.parseSuccessBody(r);
    }
    /** @deprecated Use rollup + recomputeTeamTotalPointsFromRollups; kept for scoring sync compatibility. */
    async patchParticipantAggregates(id, totalPoints, _attackerGoals) {
        return this.patchTeamTotalPoints(id, totalPoints);
    }
    async deleteParticipant(id) {
        await this.request("db.teams.delete", `${this.dbBase}/teams?id=eq.${id}`, {
            method: "DELETE",
            headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
        });
    }
    // --- Competition invites / members ---
    hashInviteToken(plainToken) {
        return createHash("sha256").update(plainToken.trim(), "utf8").digest("hex");
    }
    createInviteSecret() {
        const plainToken = randomBytes(24).toString("base64url");
        const tokenHash = createHash("sha256").update(plainToken, "utf8").digest("hex");
        return { plainToken, tokenHash };
    }
    async deletePendingInvitesForEmail(competitionId, email) {
        const em = encodeURIComponent(email.trim().toLowerCase());
        await this.request("db.competition_invites.deletePending", `${this.dbBase}/competition_invites?competition_id=eq.${competitionId}&email=eq.${em}&accepted_at=is.null`, {
            method: "DELETE",
            headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
        });
    }
    async insertCompetitionInvite(row) {
        const r = await this.request("db.competition_invites.insert", `${this.dbBase}/competition_invites`, {
            method: "POST",
            headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(row),
        });
        return this.parseSuccessBody(r);
    }
    async getInviteByTokenHash(tokenHash) {
        const r = await this.request("db.competition_invites.byHash", `${this.dbBase}/competition_invites?token_hash=eq.${encodeURIComponent(tokenHash)}&select=*&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        if (!Array.isArray(data) || data.length === 0)
            return null;
        return data[0];
    }
    async listCompetitionInvites(competitionId) {
        const r = await this.request("db.competition_invites.list", `${this.dbBase}/competition_invites?competition_id=eq.${competitionId}&select=id,email,created_at,expires_at,accepted_at,accepted_user_id,invited_by&order=created_at.desc`, { headers: this.serviceHeaders() });
        return this.parseSuccessBody(r);
    }
    async patchCompetitionInvite(id, body) {
        const r = await this.request("db.competition_invites.patch", `${this.dbBase}/competition_invites?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(body),
        });
        return this.parseSuccessBody(r);
    }
    async isCompetitionMember(competitionId, userId) {
        const r = await this.request("db.competition_members.check", `${this.dbBase}/competition_members?competition_id=eq.${competitionId}&user_id=eq.${encodeURIComponent(userId)}&select=competition_id&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        return Array.isArray(data) && data.length > 0;
    }
    async insertCompetitionMember(competitionId, userId, inviteId) {
        const r = await fetch(`${this.dbBase}/competition_members`, {
            method: "POST",
            headers: {
                ...this.serviceHeaders(),
                Prefer: "return=representation",
            },
            body: JSON.stringify({
                competition_id: competitionId,
                user_id: userId,
                invite_id: inviteId,
            }),
        });
        if (r.status === 201 || r.status === 200)
            return true;
        if (r.status === 409)
            return false;
        const payload = await this.parseJsonSafe(r);
        this.log.warn({ competitionId, userId, status: r.status, payload }, "competition_members insert failed");
        throw new UpstreamHttpError(r.status, payload);
    }
    // --- Fixture squad (API-Football lineups + coaches) ---
    async hasFixtureSquadMembersForFixture(fixtureId) {
        const fid = encodeURIComponent(String(fixtureId));
        const r = await this.request("db.fixture_squad_members.byFixture", `${this.dbBase}/fixture_squad_members?fixture_id=eq.${fid}&select=id&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        return Array.isArray(data) && data.length > 0;
    }
    /** Any squad row for this API-Football league + season + lineup side name (`team`). */
    async existsFixtureSquadLeagueSeasonTeam(leagueId, season, team) {
        const t = team.trim();
        if (!t)
            return false;
        const lid = encodeURIComponent(String(Math.floor(leagueId)));
        const sid = encodeURIComponent(String(Math.floor(season)));
        const qTeam = encodeURIComponent(t);
        const r = await this.request("db.fixture_squad_members.leagueSeasonTeam", `${this.dbBase}/fixture_squad_members?api_football_league_id=eq.${lid}&season=eq.${sid}&team=eq.${qTeam}&select=id&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        return Array.isArray(data) && data.length > 0;
    }
    async hasFixtureSquadFetched(fixtureId) {
        const fid = encodeURIComponent(String(fixtureId));
        const r = await this.request("db.fixture_squad_fetched.exists", `${this.dbBase}/fixture_squad_fetched?fixture_id=eq.${fid}&select=fixture_id&limit=1`, { headers: this.serviceHeaders() });
        const data = await this.parseSuccessBody(r);
        return Array.isArray(data) && data.length > 0;
    }
    async insertFixtureSquadFetchedMarker(fixtureId) {
        const r = await fetch(`${this.dbBase}/fixture_squad_fetched`, {
            method: "POST",
            headers: {
                ...this.serviceHeaders(),
                Prefer: "return=minimal,resolution=ignore-duplicates",
            },
            body: JSON.stringify({ fixture_id: fixtureId }),
        });
        if (r.status === 201 || r.status === 200 || r.status === 204)
            return;
        if (r.status === 409)
            return;
        const payload = await this.parseJsonSafe(r);
        this.log.warn({ fixtureId, status: r.status, payload }, "fixture_squad_fetched insert failed");
        throw new UpstreamHttpError(r.status, payload);
    }
    async insertFixtureSquadMembers(rows) {
        if (rows.length === 0)
            return;
        const r = await fetch(`${this.dbBase}/fixture_squad_members`, {
            method: "POST",
            headers: {
                ...this.serviceHeaders(),
                Prefer: "return=minimal,resolution=ignore-duplicates",
            },
            body: JSON.stringify(rows),
        });
        if (r.status === 201 || r.status === 200 || r.status === 204)
            return;
        const payload = await this.parseJsonSafe(r);
        this.log.warn({ count: rows.length, status: r.status, payload }, "fixture_squad_members insert failed");
        throw new UpstreamHttpError(r.status, payload);
    }
    /**
     * PostgREST exact row count (`HEAD` + `Prefer: count=exact`).
     * Parses total from the `Content-Range` header (format ends with slash + row count).
     * `query` is the path after `/rest/v1/`, e.g. `teams?select=id&email=not.eq.__config__`.
     */
    async postgrestCountExact(query) {
        const q = query.replace(/^\//, "");
        const url = `${this.dbBase}/${q}`;
        try {
            const r = await fetch(url, {
                method: "HEAD",
                headers: { ...this.serviceHeaders(), Prefer: "count=exact" },
            });
            const cr = r.headers.get("content-range") ?? r.headers.get("Content-Range") ?? "";
            const m = String(cr).match(/\/(\d+)\s*$/);
            const n = m && m[1] != null ? parseInt(m[1], 10) : 0;
            if (!r.ok) {
                this.log.warn({ url, status: r.status }, "postgrestCountExact upstream not ok");
                return 0;
            }
            return Number.isFinite(n) && n >= 0 ? n : 0;
        }
        catch (e) {
            this.log.warn({ err: e, url }, "postgrestCountExact failed");
            return 0;
        }
    }
    /** Aggregated metrics for the superadmin Analytics panel (internal API only). */
    async getAdminAnalyticsSnapshot() {
        const [competitions, competitionsWithOwner, competitionsPlatform, teamsRegistered, teamsLinkedToAuthUser, competitionMembers, invitesTotal, invitesPending, invitesAccepted, fixtureMappings, matches, participantScoreEvents, playerPointsRollupRows, fixtureSquadMembers, fixtureSquadFetched, playerStatisticsRows, apiFootballLeagueTypes,] = await Promise.all([
            this.postgrestCountExact("competitions?select=id"),
            this.postgrestCountExact("competitions?owner_user_id=not.is.null&select=id"),
            this.postgrestCountExact("competitions?owner_user_id=is.null&select=id"),
            this.postgrestCountExact("teams?email=not.eq.__config__&select=id"),
            this.postgrestCountExact("teams?email=not.eq.__config__&user_id=not.is.null&select=id"),
            this.postgrestCountExact("competition_members?select=competition_id"),
            this.postgrestCountExact("competition_invites?select=id"),
            this.postgrestCountExact("competition_invites?accepted_at=is.null&select=id"),
            this.postgrestCountExact("competition_invites?accepted_at=not.is.null&select=id"),
            this.postgrestCountExact("fixture_mappings?select=id"),
            this.postgrestCountExact("matches?select=id"),
            this.postgrestCountExact("participant_score_events?select=id"),
            this.postgrestCountExact("player_points_rollup?select=id"),
            this.postgrestCountExact("fixture_squad_members?select=id"),
            this.postgrestCountExact("fixture_squad_fetched?select=fixture_id"),
            this.postgrestCountExact("player_statistics?select=id"),
            this.postgrestCountExact("api_football_league_lookup?select=league_type"),
        ]);
        const teamCountByComp = new Map();
        try {
            const r = await this.request("db.analytics.teamsByCompetition", `${this.dbBase}/teams?email=not.eq.__config__&select=competition_id&limit=50000`, { headers: this.serviceHeaders() });
            const rows = (await this.parseSuccessBody(r));
            if (Array.isArray(rows)) {
                for (const row of rows) {
                    if (!row || typeof row !== "object" || Array.isArray(row))
                        continue;
                    const cid = Math.floor(Number(row.competition_id));
                    if (!Number.isFinite(cid) || cid <= 0)
                        continue;
                    teamCountByComp.set(cid, (teamCountByComp.get(cid) ?? 0) + 1);
                }
            }
        }
        catch {
            /* ignore */
        }
        const compsRaw = await this.listCompetitions();
        const comps = Array.isArray(compsRaw) ? compsRaw : [];
        const topPoolsByTeamCount = comps
            .map((c) => {
            if (!c || typeof c !== "object" || Array.isArray(c))
                return null;
            const rec = c;
            const id = Math.floor(Number(rec.id));
            if (!Number.isFinite(id) || id <= 0)
                return null;
            return {
                competition_id: id,
                team_count: teamCountByComp.get(id) ?? 0,
                name: rec.name != null ? String(rec.name) : null,
                slug: rec.slug != null ? String(rec.slug) : null,
                owner_user_id: rec.owner_user_id != null && String(rec.owner_user_id).trim()
                    ? String(rec.owner_user_id).trim()
                    : null,
            };
        })
            .filter((x) => x != null)
            .sort((a, b) => b.team_count - a.team_count || a.competition_id - b.competition_id)
            .slice(0, 15);
        let recentTeamRegistrations = [];
        try {
            const sel = encodeURIComponent("id,competition_id,email,teamnaam,naam,created_at");
            const r2 = await this.request("db.analytics.recentTeams", `${this.dbBase}/teams?email=not.eq.__config__&select=${sel}&order=created_at.desc&limit=10`, { headers: this.serviceHeaders() });
            const tr = (await this.parseSuccessBody(r2));
            if (Array.isArray(tr)) {
                recentTeamRegistrations = tr
                    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
                    .map((row) => {
                    const o = row;
                    return {
                        id: Math.floor(Number(o.id)) || 0,
                        competition_id: Math.floor(Number(o.competition_id)) || 0,
                        email: o.email != null ? String(o.email) : null,
                        teamnaam: o.teamnaam != null ? String(o.teamnaam) : null,
                        naam: o.naam != null ? String(o.naam) : null,
                        created_at: o.created_at != null ? String(o.created_at) : null,
                    };
                });
            }
        }
        catch {
            recentTeamRegistrations = [];
        }
        return {
            generatedAt: new Date().toISOString(),
            counts: {
                competitions,
                competitionsWithOwner,
                competitionsPlatform,
                teamsRegistered,
                teamsLinkedToAuthUser,
                competitionMembers,
                invitesTotal,
                invitesPending,
                invitesAccepted,
                fixtureMappings,
                matches,
                participantScoreEvents,
                playerPointsRollupRows,
                fixtureSquadMembers,
                fixtureSquadFetched,
                playerStatisticsRows,
                apiFootballLeagueTypes,
            },
            topPoolsByTeamCount,
            recentTeamRegistrations,
        };
    }
}
//# sourceMappingURL=supabase-gateway.js.map