import { Router } from "express";
import type { Request } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { ApiFootballClient, type ApiFootballFixture } from "../services/api-football-client.js";
import { ScoringEngine } from "../services/scoring-engine.js";
import { z } from "zod";

type FixtureMapRow = {
  id: number;
  local_key: string;
  api_fixture_id: number | null;
};

function isInternalAuthorized(req: Request, env: Env): boolean {
  if (env.CRON_SECRET && req.get("x-cron-secret") === env.CRON_SECRET) return true;
  if (env.ADMIN_UID && String(req.supabaseUser?.sub ?? "") === env.ADMIN_UID) return true;
  const role = String(req.supabaseUser?.role ?? "");
  const appRole = String(
    (req.supabaseUser as Record<string, unknown> | undefined)?.app_metadata &&
      typeof (req.supabaseUser as Record<string, unknown>).app_metadata === "object"
      ? ((req.supabaseUser as Record<string, unknown>).app_metadata as Record<string, unknown>).role ?? ""
      : "",
  );
  return role === "service_role" || role === "admin" || appRole === "admin";
}

function toMatchPayload(competitionId: number, src: ApiFootballFixture): Record<string, unknown> {
  return {
    competition_id: competitionId,
    external_fixture_id: src.fixture.id,
    status: src.fixture.status?.short ?? "NS",
    round: src.league?.round ?? null,
    kickoff_at: src.fixture.date,
    home_team: src.teams.home.name,
    away_team: src.teams.away.name,
    home_goals: src.goals.home,
    away_goals: src.goals.away,
    payload: src,
    synced_at: new Date().toISOString(),
  };
}

export function createInternalRouter(gateway: SupabaseGateway, env: Env): Router {
  const router = Router();

  const competitionCreateSchema = z.object({
    slug: z.string().min(2),
    name: z.string().min(2),
    season_label: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().optional()),
    starts_at: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().datetime().optional()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  const competitionPatchSchema = z.object({
    slug: z.string().min(2).optional(),
    name: z.string().min(2).optional(),
    season_label: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
    starts_at: z.preprocess((v) => (v === "" ? null : v), z.string().datetime().nullable().optional()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });
  const mappingQuerySchema = z.object({
    competitionId: z.coerce.number().int().positive(),
  });
  const mappingPatchSchema = z.object({
    api_fixture_id: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.coerce.number().int().positive().nullable(),
    ),
  });

  router.get(
    "/competitions",
    asyncHandler(async (req, res) => {
      if (!isInternalAuthorized(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const out = await gateway.listCompetitions();
      res.json(out);
    }),
  );

  router.post(
    "/competitions",
    asyncHandler(async (req, res) => {
      if (!isInternalAuthorized(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const parsed = competitionCreateSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const out = await gateway.createCompetition(parsed.data);
      res.json(out);
    }),
  );

  router.patch(
    "/competitions/:id",
    asyncHandler(async (req, res) => {
      if (!isInternalAuthorized(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const parsed = competitionPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const body = parsed.data;
      if (!Object.keys(body).length) throw new HttpError(400, "No fields to update");
      const out = await gateway.patchCompetition(id, body);
      res.json(out);
    }),
  );

  router.delete(
    "/competitions/:id",
    asyncHandler(async (req, res) => {
      if (!isInternalAuthorized(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      await gateway.deleteCompetition(id);
      res.status(204).send();
    }),
  );

  router.get(
    "/fixture-mappings",
    asyncHandler(async (req, res) => {
      if (!isInternalAuthorized(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const q = mappingQuerySchema.safeParse(req.query);
      if (!q.success) throw new HttpError(400, "competitionId query required");
      const out = await gateway.listFixtureMappings(q.data.competitionId);
      res.json(out);
    }),
  );

  router.patch(
    "/fixture-mappings/:id",
    asyncHandler(async (req, res) => {
      if (!isInternalAuthorized(req, env)) throw new HttpError(401, "Invalid internal authorization");
      const id = String(req.params.id ?? "").trim();
      if (!id) throw new HttpError(400, "id required");
      const parsed = mappingPatchSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const out = await gateway.patchFixtureMapping(id, parsed.data);
      res.json(out);
    }),
  );

  router.post(
    "/sync-fixtures",
    asyncHandler(async (req, res) => {
      if (!isInternalAuthorized(req, env)) throw new HttpError(401, "Invalid internal authorization");
      if (!env.API_FOOTBALL_KEY) throw new HttpError(500, "API_FOOTBALL_KEY is not configured");

      const competitionSlug = String(req.body?.competitionSlug ?? "wc2026");
      const comp = await gateway.getCompetitionBySlug(competitionSlug);
      if (!comp?.id) throw new HttpError(404, `Competition not found: ${competitionSlug}`);

      const competitionId = Number(comp.id);
      const mappings = (await gateway.listFixtureMappings(competitionId)) as FixtureMapRow[];
      const api = new ApiFootballClient(env.API_FOOTBALL_KEY);
      let synced = 0;

      for (const m of mappings) {
        if (!m.api_fixture_id) continue;
        const fx = await api.getFixtureById(Number(m.api_fixture_id));
        if (!fx) continue;
        const status = String(fx.fixture.status?.short ?? "");
        if (!["FT", "AET", "PEN"].includes(status)) continue;
        await gateway.upsertMatch(toMatchPayload(competitionId, fx));
        synced += 1;
      }

      const scoring = new ScoringEngine(gateway);
      const scoreRes = await scoring.scoreCompetition(competitionId);
      res.json({
        ok: true,
        competitionSlug,
        syncedFixtures: synced,
        scoredMatchesSeen: scoreRes.matches,
        participantsTouched: scoreRes.participantsTouched,
      });
    }),
  );

  return router;
}
