import { Router } from "express";
import type { Request } from "express";
import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { canManageCompetition } from "../auth/can-manage-competition.js";
import { normEmail } from "../participant/participant-access.js";
import { TransactionalEmailService } from "../services/transactional-email.js";
import {
  fetchAllFixturesFromApiFootball,
  mapApiResponseToFixtureRows,
} from "../services/api-football-fixture-mapper.js";
import {
  FIXTURE_SQUAD_BATCH_BACKGROUND_MESSAGE,
  startFixtureSquadBackgroundBatch,
  syncFixtureSquadMembers,
} from "../services/fixture-squad-sync.service.js";
import { z } from "zod";
import {
  resolvedLeagueFields,
  defaultApiFootballSeasonForLeagueType,
  parseApiFootballSeasonYearFromSeasonLabel,
} from "../league-type-resolve.js";

function ownerSub(req: Request): string {
  const s = req.supabaseUser?.sub;
  if (!s || typeof s !== "string") throw new HttpError(401, "Not authenticated");
  return s.trim();
}

const competitionCreateSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: lowercase letters, digits, hyphens only"),
  name: z.string().min(2),
  league_type: z.string().min(1, "league_type is required"),
  season_label: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().optional()),
  starts_at: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().datetime().optional()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const competitionPatchSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: lowercase letters, digits, hyphens only")
    .optional(),
  name: z.string().min(2).optional(),
  league_type: z.string().min(1).optional(),
  season_label: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  starts_at: z.preprocess((v) => (v === "" ? null : v), z.string().datetime().nullable().optional()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Full replace of editable fields (PUT): all keys required; use null to clear optionals. */
const competitionPutSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: lowercase letters, digits, hyphens only"),
  name: z.string().min(2),
  league_type: z.string().min(1, "league_type is required"),
  season_label: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.union([z.string(), z.null()]),
  ),
  starts_at: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.union([z.string().datetime(), z.null()]),
  ),
  metadata: z.record(z.string(), z.unknown()),
});

const mappingPatchSchema = z.object({
  api_fixture_id: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().int().positive().nullable(),
  ),
});

const invitePostSchema = z.object({
  email: z.string().email(),
});

const importApiFootballSchema = z.object({
  league: z.coerce.number().int().positive().optional(),
  season: z.coerce.number().int().positive().optional(),
});

const fetchFixtureSquadBodySchema = z.object({
  fixtureId: z.coerce.number().int().positive(),
});

function resolveApiFootballLeagueSeason(
  body: { league?: number | undefined; season?: number | undefined },
  meta: unknown,
  competitionRow: Record<string, unknown>,
): { league: number; season: number } {
  const bl = body.league;
  const bs = body.season;
  if (bl !== undefined && bs !== undefined) {
    const league = Number(bl);
    const season = Number(bs);
    if (!Number.isFinite(league) || league <= 0 || !Number.isFinite(season) || season <= 0) {
      throw new HttpError(400, "league and season must be positive integers");
    }
    return { league: Math.floor(league), season: Math.floor(season) };
  }

  let metaLeague: number | undefined;
  let metaSeason: number | undefined;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const af = (meta as Record<string, unknown>).api_football;
    if (af && typeof af === "object" && !Array.isArray(af)) {
      const o = af as Record<string, unknown>;
      const l = Number(o.league);
      const s = Number(o.season);
      if (Number.isFinite(l) && l > 0) metaLeague = Math.floor(l);
      if (Number.isFinite(s) && s > 0) metaSeason = Math.floor(s);
    }
  }

  const labelSeason = parseApiFootballSeasonYearFromSeasonLabel(competitionRow.season_label);
  const bodySeason =
    bs !== undefined
      ? (() => {
          const n = Number(bs);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
        })()
      : undefined;
  const resolvedSeason = bodySeason ?? labelSeason ?? metaSeason;

  if (metaLeague !== undefined && resolvedSeason !== undefined) {
    return { league: metaLeague, season: resolvedSeason };
  }

  const compLeague = Number(competitionRow.api_football_league_id);
  const league =
    metaLeague ??
    (Number.isFinite(compLeague) && compLeague > 0 ? Math.floor(compLeague) : undefined);

  const season = resolvedSeason;

  if (league !== undefined && season !== undefined) {
    return { league, season };
  }

  throw new HttpError(
    400,
    "Set api_football.season in pool metadata, pass season in the import body, or pass both league and season. The pool’s league type sets the default API-Football league id.",
  );
}

