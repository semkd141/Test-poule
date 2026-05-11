import type { Request, Response } from "express";
import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../shared/http-error.js";
import { z } from "zod";
import {
  canAttachUserOnCreate,
  canMutateParticipantRow,
  normEmail,
  type DeelnemerRow,
} from "../participant/participant-access.js";
import {
  isRegistrationClosedByPoolStart,
  shouldRedactSquadsBeforePoolStart,
} from "../participant/competition-deadline.js";
import { TransactionalEmailService } from "../services/transactional-email.js";
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

function resolveJoinCompetitionId(req: Request): number {
  const p = req.params?.competitionId;
  if (p !== undefined && p !== null && String(p).trim() !== "") {
    const parsed = competitionIdParamSchema.safeParse(req.params);
    if (!parsed.success) throw new HttpError(400, "Invalid competition id");
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

const patchPlayersSchema = z.object({
  spelers: z.unknown(),
});

function asObjectBody(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function mergeUserStamp(req: Request): Record<string, unknown> {
  const row = req.participantRow as DeelnemerRow | undefined;
  const jwt = req.supabaseUser;
  if (!row || !jwt?.sub) return {};
  if (!canMutateParticipantRow(row, jwt)) return {};
  return { user_id: jwt.sub };
}

function sanitizePatchBody(req: Request, base: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  delete out.user_id;
  return { ...out, ...mergeUserStamp(req) };
}

export type ParticipantsHandlers = {
  listParticipants: ReturnType<typeof asyncHandler>;
  listLeaderboard: ReturnType<typeof asyncHandler>;
  findParticipantByEmail: ReturnType<typeof asyncHandler>;
  listApiFootballLeagueTypes: ReturnType<typeof asyncHandler>;
  listPublicCompetitions: ReturnType<typeof asyncHandler>;
  listPublicFixtureMappings: ReturnType<typeof asyncHandler>;
  listMyParticipants: ReturnType<typeof asyncHandler>;
  listMyRegisterableCompetitions: ReturnType<typeof asyncHandler>;
  listMyTeamCompetitions: ReturnType<typeof asyncHandler>;
  listPlayers: ReturnType<typeof asyncHandler>;
  joinCompetition: ReturnType<typeof asyncHandler>;
  createParticipant: ReturnType<typeof asyncHandler>;
  patchParticipantPlayers: ReturnType<typeof asyncHandler>;
  patchParticipant: ReturnType<typeof asyncHandler>;
  deleteParticipant: ReturnType<typeof asyncHandler>;
  postCompetitionFixtureStatistics: ReturnType<typeof asyncHandler>;
};

function isAdminBySecret(req: Request, env: Env): boolean {
  const role = String(req.supabaseUser?.role ?? "");
  const appRole = String(
    (req.supabaseUser as Record<string, unknown> | undefined)?.app_metadata &&
      typeof (req.supabaseUser as Record<string, unknown>).app_metadata === "object"
      ? ((req.supabaseUser as Record<string, unknown>).app_metadata as Record<string, unknown>).role ?? ""
      : "",
  );
  return Boolean(
    (env.ADMIN_API_SECRET && req.get("x-admin-secret") === env.ADMIN_API_SECRET) ||
      (env.ADMIN_UID && String(req.supabaseUser?.sub ?? "") === env.ADMIN_UID) ||
      role === "admin" ||
      role === "service_role" ||
      appRole === "admin",
  );
}

function asRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
}

function optionalTrimmedText(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function slimPublicCreator(user: Record<string, unknown> | null): {
  id: string;
  email: string | null;
  full_name: string | null;
} | null {
  if (!user) return null;
  const id = user.id;
  if (typeof id !== "string" || !id.trim()) return null;
  const email = typeof user.email === "string" ? user.email : null;
  const metaRaw = user.user_metadata;
  const meta =
    metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
      ? (metaRaw as Record<string, unknown>)
      : {};
  const full_name =
    (typeof meta.full_name === "string" && meta.full_name.trim()
      ? meta.full_name.trim()
      : null) ||
    (typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : null);
  return { id: id.trim(), email, full_name };
}

function parseSpelers(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((x) => x && typeof x === "object") as Record<string, unknown>[]
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function totalPointsFromSpelers(raw: unknown): number {
  return parseSpelers(raw).reduce((sum, sp) => sum + (Number(sp.punten) || 0), 0);
}

async function assertMayRegisterInOwnedCompetition(
  gateway: SupabaseGateway,
  body: Record<string, unknown>,
  jwt: Request["supabaseUser"],
): Promise<void> {
  const raw = body.competition_id;
  if (raw === undefined || raw === null || raw === "") return;
  const competitionId = Number(raw);
  if (!Number.isFinite(competitionId) || competitionId <= 0) {
    throw new HttpError(400, "Invalid competition_id");
  }
  const comp = await gateway.getCompetitionById(String(competitionId));
  if (!comp) throw new HttpError(404, "Competition not found");
  const owner = comp.owner_user_id;
  if (owner == null || owner === undefined) return;
  const uid = jwt?.sub;
  if (!uid || typeof uid !== "string") throw new HttpError(401, "Authorization required");
  if (String(owner) === uid) return;
  const isMember = await gateway.isCompetitionMember(competitionId, uid);
  if (!isMember) {
    throw new HttpError(
      403,
      "Use the invitation link sent to your email and sign in with that address before registering for this pool.",
    );
  }
}

function attackerGoalsFromSpelers(raw: unknown): number {
  return parseSpelers(raw).reduce((sum, sp) => {
    const pos = String(sp.positie ?? "").toLowerCase();
    const isAtt = pos === "att" || pos === "aanvaller" || pos === "forward" || pos === "striker";
    return sum + (isAtt ? Number(sp.goals) || 0 : 0);
  }, 0);
}

/** Public summary shape for registerable pools (no `creator` enrichment). */
function mapCompetitionRowToPublicSummary(
  r: Record<string, unknown>,
  counts: Map<number, number>,
): Record<string, unknown> {
  const id = Number(r.id);
  const ownerRaw = r.owner_user_id;
  const ownerId =
    ownerRaw !== undefined && ownerRaw !== null && String(ownerRaw).trim()
      ? String(ownerRaw).trim()
      : "";
  const meta = r.metadata;
  const comp = r as Record<string, unknown>;
  const startsRaw = r.starts_at;
  let registrationDeadline: string | null = null;
  if (startsRaw !== undefined && startsRaw !== null && String(startsRaw).trim() !== "") {
    const d = new Date(String(startsRaw));
    if (!Number.isNaN(d.getTime())) registrationDeadline = d.toISOString();
  }
  const lid = r.api_football_league_id;
  const apiFootballLeagueId =
    lid !== undefined && lid !== null && String(lid).trim() !== "" && Number.isFinite(Number(lid))
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

function redactForPublicSummary(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    naam: row.naam,
    teamnaam: row.teamnaam,
    systeem: row.systeem,
    competition_id: row.competition_id,
    spelers: [],
    totalPoints: totalPointsFromSpelers(row.spelers),
    hiddenBeforeDeadline: true,
  };
}

function filterRowsBeforePoolStart(
  rows: Record<string, unknown>[],
  startsAtByCompetitionId: Map<number, string | null>,
  req: Request,
): Record<string, unknown>[] {
  const jwt = req.supabaseUser;
  return rows.map((row) => {
    if (row.email === "__config__") return row;
    const sid = row.competition_id;
    const cid = sid !== undefined && sid !== null ? Number(sid) : NaN;
    const startsRaw =
      Number.isFinite(cid) && startsAtByCompetitionId.has(cid)
        ? startsAtByCompetitionId.get(cid)
        : null;
    if (!shouldRedactSquadsBeforePoolStart(startsRaw)) return row;
    if (canMutateParticipantRow(row as DeelnemerRow, jwt)) return row;
    return redactForPublicSummary(row);
  });
}

export function createParticipantsHandlers(
  gateway: SupabaseGateway,
  env: Env,
  log: AppLogger,
): ParticipantsHandlers {
  const mailer = new TransactionalEmailService(env);
  return {
    listApiFootballLeagueTypes: asyncHandler(async (_req: Request, res: Response) => {
      const rows = await gateway.listApiFootballLeagueLookup();
      res.json(rows);
    }),

    listParticipants: asyncHandler(async (req: Request, res: Response) => {
      const data = await gateway.listParticipants();
      const rows = asRows(data);
      const compData = await gateway.listCompetitions();
      const compRows = asRows(compData);
      const startsAtByCompetitionId = new Map<number, string | null>();
      for (const c of compRows) {
        const id = Number(c.id);
        if (!Number.isFinite(id)) continue;
        const sa = c.starts_at;
        startsAtByCompetitionId.set(
          id,
          sa !== undefined && sa !== null && String(sa).trim() !== "" ? String(sa) : null,
        );
      }
      // Privacy: hide other squads until pool start (`starts_at`) unless admin or legacy-open mode.
      if (!isAdminBySecret(req, env) && !env.PARTICIPANT_LEGACY_OPEN_MUTATIONS) {
        res.json(filterRowsBeforePoolStart(rows, startsAtByCompetitionId, req));
        return;
      }
      res.json(rows);
    }),

    listLeaderboard: asyncHandler(async (req: Request, res: Response) => {
      const data = await gateway.listParticipants();
      const rows = asRows(data).filter((r) => r.email !== "__config__");
      const withScores = rows.map((r) => {
        const fallbackTotal = totalPointsFromSpelers(r.spelers);
        const totalPoints = Number(r.total_points ?? fallbackTotal) || 0;
        const picks = parseSpelers(r.spelers);
        const attackerGoalsFallback = picks.reduce((sum, sp) => {
          const pos = String(sp.positie ?? "").toLowerCase();
          const isAtt = pos === "att" || pos === "aanvaller" || pos === "forward" || pos === "striker";
          return sum + (isAtt ? Number(sp.goals) || 0 : 0);
        }, 0);
        const attackerGoals = Number(r.attacker_goals ?? attackerGoalsFallback) || 0;
        return {
          id: r.id,
          naam: r.naam,
          teamnaam: r.teamnaam,
          total_points: totalPoints,
          attacker_goals: attackerGoals,
        };
      });
      withScores.sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (b.attacker_goals !== a.attacker_goals) return b.attacker_goals - a.attacker_goals;
        return String(a.teamnaam ?? "").localeCompare(String(b.teamnaam ?? ""));
      });
      res.json(withScores);
    }),

    findParticipantByEmail: asyncHandler(async (req: Request, res: Response) => {
      const parsed = emailQuerySchema.safeParse({
        email: req.query.email,
        competition_id: req.query.competition_id,
      });
      if (!parsed.success) throw new HttpError(400, "email query parameter required");
      const { email, competition_id: competitionFilter } = parsed.data;
      const data =
        competitionFilter !== undefined
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
          if (!canMutateParticipantRow(row as DeelnemerRow, req.supabaseUser)) {
            throw new HttpError(403, "Not allowed to read another user's team before pool start");
          }
        }
      }
      res.json([row]);
    }),

    listPublicCompetitions: asyncHandler(async (_req: Request, res: Response) => {
      const raw = await gateway.listCompetitions();
      const rows = asRows(raw);
      const counts = await gateway.fetchParticipantCountsByCompetition();
      const ownerIds = new Set<string>();
      for (const r of rows) {
        const o = r.owner_user_id;
        if (o !== undefined && o !== null && String(o).trim()) ownerIds.add(String(o).trim());
      }
      const creatorByOwner = new Map<string, ReturnType<typeof slimPublicCreator>>();
      await Promise.all(
        [...ownerIds].map(async (uid) => {
          const u = await gateway.adminGetUserById(uid);
          creatorByOwner.set(uid, slimPublicCreator(u));
        }),
      );

      const out = rows.map((r) => {
        const id = Number(r.id);
        const ownerRaw = r.owner_user_id;
        const ownerId =
          ownerRaw !== undefined && ownerRaw !== null && String(ownerRaw).trim()
            ? String(ownerRaw).trim()
            : "";
        const meta = r.metadata;
        const comp = r as Record<string, unknown>;
        const startsRaw = r.starts_at;
        let registrationDeadline: string | null = null;
        if (startsRaw !== undefined && startsRaw !== null && String(startsRaw).trim() !== "") {
          const d = new Date(String(startsRaw));
          if (!Number.isNaN(d.getTime())) registrationDeadline = d.toISOString();
        }
        const lid = r.api_football_league_id;
        const apiFootballLeagueId =
          lid !== undefined && lid !== null && String(lid).trim() !== "" && Number.isFinite(Number(lid))
            ? Math.floor(Number(lid))
            : null;
        return {
          id,
          slug: r.slug,
          name: r.name,
          league_type:
            r.league_type != null && String(r.league_type).trim() ? String(r.league_type).trim() : null,
          api_football_league_id: apiFootballLeagueId,
          season_label: r.season_label ?? null,
          starts_at: r.starts_at ?? null,
          metadata:
            meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {},
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

    listPublicFixtureMappings: asyncHandler(async (req: Request, res: Response) => {
      const parsed = competitionIdParamSchema.safeParse(req.params);
      if (!parsed.success) throw new HttpError(400, "Invalid competition id");
      const competitionId = parsed.data.competitionId;
      const comp = await gateway.getCompetitionById(String(competitionId));
      if (!comp) throw new HttpError(404, "Competition not found");
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
      log.info({out }, "listPublicFixtureMappings result");
      res.json(out);
    }),

    postCompetitionFixtureStatistics: asyncHandler(async (req: Request, res: Response) => {
      const parsed = competitionIdParamSchema.safeParse(req.params);
      if (!parsed.success) throw new HttpError(400, "Invalid competition id");
      const body = fixtureStatisticsBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        throw new HttpError(400, body.error.issues.map((i) => i.message).join("; "));
      }
      const out = await getOrSyncFixtureStatistics(
        gateway,
        env,
        parsed.data.competitionId,
        body.data.fixtureId,
      );
      res.json(out);
    }),

    listMyParticipants: asyncHandler(async (req: Request, res: Response) => {
      const jwt = req.supabaseUser;
      const email = jwt?.email !== undefined ? normEmail(jwt.email) : "";
      if (!email) throw new HttpError(400, "JWT has no email claim");
      const data = await gateway.findAllParticipantsByEmail(email);
      const rows = asRows(data).filter(
        (r) => r.email !== "__config__" && canMutateParticipantRow(r as DeelnemerRow, jwt),
      );
      res.json(
        rows.map((r) => ({
          id: r.id,
          competition_id: r.competition_id,
          naam: r.naam,
          teamnaam: r.teamnaam,
        })),
      );
    }),

    listMyRegisterableCompetitions: asyncHandler(async (req: Request, res: Response) => {
      const jwt = req.supabaseUser;
      const uid = jwt?.sub;
      if (!uid || typeof uid !== "string") throw new HttpError(401, "Authorization required");

      const memberIds = await gateway.listCompetitionMemberIdsForUser(uid);
      const ownedRaw = await gateway.listCompetitionsByOwner(uid);
      const ownedRows = asRows(ownedRaw);
      const ownedIdSet = new Set<number>();
      for (const row of ownedRows) {
        const id = Number(row.id);
        if (Number.isFinite(id) && id > 0) ownedIdSet.add(id);
      }

      /** Register tab: only pools the user joined (invite / public join), not pools they created. */
      const idSet = new Set<number>();
      for (const mid of memberIds) {
        if (Number.isFinite(mid) && mid > 0 && !ownedIdSet.has(mid)) idSet.add(mid);
      }

      const allIds = [...idSet];
      const raw =
        allIds.length === 0 ? [] : await gateway.listCompetitionsByIds(allIds);
      const rows = asRows(raw);
      const counts = await gateway.fetchParticipantCountsByCompetition();
      const out = rows.map((r) => mapCompetitionRowToPublicSummary(r, counts));
      out.sort((a, b) => Number(a.id) - Number(b.id));
      res.json(out);
    }),

    /**
     * Pools relevant for My Team: `competition_members`, pools you own, or where you already have a deelnemer row.
     * Not the full public catalogue.
     */
    listMyTeamCompetitions: asyncHandler(async (req: Request, res: Response) => {
      const jwt = req.supabaseUser;
      const uid = jwt?.sub;
      const email = jwt?.email !== undefined ? normEmail(jwt.email) : "";
      if (!uid || typeof uid !== "string") throw new HttpError(401, "Authorization required");

      const memberIds = await gateway.listCompetitionMemberIdsForUser(uid);
      const ownedRaw = await gateway.listCompetitionsByOwner(uid);
      const ownedRows = asRows(ownedRaw);

      const idSet = new Set<number>();
      for (const mid of memberIds) {
        if (Number.isFinite(mid) && mid > 0) idSet.add(mid);
      }
      for (const row of ownedRows) {
        const id = Number(row.id);
        if (Number.isFinite(id) && id > 0) idSet.add(id);
      }
      if (email) {
        const mineData = await gateway.findAllParticipantsByEmail(email);
        const mine = asRows(mineData).filter(
          (r) => r.email !== "__config__" && canMutateParticipantRow(r as DeelnemerRow, jwt),
        );
        for (const r of mine) {
          const cid = Number(r.competition_id);
          if (Number.isFinite(cid) && cid > 0) idSet.add(cid);
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

    listPlayers: asyncHandler(async (_req: Request, res: Response) => {
      const data = await gateway.listWkSpelers();
      res.json(data);
    }),

    /**
     * Records `competition_members` for the signed-in user so they may create a team
     * (required for owner-created pools; idempotent for platform pools and after invites).
     */
    joinCompetition: asyncHandler(async (req: Request, res: Response) => {
      const competitionId = resolveJoinCompetitionId(req);
      const jwt = req.supabaseUser;
      const uid = jwt?.sub;
      if (!uid || typeof uid !== "string") throw new HttpError(401, "Authorization required");

      const comp = await gateway.getCompetitionById(String(competitionId));
      if (!comp) throw new HttpError(404, "Competition not found");
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

    createParticipant: asyncHandler(async (req: Request, res: Response) => {
      const body = asObjectBody(req.body);
      delete body.user_id;
      /** Frontend may send `competitionId` (camelCase); DB + duplicate check use `competition_id`. */
      if (body.competition_id == null && body.competitionId != null) {
        body.competition_id = body.competitionId;
      }
      const jwt = req.supabaseUser;
      const adminOk = isAdminBySecret(req, env);
      if (!adminOk) {
        if (!jwt?.sub) throw new HttpError(401, "Authorization Bearer token required");
        if (!canAttachUserOnCreate(body.email, jwt)) {
          throw new HttpError(403, "Authenticated email must match registration email");
        }
        body.user_id = jwt.sub;
        await assertMayRegisterInOwnedCompetition(gateway, body, jwt);
      }
      const rawCid = body.competition_id;
      let resolvedCompetitionId: number;
      if (rawCid !== undefined && rawCid !== null && String(rawCid).trim() !== "") {
        resolvedCompetitionId = Number(rawCid);
        if (!Number.isFinite(resolvedCompetitionId) || resolvedCompetitionId <= 0) {
          throw new HttpError(400, "Invalid competition_id");
        }
      } else {
        const def = await gateway.getCompetitionBySlug("wc2026");
        if (!def?.id) throw new HttpError(500, "Default competition (wc2026) not found");
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
      let competitionName =
        typeof body.competition_name === "string" && body.competition_name.trim()
          ? body.competition_name.trim()
          : "";
      if (!competitionName && compRow && typeof compRow === "object" && compRow !== null) {
        const n = (compRow as Record<string, unknown>).name;
        if (typeof n === "string" && n.trim()) competitionName = n.trim();
      }
      if (!competitionName) competitionName = "WK 2026 Poule";
      const insertPayload = { ...body };
      delete insertPayload.competition_name;
      delete insertPayload.competitionId;
      insertPayload.competition_id = resolvedCompetitionId;
      if (typeof insertPayload.email === "string") insertPayload.email = emailNorm;
      const data = await gateway.createParticipant(insertPayload);
      if (typeof body.email === "string" && body.email.trim()) {
        try {
          await mailer.sendSignupConfirmation(body.email.trim(), competitionName);
        } catch {
          /* non-blocking: registration succeeds even if email provider is down */
        }
      }
      res.json(data);
    }),

    patchParticipantPlayers: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      const body = patchPlayersSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "spelers field required");

      const payload = sanitizePatchBody(req, { spelers: body.data.spelers });
      const data = await gateway.patchParticipantPlayers(params.data.id, payload);
      const updatedRow = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
      const spelersSource = updatedRow?.spelers ?? body.data.spelers;
      const totalPoints = totalPointsFromSpelers(spelersSource);
      const attackerGoals = attackerGoalsFromSpelers(spelersSource);
      await gateway.patchParticipantAggregates(params.data.id, totalPoints, attackerGoals);
      res.json(data);
    }),

    patchParticipant: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      const base = asObjectBody(req.body);
      const merged = sanitizePatchBody(req, base);
      const data = await gateway.patchParticipant(params.data.id, merged);
      res.json(data);
    }),

    deleteParticipant: asyncHandler(async (req: Request, res: Response) => {
      const params = idParamSchema.safeParse(req.params);
      if (!params.success) throw new HttpError(400, "Invalid id");

      await gateway.deleteParticipant(params.data.id);
      res.status(204).send();
    }),
  };
}
