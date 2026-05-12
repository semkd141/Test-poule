import { Router } from "express";
import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { createParticipantsHandlers } from "../controllers/participants.controller.js";
import { optionalBearerSupabaseJwt, requireBearerSupabaseJwt } from "../middleware/supabase-auth.js";
import { participantMutationGate } from "../middleware/participant-mutation-access.js";

export function createParticipantsRouter(
  gateway: SupabaseGateway,
  env: Env,
  log: AppLogger,
): Router {
  const router = Router();
  const handlers = createParticipantsHandlers(gateway, env, log);
  if (typeof handlers.joinCompetition !== "function") {
    throw new Error(
      "createParticipantsHandlers must export joinCompetition — the API cannot register POST /participants/join.",
    );
  }
  const optionalJwt = optionalBearerSupabaseJwt(env);
  const requireJwt = requireBearerSupabaseJwt(env);
  const gate = participantMutationGate(gateway, env);

  router.get("/competitions", handlers.listPublicCompetitions);
  router.get("/league-types", handlers.listApiFootballLeagueTypes);
  router.get("/competitions/:competitionId/fixture-mappings", handlers.listPublicFixtureMappings);
  router.get("/competitions/:competitionId/squad-roster", handlers.listPublicCompetitionSquadRoster);
  router.post("/competitions/:competitionId/fixture-statistics", handlers.postCompetitionFixtureStatistics);
  /** Body: `{ "competition_id": number }` — primary path (pair with tab on `/competitions/:id/join`). */
  router.post("/participants/join", requireJwt, handlers.joinCompetition);
  router.post("/competitions/:competitionId/join", requireJwt, handlers.joinCompetition);
  router.get("/participants", optionalJwt, handlers.listParticipants);
  router.get("/leaderboard", optionalJwt, handlers.listLeaderboard);
  router.get("/participants/mine", requireJwt, handlers.listMyParticipants);
  /** Pools you may pick on Register: joined membership only, excluding competitions you own. */
  router.get(
    "/participants/registerable-competitions",
    requireJwt,
    handlers.listMyRegisterableCompetitions,
  );
  /** My Team tab: member pools, pools you own, or pools where you have a team (not all public competitions). */
  router.get("/participants/my-team-competitions", requireJwt, handlers.listMyTeamCompetitions);
  router.get("/participants/by-email", optionalJwt, handlers.findParticipantByEmail);
  router.get("/players", handlers.listPlayers);
  router.get("/participants/:id/player-rollups", requireJwt, gate, handlers.listParticipantPlayerRollups);
  router.post("/participants", optionalJwt, handlers.createParticipant);
  router.patch("/participants/:id/players", optionalJwt, gate, handlers.patchParticipantPlayers);
  router.patch("/participants/:id", optionalJwt, gate, handlers.patchParticipant);
  router.delete("/participants/:id", optionalJwt, gate, handlers.deleteParticipant);

  return router;
}