function ensureMetadataApiFootballLeagueSeason(
  existing: unknown,
  league: number,
  season: number,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const prevAf = base.api_football;
  const af =
    prevAf && typeof prevAf === "object" && !Array.isArray(prevAf)
      ? { ...(prevAf as Record<string, unknown>) }
      : {};
  af.league = league;
  af.season = season;
  base.api_football = af;
  return base;
}

async function requesterEmail(req: Request, gateway: SupabaseGateway): Promise<string | null> {
  const j = req.supabaseUser?.email;
  if (typeof j === "string" && j.trim()) return normEmail(j);
  const tok = String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!tok) return null;
  const u = await gateway.getUser(tok);
  if (!u || typeof u !== "object") return null;
  const d = u as Record<string, unknown>;
  const nested = d.user;
  if (nested && typeof nested === "object") {
    const e = (nested as Record<string, unknown>).email;
    if (typeof e === "string" && e.trim()) return normEmail(e);
  }
  const top = d.email;
  if (typeof top === "string" && top.trim()) return normEmail(top);
  return null;
}

export function createCompetitionOwnerRouter(gateway: SupabaseGateway, env: Env, log: AppLogger): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const sub = ownerSub(req);
      const out = await gateway.listCompetitionsByOwner(sub);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const sub = ownerSub(req);
      const parsed = competitionCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const leagueFields = await resolvedLeagueFields(gateway, parsed.data.league_type);
      const defaultSeason = defaultApiFootballSeasonForLeagueType(leagueFields.league_type);
      const labelSeason = parseApiFootballSeasonYearFromSeasonLabel(parsed.data.season_label);
      const chosenSeason = labelSeason ?? defaultSeason;
      const meta = ensureMetadataApiFootballLeagueSeason(
        parsed.data.metadata,
        leagueFields.api_football_league_id,
        chosenSeason,
      );
      const body: Record<string, unknown> = {
        slug: parsed.data.slug.trim().toLowerCase(),
        name: parsed.data.name,
        league_type: leagueFields.league_type,
        api_football_league_id: leagueFields.api_football_league_id,
        owner_user_id: sub,
        metadata: meta,
      };
      if (parsed.data.season_label !== undefined) body.season_label = parsed.data.season_label;
      if (parsed.data.starts_at !== undefined) body.starts_at = parsed.data.starts_at;
      const out = await gateway.createCompetition(body);
      res.status(201).json(out);
    }),
  );

  router.get(
    "/:competitionId/fixture-mappings",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      if (!id) throw new HttpError(400, "competition id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      const out = await gateway.listFixtureMappings(competitionId);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.post(
    "/:competitionId/import-api-football-fixtures",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      if (!id) throw new HttpError(400, "competition id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");

      const parsed = importApiFootballSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      }

      const { league, season } = resolveApiFootballLeagueSeason(parsed.data, row.metadata, row);

      const already = await gateway.fixtureMappingsExistForLeagueSeason(league, season);
      if (already) {
        await gateway.patchCompetition(String(competitionId), {
          metadata: ensureMetadataApiFootballLeagueSeason(row.metadata, league, season),
        });
        res.json({
          ok: true,
          source: "existing_league_season",
          totalFromApi: 0,
          written: 0,
          league,
          season,
          message:
            "Fixture mappings already exist for this API-Football league and season (shared across pools). Metadata updated; no API call.",
        });
        return;
      }

      if (!env.API_FOOTBALL_KEY || env.API_FOOTBALL_KEY.length < 8) {
        throw new HttpError(
          503,
          "No other pool has this league/season with fixtures yet, and API_FOOTBALL_KEY is not configured. Add a pool with imported fixtures or set API_FOOTBALL_KEY.",
        );
      }

      let items;
      try {
        items = await fetchAllFixturesFromApiFootball({
          apiKey: env.API_FOOTBALL_KEY,
          league,
          season,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new HttpError(502, `API-Football request failed: ${msg}`);
      }

      const mappings = mapApiResponseToFixtureRows(items, league, season);
      if (mappings.length === 0) {
        res.json({
          ok: true,
          source: "api_football",
          totalFromApi: items.length,
          written: 0,
          league,
          season,
          message:
            items.length === 0
              ? "API returned no fixtures for this league/season."
              : "No fixtures with valid API ids to import.",
        });
        return;
      }

      await gateway.upsertFixtureMappingsBatch(mappings);
      await gateway.patchCompetition(String(competitionId), {
        metadata: ensureMetadataApiFootballLeagueSeason(row.metadata, league, season),
      });
      res.json({
        ok: true,
        source: "api_football",
        totalFromApi: items.length,
        written: mappings.length,
        league,
        season,
      });
    }),
  );

  /** Store API-Football squad (players + coaches) for one fixture; pool owner only; fixture must belong to this pool’s mappings. */
  router.post(
    "/:competitionId/fetch-fixture-squad",
    asyncHandler(async (req, res) => {
      const cid = String(req.params.competitionId ?? "").trim();
      if (!cid) throw new HttpError(400, "competition id required");
      const comp = await gateway.getCompetitionById(cid);
      if (!comp) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, comp)) throw new HttpError(403, "Forbidden");

      const parsed = fetchFixtureSquadBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      }
      const fixtureId = parsed.data.fixtureId;

      const competitionId = Number(comp.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");

      const mapsRaw = await gateway.listFixtureMappings(competitionId);
      const maps = Array.isArray(mapsRaw) ? mapsRaw : [];
      const match = maps.find((m) => {
        if (!m || typeof m !== "object" || Array.isArray(m)) return false;
        return Number((m as Record<string, unknown>).api_fixture_id) === fixtureId;
      });
      if (!match || typeof match !== "object" || Array.isArray(match)) {
        throw new HttpError(
          400,
          "This fixture id is not linked in this pool’s fixture mappings (set the API fixture id on the row first).",
        );
      }
      const mapRec = match as Record<string, unknown>;
      const mapLeague = Number(mapRec.api_football_league_id);
      const mapSeason = Number(mapRec.season);
      const leagueSeasonFromMapping =
        Number.isFinite(mapLeague) && mapLeague > 0 && Number.isFinite(mapSeason) && mapSeason > 0
          ? { api_football_league_id: Math.floor(mapLeague), season: Math.floor(mapSeason) }
          : undefined;

      const out = await syncFixtureSquadMembers(fixtureId, gateway, env, leagueSeasonFromMapping);
      res.json(out);
    }),
  );

  /** Queue background squad import for all mapped API fixture ids (3s between API calls; same skip rules as batch internal). */
  router.post(
    "/:competitionId/fetch-all-fixture-squads",
    asyncHandler(async (req, res) => {
      const cid = String(req.params.competitionId ?? "").trim();
      if (!cid) throw new HttpError(400, "competition id required");
      const comp = await gateway.getCompetitionById(cid);
      if (!comp) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, comp)) throw new HttpError(403, "Forbidden");

      const competitionId = Number(comp.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");

      const scope = gateway.getFixtureMappingScopeForCompetition(comp as Record<string, unknown>);
      if (!scope) {
        throw new HttpError(400, "Pool has no API-Football league/season for fixture mappings (import fixtures first).");
      }

      const mapsRaw = await gateway.listFixtureMappings(competitionId);
      const maps = Array.isArray(mapsRaw) ? mapsRaw : [];
      const seen = new Set<number>();
      const fixtureIds: number[] = [];
      for (const m of maps) {
        if (!m || typeof m !== "object" || Array.isArray(m)) continue;
        const fid = Math.floor(Number((m as Record<string, unknown>).api_fixture_id));
        if (!Number.isFinite(fid) || fid <= 0 || seen.has(fid)) continue;
        seen.add(fid);
        fixtureIds.push(fid);
      }
      if (fixtureIds.length === 0) {
        throw new HttpError(400, "No fixture mappings with a valid API fixture id yet.");
      }
      if (!env.API_FOOTBALL_KEY) throw new HttpError(500, "API_FOOTBALL_KEY is not configured");

      startFixtureSquadBackgroundBatch(
        { fixtureIds, leagueId: scope.leagueId, season: scope.season },
        gateway,
        env,
        log,
      );
      res.json({ message: FIXTURE_SQUAD_BATCH_BACKGROUND_MESSAGE, queued: fixtureIds.length });
    }),
  );

  router.patch(
    "/:competitionId/fixture-mappings/:mappingId",
    asyncHandler(async (req, res) => {
      const cid = String(req.params.competitionId ?? "").trim();
      const mid = String(req.params.mappingId ?? "").trim();
      if (!cid || !mid) throw new HttpError(400, "competition id and mapping id required");
      const comp = await gateway.getCompetitionById(cid);
      if (!comp) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, comp)) throw new HttpError(403, "Forbidden");
      const mapRow = await gateway.getFixtureMappingById(mid);
      if (!mapRow) throw new HttpError(404, "Fixture mapping not found");
      const scope = gateway.getFixtureMappingScopeForCompetition(comp as Record<string, unknown>);
      if (!scope) throw new HttpError(400, "Pool has no API-Football league/season for fixture mappings");
      if (
        Number(mapRow.api_football_league_id) !== scope.leagueId ||
        Number(mapRow.season) !== scope.season
      ) {
        throw new HttpError(400, "Mapping does not match this pool's league and season");
      }
      const parsed = mappingPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const out = await gateway.patchFixtureMapping(mid, parsed.data);
      res.json(out);
    }),
  );

  router.get(
    "/:competitionId/participants",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      if (!id) throw new HttpError(400, "competition id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      const out = await gateway.listParticipantsByCompetition(competitionId);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.get(
    "/:competitionId/invites",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      if (!id) throw new HttpError(400, "competition id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      if (row.owner_user_id == null) {
        res.json([]);
        return;
      }
      const out = await gateway.listCompetitionInvites(competitionId);
      res.json(Array.isArray(out) ? out : []);
    }),
  );

  router.post(
    "/:competitionId/invites",
    asyncHandler(async (req, res) => {
      const id = String(req.params.competitionId ?? "").trim();
      const parsed = invitePostSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      if (row.owner_user_id == null) {
        throw new HttpError(400, "Email invites are only available for pools created in the Competition tab");
      }
      const competitionId = Number(row.id);
      if (!Number.isFinite(competitionId)) throw new HttpError(500, "Invalid competition id");
      const inviteEmail = normEmail(parsed.data.email);
      const ownerEmail = await requesterEmail(req, gateway);
      if (!ownerEmail) throw new HttpError(400, "Your account email is required to send invitations");
      if (inviteEmail === ownerEmail) throw new HttpError(400, "You cannot invite yourself");

      await gateway.deletePendingInvitesForEmail(competitionId, inviteEmail);
      const { plainToken, tokenHash } = gateway.createInviteSecret();
      const expires = new Date();
      expires.setDate(expires.getDate() + 14);
      const sub = ownerSub(req);
      const inserted = await gateway.insertCompetitionInvite({
        competition_id: competitionId,
        email: inviteEmail,
        token_hash: tokenHash,
        invited_by: sub,
        expires_at: expires.toISOString(),
      });
      const insRow = Array.isArray(inserted) ? inserted[0] : inserted;
      const base = (env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const inviteUrl = `${base}/?invite=${encodeURIComponent(plainToken)}`;
      const mailer = new TransactionalEmailService(env);
      const compName = String(row.name ?? "Competition");
      const send = await mailer.sendCompetitionInvite(inviteEmail, compName, inviteUrl);
      res.status(201).json({
        ok: true,
        id: insRow && typeof insRow === "object" && insRow !== null && "id" in insRow ? (insRow as { id: unknown }).id : undefined,
        email: inviteEmail,
        expires_at: expires.toISOString(),
        emailed: send.sent,
        emailReason: send.reason,
        inviteUrl,
      });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const row = await gateway.getCompetitionById(id);
      if (!row) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, row)) throw new HttpError(403, "Forbidden");
      res.json(row);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const existing = await gateway.getCompetitionById(id);
      if (!existing) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, existing)) throw new HttpError(403, "Forbidden");
      const parsed = competitionPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const bodyRaw = parsed.data;
      if (!Object.keys(bodyRaw).length) throw new HttpError(400, "No fields to update");
      let body: Record<string, unknown> =
        bodyRaw.slug !== undefined ? { ...bodyRaw, slug: bodyRaw.slug.trim().toLowerCase() } : { ...bodyRaw };
      if (bodyRaw.league_type !== undefined) {
        const lf = await resolvedLeagueFields(gateway, String(bodyRaw.league_type));
        body = { ...body, ...lf };
      }
      const out = await gateway.patchCompetition(id, body);
      res.json(out);
    }),
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const existing = await gateway.getCompetitionById(id);
      if (!existing) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, existing)) throw new HttpError(403, "Forbidden");
      const parsed = competitionPutSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const leagueFields = await resolvedLeagueFields(gateway, parsed.data.league_type);
      const body = {
        ...parsed.data,
        ...leagueFields,
        slug: parsed.data.slug.trim().toLowerCase(),
      };
      const out = await gateway.patchCompetition(id, body);
      res.json(out);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const existing = await gateway.getCompetitionById(id);
      if (!existing) throw new HttpError(404, "Competition not found");
      if (!canManageCompetition(req, env, existing)) throw new HttpError(403, "Forbidden");
      await gateway.deleteCompetition(id);
      res.status(204).send();
    }),
  );

  return router;
}
