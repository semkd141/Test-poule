import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../shared/http-error.js";
import { z } from "zod";
import { canAttachUserOnCreate, canMutateParticipantRow, normEmail, } from "../participant/participant-access.js";
import { isRegistrationClosedByPoolStart, shouldRedactSquadsBeforePoolStart, } from "../participant/competition-deadline.js";
import { TransactionalEmailService } from "../services/transactional-email.js";
import { startFixtureGoalRollupBackground } from "../services/fixture-goal-rollup-job.service.js";
import { getOrSyncFixtureStatistics } from "../services/fixture-statistics.service.js";
const emailQuerySchema = z.object({
    email: z.string().min(1, "email query required"),
    competition_id: z.coerce.number().int().positive().optional(),
});
const idParamSchema = z.object({
    id: z.string().min(1, "id required"),
});
const competitionIdParamSchema = z.object({
    competitionId: z.coerce.number().int().positive(),
});
const fixtureStatisticsBodySchema = z.object({
    fixtureId: z.coerce.number().int().positive(),
});
function resolveJoinCompetitionId(req) {
    const p = req.params?.competitionId;
    if (p !== undefined && p !== null && String(p).trim() !== "") {
        const parsed = competitionIdParamSchema.safeParse(req.params);
        if (!parsed.success)
            throw new HttpError(400, "Invalid competition id");
        return parsed.data.competitionId;
    }
    const body = asObjectBody(req.body);
    const raw = body.competition_id ?? body.competitionId;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        throw new HttpError(400, "competition_id required");
    }
    return n;
}
const patchTeamRollupsSchema = z.object({
    players: z.array(z.object({
        player_id: z.coerce.number().int().positive(),
        pos: z.union([z.string(), z.null()]).optional(),
        is_captain: z.boolean().optional(),
        points: z.coerce.number().int().nonnegative().optional(),
    })),
});
function pickRicherString(a, b) {
    const as = a != null && String(a).trim() ? String(a).trim() : "";
    const bs = b != null && String(b).trim() ? String(b).trim() : "";
    if (!as)
        return bs || null;
    if (!bs)
        return as;
    return bs.length > as.length ? bs : as;
}
/** One row per `player_id`; merge duplicates (multiple fixtures) preferring non-empty name/team/pos. */
function dedupeFixtureSquadRoster(rows) {
    const map = new Map();
    for (const row of rows) {
        const pid = Math.floor(Number(row.player_id));
        if (!Number.isFinite(pid) || pid <= 0)
            continue;
        const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
        const team = typeof row.team === "string" && row.team.trim() ? row.team.trim() : null;
        const pos = typeof row.pos === "string" && row.pos.trim() ? row.pos.trim() : null;
        const prev = map.get(pid);
        if (!prev) {
            map.set(pid, { player_id: pid, name, team, pos });
            continue;
        }
        map.set(pid, {
            player_id: pid,
            name: pickRicherString(prev.name, name),
            team: pickRicherString(prev.team, team),
            pos: pickRicherString(prev.pos, pos),
        });
    }
    return [...map.values()].sort((a, b) => a.player_id - b.player_id);
}
async function assertRollupPlayersAllowedForLeagueSeason(gateway, leagueId, season, players) {
    const raw = await gateway.listFixtureSquadMembersByLeagueSeason(leagueId, season);
    const roster = dedupeFixtureSquadRoster(asRows(raw));
    if (roster.length === 0) {
        throw new HttpError(400, "No squad data loaded for this pool yet (fixture squads). Ask the organizer to fetch squads.");
    }
    const allowed = new Set(roster.map((r) => r.player_id));
    const teamByPlayer = new Map(roster.map((r) => [r.player_id, r.team ?? ""]));
    const ids = players.map((p) => Math.floor(Number(p.player_id)));
    if (ids.some((id) => !Number.isFinite(id) || id <= 0)) {
        throw new HttpError(400, "Invalid player_id in squad");
    }
    if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, "Duplicate player_id in squad");
    }
    for (const id of ids) {
        if (!allowed.has(id)) {
            throw new HttpError(400, "One or more players are not in the official squad data for this pool");
        }
    }
    const teamKeys = ids.map((id) => {
        const c = String(teamByPlayer.get(id) ?? "").trim().toLowerCase();
        return c || `__p${id}`;
    });
    if (new Set(teamKeys).size !== teamKeys.length) {
        throw new HttpError(400, "Each national team may only appear once in your squad");
    }
}
function asObjectBody(raw) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        return {};
    return { ...raw };
}
function mergeUserStamp(req) {
    const row = req.participantRow;
    const jwt = req.supabaseUser;
    if (!row || !jwt?.sub)
        return {};
    if (!canMutateParticipantRow(row, jwt))
        return {};
    return { user_id: jwt.sub };
}
function sanitizePatchBody(req, base) {
    const out = { ...base };
    delete out.user_id;
    return { ...out, ...mergeUserStamp(req) };
}
function isAdminBySecret(req, env) {
    const role = String(req.supabaseUser?.role ?? "");
    const appRole = String(req.supabaseUser?.app_metadata &&
        typeof req.supabaseUser.app_metadata === "object"
        ? req.supabaseUser.app_metadata.role ?? ""
        : "");
    return Boolean((env.ADMIN_API_SECRET && req.get("x-admin-secret") === env.ADMIN_API_SECRET) ||
        (env.ADMIN_UID && String(req.supabaseUser?.sub ?? "") === env.ADMIN_UID) ||
        role === "admin" ||
        role === "service_role" ||
        appRole === "admin");
}
function asRows(data) {
    if (!Array.isArray(data))
        return [];
    return data.filter((x) => x && typeof x === "object" && !Array.isArray(x));
}
function optionalTrimmedText(v) {
    if (v === undefined || v === null)
        return null;
    const s = String(v).trim();
    return s === "" ? null : s;
}
function slimPublicCreator(user) {
    if (!user)
        return null;
    const id = user.id;
    if (typeof id !== "string" || !id.trim())
        return null;
    const email = typeof user.email === "string" ? user.email : null;
    const metaRaw = user.user_metadata;
    const meta = metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
        ? metaRaw
        : {};
    const full_name = (typeof meta.full_name === "string" && meta.full_name.trim()
        ? meta.full_name.trim()
        : null) ||
        (typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : null);
    return { id: id.trim(), email, full_name };
}
/**
 * Owner-created pools (`owner_user_id` set): only users with a `competition_members` row may register a team.
 * Membership is recorded via POST /participants/join (e.g. from the public pool list) or POST /invites/accept.
 * Platform pools (`owner_user_id` null) use the same join endpoint without an invite.
 */
