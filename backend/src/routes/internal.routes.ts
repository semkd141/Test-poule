import { Router } from "express";
import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { ApiFootballClient } from "../services/api-football-client.js";
import { syncAndScoreCompetitionFixtures } from "../services/fantasy-scoring-sync.service.js";
import { z } from "zod";
import { isPlatformOperator } from "../auth/platform-operator.js";
import {
  resolvedLeagueFields,
  defaultApiFootballSeasonForLeagueType,
  parseApiFootballSeasonYearFromSeasonLabel,
} from "../league-type-resolve.js";
import { defaultPoolStartsAtForCompetition } from "../participant/competition-deadline.js";
import {
  FIXTURE_SQUAD_BATCH_BACKGROUND_MESSAGE,
  startFixtureSquadBackgroundBatch,
  syncFixtureSquadMembers,
} from "../services/fixture-squad-sync.service.js";

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

function resolveStartsAtForWrite(input: {
  starts_at?: string | null | undefined;
  slug?: unknown;
  league_type?: unknown;
  season_label?: unknown;
  apiFootballSeason?: unknown;
}): string {
  if (input.starts_at != null && String(input.starts_at).trim()) {
    const d = new Date(String(input.starts_at));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const fallback = defaultPoolStartsAtForCompetition(input);
  if (fallback) return new Date(fallback).toISOString();
  throw new HttpError(400, "starts_at is required so team privacy and edit locking work correctly.");
}

export function createInternalRouter(gateway: SupabaseGateway, env: Env, log: AppLogger): Router {
  const router = Router();

  const competitionCreateSchema = z.object({
    slug: z.string().min(2),
    name: z.string().min(2),
    league_type: z.string().min(1, "league_type is required"),
    season_label: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().optional()),
    starts_at: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().datetime().optional()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  const competitionPatchSchema = z.object({
    slug: z.string().min(2).optional(),
    name: z.string().min(2).optional(),
    league_type: z.string().min(1).optional(),
    season_label: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
    starts_at: z.preprocess((v) => (v === "" ? null : v), z.string().datetime().nullable().optional()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });
  /** List shared mappings: either `leagueId` + `season` (API-Football scope) or `competitionId` (resolved to league+season). */
  const mappingQuerySchema = z
    .object({
      competitionId: z.coerce.number().int().positive().optional(),
      leagueId: z.coerce.number().int().positive().optional(),
      season: z.coerce.number().int().positive().optional(),
    })
    .refine(
      (d) =>
        (d.competitionId != null && d.leagueId == null && d.season == null) ||
        (d.competitionId == null && d.leagueId != null && d.season != null),
      { message: "Provide competitionId OR both leagueId and season" },
    );
  const mappingPatchSchema = z.object({
    api_fixture_id: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.coerce.number().int().positive().nullable(),
    ),
  });

  router.get(
    "/competitions",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const out = await gateway.listCompetitions();
      res.json(out);
    }),
  );

  router.post(
    "/competitions",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
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
        metadata: meta,
        starts_at: resolveStartsAtForWrite({
          starts_at: parsed.data.starts_at,
          slug: parsed.data.slug,
          league_type: leagueFields.league_type,
          season_label: parsed.data.season_label,
          apiFootballSeason: chosenSeason,
        }),
      };
      if (parsed.data.season_label !== undefined) body.season_label = parsed.data.season_label;
      const out = await gateway.createCompetition(body);
      res.json(out);
    }),
  );

  router.patch(
    "/competitions/:id",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const existing = await gateway.getCompetitionById(id);
      if (!existing) throw new HttpError(404, "Competition not found");
      const parsed = competitionPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const bodyRaw = parsed.data;
      if (!Object.keys(bodyRaw).length) throw new HttpError(400, "No fields to update");
      let body: Record<string, unknown> = { ...bodyRaw };
      if (bodyRaw.league_type !== undefined) {
        const lf = await resolvedLeagueFields(gateway, String(bodyRaw.league_type));
        body = { ...body, ...lf };
      }
      if (bodyRaw.starts_at === null) {
        throw new HttpError(400, "starts_at cannot be cleared because it controls team privacy and edit locking.");
      }
      const nextStartsAt = bodyRaw.starts_at ?? existing.starts_at;
      if (
        nextStartsAt == null ||
        String(nextStartsAt).trim() === "" ||
        bodyRaw.slug !== undefined ||
        bodyRaw.league_type !== undefined ||
        bodyRaw.season_label !== undefined
      ) {
        const nextLeagueType = body.league_type ?? existing.league_type;
        const nextSeasonLabel = body.season_label ?? existing.season_label;
        const labelSeason = parseApiFootballSeasonYearFromSeasonLabel(nextSeasonLabel);
        const chosenSeason =
          labelSeason ??
          (typeof nextLeagueType === "string" ? defaultApiFootballSeasonForLeagueType(nextLeagueType) : undefined);
        body.starts_at = resolveStartsAtForWrite({
          starts_at: nextStartsAt as string | null | undefined,
          slug: body.slug ?? existing.slug,
          league_type: nextLeagueType,
          season_label: nextSeasonLabel,
          apiFootballSeason: chosenSeason,
        });
      }
      const out = await gateway.patchCompetition(id, body);
      res.json(out);
    }),
  );

  router.delete(
    "/competitions/:id",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      await gateway.deleteCompetition(id);
      res.status(204).send();
    }),
  );

  router.get(
    "/fixture-mappings",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const q = mappingQuerySchema.safeParse(req.query);
      if (!q.success) {
        throw new HttpError(400, q.error.issues.map((i) => i.message).join("; "));
      }
      let out: unknown;
      if (q.data.leagueId != null && q.data.season != null) {
        out = await gateway.listFixtureMappingsByLeagueSeason(q.data.leagueId, q.data.season);
      } else {
        const cid = q.data.competitionId;
        if (cid == null) throw new HttpError(400, "competitionId or leagueId+season required");
        out = await gateway.listFixtureMappings(cid);
      }
      res.json(out);
    }),
  );

  router.patch(
    "/fixture-mappings/:id",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const parsed = mappingPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const out = await gateway.patchFixtureMapping(id, parsed.data);
      res.json(out);
    }),
  );

  const fetchFixtureSquadSingleSchema = z.object({
    fixtureId: z.coerce.number().int().positive(),
  });
  const fetchFixtureSquadBatchSchema = z.object({
    fixtureIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
    leagueId: z.coerce.number().int().positive(),
    season: z.coerce.number().int().positive(),
  });
  const fetchFixtureSquadBodySchema = z.union([fetchFixtureSquadBatchSchema, fetchFixtureSquadSingleSchema]);

  /**
   * Single: `{ fixtureId }` — sync one fixture (skips if rows exist or already fetched; per-side skip when
   * league+season+`team` already exists). Batch: `{ fixtureIds, leagueId, season }` — queues a background job
   * (3s between upstream API calls); immediate JSON `{ message: "Squad members are being fetched." }`.
   */
  router.post(
    "/fixture-squad/fetch",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const parsed = fetchFixtureSquadBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      }
      if ("fixtureIds" in parsed.data) {
        if (!env.API_FOOTBALL_KEY) throw new HttpError(500, "API_FOOTBALL_KEY is not configured");
        startFixtureSquadBackgroundBatch(
          {
            fixtureIds: parsed.data.fixtureIds,
            leagueId: parsed.data.leagueId,
            season: parsed.data.season,
          },
          gateway,
          env,
          log,
        );
        res.json({ message: FIXTURE_SQUAD_BATCH_BACKGROUND_MESSAGE });
        return;
      }
      const out = await syncFixtureSquadMembers(parsed.data.fixtureId, gateway, env);
      res.json(out);
    }),
  );

  router.post(
    "/sync-fixtures",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      if (!env.API_FOOTBALL_KEY) throw new HttpError(500, "API_FOOTBALL_KEY is not configured");

      const competitionSlug = String(req.body?.competitionSlug ?? "wc2026");
      const comp = await gateway.getCompetitionBySlug(competitionSlug);
      if (!comp?.id) throw new HttpError(404, `Competition not found: ${competitionSlug}`);

      const api = new ApiFootballClient(env.API_FOOTBALL_KEY, 6500);
      const syncRes = await syncAndScoreCompetitionFixtures(gateway, api, comp, log);
      res.json({
        ok: true,
        competitionSlug,
        ...syncRes,
      });
    }),
  );

  router.get(
    "/analytics",
    asyncHandler(async (req, res) => {
      if (!isPlatformOperator(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const snap = await gateway.getAdminAnalyticsSnapshot();
      res.json(snap);
    }),
  );

  return router;
}
