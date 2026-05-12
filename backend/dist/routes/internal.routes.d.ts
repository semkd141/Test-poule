import { Router } from "express";
import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
export declare function createInternalRouter(gateway: SupabaseGateway, env: Env, log: AppLogger): Router;
//# sourceMappingURL=internal.routes.d.ts.map