async function assertMayRegisterInOwnedCompetition(gateway, body, jwt) {
    const raw = body.competition_id;
    if (raw === undefined || raw === null || raw === "")
        return;
    const competitionId = Number(raw);
    if (!Number.isFinite(competitionId) || competitionId <= 0) {
        throw new HttpError(400, "Invalid competition_id");
    }
    const comp = await gateway.getCompetitionById(String(competitionId));
    if (!comp)
        throw new HttpError(404, "Competition not found");
    const owner = comp.owner_user_id;
    if (owner == null || owner === undefined)
        return;
    const uid = jwt?.sub;
    if (!uid || typeof uid !== "string")
        throw new HttpError(401, "Authorization required");
    const isMember = await gateway.isCompetitionMember(competitionId, uid);
    if (!isMember) {
        throw new HttpError(403, "Join this pool first (Participate → pool list, or the invitation link in your email), then register your team.");
    }
}
/** Legacy JSON `spelers` on create/patch → `teams.registration_deadline_*` (no JSON stored on teams). */
function mergeSpelersDeadlineIntoTeamPayload(payload) {
    const sp = payload.spelers;
    if (sp === undefined)
        return;
    let cfg = null;
    if (typeof sp === "string") {
        try {
            const p = JSON.parse(sp);
            cfg = p && typeof p === "object" && !Array.isArray(p) ? p : null;
        }
        catch {
            cfg = null;
        }
    }
    else if (sp && typeof sp === "object" && !Array.isArray(sp)) {
        cfg = sp;
    }
    if (cfg?.deadline !== undefined && cfg.deadline !== null && String(cfg.deadline).trim()) {
        payload.registration_deadline_at = String(cfg.deadline);
    }
    if (cfg?.deadlineLabel !== undefined && cfg.deadlineLabel !== null && String(cfg.deadlineLabel).trim()) {
        payload.registration_deadline_label = String(cfg.deadlineLabel).trim();
    }
    delete payload.spelers;
}
/** Public summary shape for registerable pools (no `creator` enrichment). */
function mapCompetitionRowToPublicSummary(r, counts) {
    const id = Number(r.id);
    const ownerRaw = r.owner_user_id;
    const ownerId = ownerRaw !== undefined && ownerRaw !== null && String(ownerRaw).trim()
        ? String(ownerRaw).trim()
        : "";
    const meta = r.metadata;
    const comp = r;
    const startsRaw = r.starts_at;
    let registrationDeadline = null;
    if (startsRaw !== undefined && startsRaw !== null && String(startsRaw).trim() !== "") {
        const d = new Date(String(startsRaw));
        if (!Number.isNaN(d.getTime()))
            registrationDeadline = d.toISOString();
    }
    const lid = r.api_football_league_id;
    const apiFootballLeagueId = lid !== undefined && lid !== null && String(lid).trim() !== "" && Number.isFinite(Number(lid))
        ? Math.floor(Number(lid))
        : null;
    return {
        id,
        slug: r.slug,
        name: r.name,
        league_type: r.league_type != null && String(r.league_type).trim() ? String(r.league_type).trim() : null,
        api_football_league_id: apiFootballLeagueId,
        season_label: r.season_label ?? null,
        starts_at: r.starts_at ?? null,
        metadata: meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {},
        created_at: r.created_at ?? null,
        owner_user_id: ownerId || null,
        creator: null,
        registration_deadline: registrationDeadline,
        registration_deadline_label: null,
        registration_open: !isRegistrationClosedByPoolStart(comp),
        team_count: Number.isFinite(id) ? counts.get(id) ?? 0 : 0,
    };
}
function redactForPublicSummary(row) {
    const totalPoints = Number(row.total_points ?? 0) || 0;
    return {
        id: row.id,
        naam: row.naam,
        teamnaam: row.teamnaam,
        systeem: row.systeem,
        competition_id: row.competition_id,
        spelers: [],
        totalPoints,
        hiddenBeforeDeadline: true,
    };
}
function filterRowsBeforePoolStart(rows, startsAtByCompetitionId, req) {
    const jwt = req.supabaseUser;
    return rows.map((row) => {
        if (row.email === "__config__")
            return row;
        const sid = row.competition_id;
        const cid = sid !== undefined && sid !== null ? Number(sid) : NaN;
        const startsRaw = Number.isFinite(cid) && startsAtByCompetitionId.has(cid)
            ? startsAtByCompetitionId.get(cid)
            : null;
        if (!shouldRedactSquadsBeforePoolStart(startsRaw))
            return row;
        if (canMutateParticipantRow(row, jwt))
            return row;
        return redactForPublicSummary(row);
    });
}
export function createParticipantsHandlers(gateway, env, log) {
    const mailer = new TransactionalEmailService(env);
    return {
        listApiFootballLeagueTypes: asyncHandler(async (_req, res) => {
            const rows = await gateway.listApiFootballLeagueLookup();
            res.json(rows);
        }),
        listParticipants: asyncHandler(async (req, res) => {
            const data = await gateway.listParticipants();
            const rows = asRows(data);
            const compData = await gateway.listCompetitions();
            const compRows = asRows(compData);
            const startsAtByCompetitionId = new Map();
            for (const c of compRows) {
                const id = Number(c.id);
                if (!Number.isFinite(id))
                    continue;
                const sa = c.starts_at;
                startsAtByCompetitionId.set(id, sa !== undefined && sa !== null && String(sa).trim() !== "" ? String(sa) : null);
            }
            // Privacy: hide other squads until pool start (`starts_at`) unless admin or legacy-open mode.
            if (!isAdminBySecret(req, env) && !env.PARTICIPANT_LEGACY_OPEN_MUTATIONS) {
                res.json(filterRowsBeforePoolStart(rows, startsAtByCompetitionId, req));
                return;
            }
            res.json(rows);
        }),
        listLeaderboard: asyncHandler(async (req, res) => {
            const data = await gateway.listParticipants();
            const rows = asRows(data).filter((r) => r.email !== "__config__");
            const withScores = rows.map((r) => {
                const totalPoints = Number(r.total_points ?? 0) || 0;
                return {
                    id: r.id,
                    naam: r.naam,
                    teamnaam: r.teamnaam,
                    total_points: totalPoints,
                    attacker_goals: 0,
                };
            });
            withScores.sort((a, b) => {
                if (b.total_points !== a.total_points)
                    return b.total_points - a.total_points;
                if (b.attacker_goals !== a.attacker_goals)
                    return b.attacker_goals - a.attacker_goals;
                return String(a.teamnaam ?? "").localeCompare(String(b.teamnaam ?? ""));
            });
            res.json(withScores);
        }),
        findParticipantByEmail: asyncHandler(async (req, res) => {
            const parsed = emailQuerySchema.safeParse({
                email: req.query.email,
                competition_id: req.query.competition_id,
            });
            if (!parsed.success)
                throw new HttpError(400, "email query parameter required");
            const { email, competition_id: competitionFilter } = parsed.data;
            const data = competitionFilter !== undefined
                ? await gateway.findParticipantByEmailAndCompetition(email, competitionFilter)
                : await gateway.findParticipantByEmail(email);
            const rows = asRows(data);
            const row = rows[0];
            if (!row) {
                res.json([]);
                return;
            }
            const competitionId = row.competition_id;
            if (competitionId !== undefined && competitionId !== null) {
                const comp = await gateway.getCompetitionById(String(competitionId));
                const startsAt = comp?.starts_at != null ? String(comp.starts_at) : null;
                const beforeKickoff = shouldRedactSquadsBeforePoolStart(startsAt);
                if (beforeKickoff && !isAdminBySecret(req, env)) {
                    if (!canMutateParticipantRow(row, req.supabaseUser)) {
                        throw new HttpError(403, "Not allowed to read another user's team before pool start");
                    }
                }
            }
            res.json([row]);
        }),
        listPublicCompetitions: asyncHandler(async (_req, res) => {
            const raw = await gateway.listCompetitions();
            const rows = asRows(raw);
            const counts = await gateway.fetchParticipantCountsByCompetition();
            const ownerIds = new Set();
            for (const r of rows) {
                const o = r.owner_user_id;
                if (o !== undefined && o !== null && String(o).trim())
                    ownerIds.add(String(o).trim());
            }
            const creatorByOwner = new Map();
            await Promise.all([...ownerIds].map(async (uid) => {
                const u = await gateway.adminGetUserById(uid);
                creatorByOwner.set(uid, slimPublicCreator(u));
            }));
            const out = rows.map((r) => {
                const id = Number(r.id);
                const ownerRaw = r.owner_user_id;
                const ownerId = ownerRaw !== undefined && ownerRaw !== null && String(ownerRaw).trim()
                    ? String(ownerRaw).trim()
                    : "";
                const meta = r.metadata;
                const comp = r;
                const startsRaw = r.starts_at;
                let registrationDeadline = null;
                if (startsRaw !== undefined && startsRaw !== null && String(startsRaw).trim() !== "") {
                    const d = new Date(String(startsRaw));
                    if (!Number.isNaN(d.getTime()))
                        registrationDeadline = d.toISOString();
                }
                const lid = r.api_football_league_id;
                const apiFootballLeagueId = lid !== undefined && lid !== null && String(lid).trim() !== "" && Number.isFinite(Number(lid))
                    ? Math.floor(Number(lid))
                    : null;
                return {
                    id,
                    slug: r.slug,
                    name: r.name,
                    league_type: r.league_type != null && String(r.league_type).trim() ? String(r.league_type).trim() : null,
                    api_football_league_id: apiFootballLeagueId,
                    season_label: r.season_label ?? null,
                    starts_at: r.starts_at ?? null,
                    metadata: meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {},
                    created_at: r.created_at ?? null,
                    owner_user_id: ownerId || null,
                    creator: ownerId ? creatorByOwner.get(ownerId) ?? null : null,
                    registration_deadline: registrationDeadline,
                    registration_deadline_label: null,
                    registration_open: !isRegistrationClosedByPoolStart(comp),
                    team_count: Number.isFinite(id) ? counts.get(id) ?? 0 : 0,
                };
            });
            res.json(out);
        }),
        listPublicFixtureMappings: asyncHandler(async (req, res) => {
            const parsed = competitionIdParamSchema.safeParse(req.params);
            if (!parsed.success)
                throw new HttpError(400, "Invalid competition id");
            const competitionId = parsed.data.competitionId;
            const comp = await gateway.getCompetitionById(String(competitionId));
            if (!comp)
                throw new HttpError(404, "Competition not found");
            const raw = await gateway.listFixtureMappings(competitionId);
            const rows = asRows(raw);
            const out = rows.map((r) => ({
                id: r.id,
                api_football_league_id: r.api_football_league_id,
                season: r.season,
                local_key: r.local_key ?? null,
                api_fixture_id: r.api_fixture_id ?? null,
                stage: r.stage ?? null,
                kickoff_at: r.kickoff_at ?? null,
                team_1: optionalTrimmedText(r.team_1),
                team_2: optionalTrimmedText(r.team_2),
                location: r.location ?? null,
                created_at: r.created_at ?? null,
            }));
            log.info({ out }, "listPublicFixtureMappings result");
            res.json(out);
        }),
        /** Distinct players from `fixture_squad_members` for this pool's API-Football league + season (picker data). */
        listPublicCompetitionSquadRoster: asyncHandler(async (req, res) => {
            const parsed = competitionIdParamSchema.safeParse(req.params);
            if (!parsed.success)
                throw new HttpError(400, "Invalid competition id");
            const competitionId = parsed.data.competitionId;
            const comp = await gateway.getCompetitionById(String(competitionId));
            if (!comp)
                throw new HttpError(404, "Competition not found");
            const scope = gateway.getFixtureMappingScopeForCompetition(comp);
            if (!scope) {
                res.json([]);
                return;
            }
            const raw = await gateway.listFixtureSquadMembersByLeagueSeason(scope.leagueId, scope.season);
            res.json(dedupeFixtureSquadRoster(asRows(raw)));
        }),
        postCompetitionFixtureStatistics: asyncHandler(async (req, res) => {
            const parsed = competitionIdParamSchema.safeParse(req.params);
            if (!parsed.success)
                throw new HttpError(400, "Invalid competition id");
            const body = fixtureStatisticsBodySchema.safeParse(req.body ?? {});
            if (!body.success) {
                throw new HttpError(400, body.error.issues.map((i) => i.message).join("; "));
            }
            const out = await getOrSyncFixtureStatistics(gateway, env, parsed.data.competitionId, body.data.fixtureId);
            if (out.source === "api_football") {
                const m = out.match;
                const mid = m?.id != null ? Number(m.id) : NaN;
                if (Number.isFinite(mid) && mid > 0) {
                    startFixtureGoalRollupBackground({
                        competitionId: parsed.data.competitionId,
                        externalFixtureId: body.data.fixtureId,
                        matchId: mid,
                    }, gateway, log);
                }
                else {
                    log.warn({ competitionId: parsed.data.competitionId, fixtureId: body.data.fixtureId }, "fixture statistics synced from API but match row has no id; skipping goal rollup job");
                }
            }
            res.json(out);
        }),
        listMyParticipants: asyncHandler(async (req, res) => {
            const jwt = req.supabaseUser;
            const email = jwt?.email !== undefined ? normEmail(jwt.email) : "";
            if (!email)
                throw new HttpError(400, "JWT has no email claim");
            const data = await gateway.findAllParticipantsByEmail(email);
            const rows = asRows(data).filter((r) => r.email !== "__config__" && canMutateParticipantRow(r, jwt));
            res.json(rows.map((r) => ({
                id: r.id,
                competition_id: r.competition_id,
                naam: r.naam,
                teamnaam: r.teamnaam,
            })));
        }),
        listMyRegisterableCompetitions: asyncHandler(async (req, res) => {
            const jwt = req.supabaseUser;
            const uid = jwt?.sub;
            if (!uid || typeof uid !== "string")
                throw new HttpError(401, "Authorization required");
            const memberIds = await gateway.listCompetitionMemberIdsForUser(uid);
            /** Register tab: pools you are a member of, excluding pools you organize (participant view). */
            const idSet = new Set();
            for (const mid of memberIds) {
                if (Number.isFinite(mid) && mid > 0)
                    idSet.add(mid);
            }
            const allIds = [...idSet];
            const raw = allIds.length === 0 ? [] : await gateway.listCompetitionsByIds(allIds);
            const rows = asRows(raw);
            const counts = await gateway.fetchParticipantCountsByCompetition();
            const out = rows
                .map((r) => mapCompetitionRowToPublicSummary(r, counts))
                .filter((c) => String(c.owner_user_id ?? "") !== uid);
            out.sort((a, b) => Number(a.id) - Number(b.id));
            res.json(out);
        }),
        /**
         * Pools relevant for My Team: `competition_members`, pools you own, or where you already have a team row.
         * Not the full public catalogue. (Register tab uses `registerable-competitions`, which omits pools you organize.)
         */
        listMyTeamCompetitions: asyncHandler(async (req, res) => {
            const jwt = req.supabaseUser;
            const uid = jwt?.sub;
            const email = jwt?.email !== undefined ? normEmail(jwt.email) : "";
            if (!uid || typeof uid !== "string")
                throw new HttpError(401, "Authorization required");
            const memberIds = await gateway.listCompetitionMemberIdsForUser(uid);
            const ownedRaw = await gateway.listCompetitionsByOwner(uid);
            const ownedRows = asRows(ownedRaw);
            const idSet = new Set();
            for (const mid of memberIds) {
                if (Number.isFinite(mid) && mid > 0)
                    idSet.add(mid);
            }
            for (const row of ownedRows) {
                const id = Number(row.id);
                if (Number.isFinite(id) && id > 0)
                    idSet.add(id);
            }
            if (email) {
                const mineData = await gateway.findAllParticipantsByEmail(email);
                const mine = asRows(mineData).filter((r) => r.email !== "__config__" && canMutateParticipantRow(r, jwt));
                for (const r of mine) {
                    const cid = Number(r.competition_id);
                    if (Number.isFinite(cid) && cid > 0)
                        idSet.add(cid);
                }
            }
            const allIds = [...idSet];
            const raw = allIds.length === 0 ? [] : await gateway.listCompetitionsByIds(allIds);
            const rows = asRows(raw);
            const counts = await gateway.fetchParticipantCountsByCompetition();
            const out = rows.map((r) => mapCompetitionRowToPublicSummary(r, counts));
            out.sort((a, b) => Number(a.id) - Number(b.id));
            res.json(out);
        }),
        listPlayers: asyncHandler(async (_req, res) => {
            const data = await gateway.listWkSpelers();
            res.json(data);
        }),
        /**
         * Records `competition_members` so the signed-in user may register a team.
         * Works for platform pools and organizer-owned pools listed publicly; organizer cannot join their own pool here.
         * Invite links still use POST /invites/accept (sets `invite_id` and validates email).
         */
        joinCompetition: asyncHandler(async (req, res) => {
            const competitionId = resolveJoinCompetitionId(req);
            const jwt = req.supabaseUser;
            const uid = jwt?.sub;
            if (!uid || typeof uid !== "string")
                throw new HttpError(401, "Authorization required");
            const comp = await gateway.getCompetitionById(String(competitionId));
            if (!comp)
                throw new HttpError(404, "Competition not found");
            const owner = comp.owner_user_id;
            const ownerStr = owner != null && owner !== undefined ? String(owner).trim() : "";
            if (ownerStr && ownerStr === uid) {
                throw new HttpError(403, "This is a pool you created. Use the Competition tab to manage it—you cannot join it here as a player.");
            }
            if (isRegistrationClosedByPoolStart(comp)) {
                throw new HttpError(403, "This pool has already started. Registration is closed.");
            }
            const name = String(comp.name ?? "");
            const slug = comp.slug !== undefined && comp.slug !== null ? String(comp.slug) : "";
            if (await gateway.isCompetitionMember(competitionId, uid)) {
                res.json({
                    ok: true,
                    alreadyMember: true,
                    competitionId,
                    competitionName: name,
                    slug,
                });
                return;
            }
            const inserted = await gateway.insertCompetitionMember(competitionId, uid, null);
            if (!inserted) {
                if (await gateway.isCompetitionMember(competitionId, uid)) {
                    res.json({
                        ok: true,
                        alreadyMember: true,
                        competitionId,
                        competitionName: name,
                        slug,
                    });
                    return;
                }
                throw new HttpError(409, "Could not record pool membership");
            }
            res.json({
                ok: true,
                alreadyMember: false,
                competitionId,
                competitionName: name,
                slug,
            });
        }),
        createParticipant: asyncHandler(async (req, res) => {
            const body = asObjectBody(req.body);
            delete body.user_id;
            /** Frontend may send `competitionId` (camelCase); DB + duplicate check use `competition_id`. */
            if (body.competition_id == null && body.competitionId != null) {
                body.competition_id = body.competitionId;
            }
            const jwt = req.supabaseUser;
            const adminOk = isAdminBySecret(req, env);
            if (!adminOk) {
                if (!jwt?.sub)
                    throw new HttpError(401, "Authorization Bearer token required");
                if (!canAttachUserOnCreate(body.email, jwt)) {
                    throw new HttpError(403, "Authenticated email must match registration email");
                }
                body.user_id = jwt.sub;
                await assertMayRegisterInOwnedCompetition(gateway, body, jwt);
            }
            const rawCid = body.competition_id;
            let resolvedCompetitionId;
            if (rawCid !== undefined && rawCid !== null && String(rawCid).trim() !== "") {
                resolvedCompetitionId = Number(rawCid);
                if (!Number.isFinite(resolvedCompetitionId) || resolvedCompetitionId <= 0) {
                    throw new HttpError(400, "Invalid competition_id");
                }
            }
            else {
                const def = await gateway.getCompetitionBySlug("wc2026");
                if (!def?.id)
                    throw new HttpError(500, "Default competition (wc2026) not found");
                resolvedCompetitionId = Number(def.id);
                if (!Number.isFinite(resolvedCompetitionId)) {
                    throw new HttpError(500, "Default competition id invalid");
                }
            }
            const emailNorm = normEmail(body.email);
            /** One team per email per pool only; same email may register in other competitions. */
            const dup = asRows(await gateway.findParticipantByEmailAndCompetition(emailNorm, resolvedCompetitionId));
            if (dup.length > 0) {
                throw new HttpError(409, "This email is already registered for this competition");
            }
            const compRow = await gateway.getCompetitionById(String(resolvedCompetitionId));
            if (!adminOk && isRegistrationClosedByPoolStart(compRow)) {
                throw new HttpError(403, "This pool has already started. Registration is closed.");
            }
            let competitionName = typeof body.competition_name === "string" && body.competition_name.trim()
                ? body.competition_name.trim()
                : "";
            if (!competitionName && compRow && typeof compRow === "object" && compRow !== null) {
                const n = compRow.name;
                if (typeof n === "string" && n.trim())
                    competitionName = n.trim();
            }
            if (!competitionName)
                competitionName = "WK 2026 Poule";
            const poolStartsAt = typeof body.pool_registration_starts_at === "string" && body.pool_registration_starts_at.trim()
                ? body.pool_registration_starts_at.trim()
                : null;
            const insertPayload = { ...body };
            delete insertPayload.competition_name;
            delete insertPayload.competitionId;
            delete insertPayload.pool_registration_starts_at;
            insertPayload.competition_id = resolvedCompetitionId;
            if (typeof insertPayload.email === "string")
                insertPayload.email = emailNorm;
            mergeSpelersDeadlineIntoTeamPayload(insertPayload);
            const data = await gateway.createParticipant(insertPayload);
            if (poolStartsAt) {
                const rawStart = compRow.starts_at;
                const unset = rawStart === undefined || rawStart === null || String(rawStart).trim() === "";
                if (unset) {
                    const d = new Date(poolStartsAt);
                    if (!Number.isNaN(d.getTime())) {
                        try {
                            await gateway.patchCompetition(String(resolvedCompetitionId), {
                                starts_at: d.toISOString(),
                            });
                        }
                        catch {
                            /* non-blocking: team row still created */
                        }
                    }
                }
            }
            if (typeof body.email === "string" && body.email.trim()) {
                try {
                    await mailer.sendSignupConfirmation(body.email.trim(), competitionName);
                }
                catch {
                    /* non-blocking: registration succeeds even if email provider is down */
                }
            }
            res.json(data);
        }),
        listParticipantPlayerRollups: asyncHandler(async (req, res) => {
            const params = idParamSchema.safeParse(req.params);
            if (!params.success)
                throw new HttpError(400, "Invalid id");
            const team = req.participantRow;
            if (!team)
                throw new HttpError(404, "Team not found");
            const cid = Number(team.competition_id);
            if (!Number.isFinite(cid) || cid <= 0)
                throw new HttpError(500, "Invalid team competition_id");
            const comp = await gateway.getCompetitionById(String(cid));
            if (!comp)
                throw new HttpError(404, "Competition not found");
            const scope = gateway.getFixtureMappingScopeForCompetition(comp);
            if (!scope) {
                res.json([]);
                return;
            }
            const teamId = Number(team.id);
            if (!Number.isFinite(teamId) || teamId <= 0)
                throw new HttpError(500, "Invalid team id");
            const raw = await gateway.listPlayerRollupsByTeamLeagueSeason(teamId, scope.leagueId, scope.season, "created_at.asc");
            res.json(Array.isArray(raw) ? raw : []);
        }),
        patchParticipantPlayers: asyncHandler(async (req, res) => {
            const params = idParamSchema.safeParse(req.params);
            if (!params.success)
                throw new HttpError(400, "Invalid id");
            const body = patchTeamRollupsSchema.safeParse(req.body ?? {});
            if (!body.success) {
                throw new HttpError(400, body.error.issues.map((i) => i.message).join("; "));
            }
            const team = await gateway.getParticipant(params.data.id);
            if (!team)
                throw new HttpError(404, "Team not found");
            const cid = Number(team.competition_id);
            if (!Number.isFinite(cid) || cid <= 0)
                throw new HttpError(500, "Invalid team competition_id");
            const comp = await gateway.getCompetitionById(String(cid));
            if (!comp)
                throw new HttpError(404, "Competition not found");
            const scope = gateway.getFixtureMappingScopeForCompetition(comp);
            if (!scope) {
                throw new HttpError(400, "Pool has no API-Football league/season; cannot save player rollups (set competition metadata).");
            }
            const teamId = Number(team.id);
            if (!Number.isFinite(teamId) || teamId <= 0)
                throw new HttpError(500, "Invalid team id");
            await assertRollupPlayersAllowedForLeagueSeason(gateway, scope.leagueId, scope.season, body.data.players);
            await gateway.deletePlayerRollupsByTeamLeagueSeason(teamId, scope.leagueId, scope.season);
            const rows = body.data.players.map((p) => ({
                competition_id: cid,
                team_id: teamId,
                api_football_league_id: scope.leagueId,
                season: scope.season,
                player_id: p.player_id,
                pos: p.pos != null ? String(p.pos) : null,
                is_captain: Boolean(p.is_captain),
                points: p.points !== undefined ? Math.floor(Number(p.points)) : 0,
            }));
            await gateway.insertPlayerRollupsBatch(rows);
            await gateway.recomputeTeamTotalPointsFromRollups(params.data.id);
            const data = await gateway.getParticipant(params.data.id);
            res.json(data ?? { id: params.data.id });
        }),
        patchParticipant: asyncHandler(async (req, res) => {
            const params = idParamSchema.safeParse(req.params);
            if (!params.success)
                throw new HttpError(400, "Invalid id");
            const base = asObjectBody(req.body);
            mergeSpelersDeadlineIntoTeamPayload(base);
            const merged = sanitizePatchBody(req, base);
            const data = await gateway.patchParticipant(params.data.id, merged);
            res.json(data);
        }),
        deleteParticipant: asyncHandler(async (req, res) => {
            const params = idParamSchema.safeParse(req.params);
            if (!params.success)
                throw new HttpError(400, "Invalid id");
            await gateway.deleteParticipant(params.data.id);
            res.status(204).send();
        }),
    };
}
//# sourceMappingURL=participants.controller.js.map