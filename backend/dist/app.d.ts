import express from "express";
import type { Env } from "./config/env.js";
import type { AppLogger } from "./lib/logger.js";
import type { SupabaseGateway } from "./services/supabase-gateway.js";
export interface CreateAppDeps {
    env: Env;
    logger: AppLogger;
    gateway: SupabaseGateway;
}
export declare function createApp(deps: CreateAppDeps): express.Express;
//# sourceMappingURL=app.d.ts.map