import { Router } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { createParticipantsHandlers } from "../controllers/participants.controller.js";
import { optionalBearerSupabaseJwt } from "../middleware/supabase-auth.js";
import { participantMutationGate } from "../middleware/participant-mutation-access.js";

export function createParticipantsRouter(gateway: SupabaseGateway, env: Env): Router {
  const router = Router();
  const handlers = createParticipantsHandlers(gateway, env);
  const optionalJwt = optionalBearerSupabaseJwt(env);
  const gate = participantMutationGate(gateway, env);

  router.get("/participants", optionalJwt, handlers.listParticipants);
  router.get("/leaderboard", optionalJwt, handlers.listLeaderboard);
  router.get("/participants/by-email", optionalJwt, handlers.findParticipantByEmail);
  router.get("/players", handlers.listPlayers);
  router.post("/participants", optionalJwt, handlers.createParticipant);
  router.patch("/participants/:id/players", optionalJwt, gate, handlers.patchParticipantPlayers);
  router.patch("/participants/:id", optionalJwt, gate, handlers.patchParticipant);
  router.delete("/participants/:id", optionalJwt, gate, handlers.deleteParticipant);

  return router;
}
