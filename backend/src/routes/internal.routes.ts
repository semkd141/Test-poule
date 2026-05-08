import { Router } from "express";
import type { Request } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { ApiFootballClient, type ApiFootballFixture } from "../services/api-football-client.js";
import { ScoringEngine } from "../services/scoring-engine.js";

type FixtureMapRow = {
  id: number;
  local_key: string;
  api_fixture_id: number | null;
};

function isInternalAuthorized(req: Request, env: Env): boolean {
  if (env.CRON_SECRET && req.get("x-cron-secret") === env.CRON_SECRET) return true;
  const role = String(req.supabaseUser?.role ?? "");
  return role === "service_role" || role === "admin";
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
