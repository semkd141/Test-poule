import type { Request } from "express";
import type { Env } from "../config/env.js";
export declare function resolveSupabaseAuthContext(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_JWT_SECRET">): {
    verifyOptional(req: Request): Promise<void>;
    verifyRequired(req: Request): Promise<void>;
};
export declare function optionalBearerSupabaseJwt(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_JWT_SECRET">): import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare function requireBearerSupabaseJwt(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_JWT_SECRET">): import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
//# sourceMappingURL=supabase-auth.d.ts.map