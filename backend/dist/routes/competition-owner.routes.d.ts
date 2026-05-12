import { Router } from "express";
import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
export declare function createCompetitionOwnerRouter(gateway: SupabaseGateway, env: Env, log: AppLogger): Router;
//# sourceMappingURL=competition-owner.routes.d.ts.map