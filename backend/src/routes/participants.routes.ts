import { Router } from "express";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { createParticipantsHandlers } from "../controllers/participants.controller.js";

export function createParticipantsRouter(gateway: SupabaseGateway): Router {
  const router = Router();
  const handlers = createParticipantsHandlers(gateway);

  router.get("/participants", handlers.listParticipants);
  router.get("/participants/by-email", handlers.findParticipantByEmail);
  router.get("/players", handlers.listPlayers);
  router.post("/participants", handlers.createParticipant);
  router.patch("/participants/:id/players", handlers.patchParticipantPlayers);
  router.patch("/participants/:id", handlers.patchParticipant);
  router.delete("/participants/:id", handlers.deleteParticipant);

  return router;
}
