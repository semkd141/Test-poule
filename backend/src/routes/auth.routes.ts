import { Router } from "express";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { createAuthHandlers } from "../controllers/auth.controller.js";

export function createAuthRouter(gateway: SupabaseGateway): Router {
  const router = Router();
  const handlers = createAuthHandlers(gateway);

  router.post("/otp", handlers.sendOtp);
  router.post("/verify", handlers.verifyOtp);
  router.post("/refresh", handlers.refreshSession);
  router.post("/logout", handlers.logout);
  router.get("/user", handlers.getUser);

  return router;
}
