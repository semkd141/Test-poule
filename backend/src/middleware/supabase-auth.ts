import type { NextFunction, Request, Response } from "express";
import type { Env } from "../config/env.js";
import { HttpError } from "../shared/http-error.js";
import { verifySupabaseAccessToken, supabaseJwtIssuer } from "../auth/supabase-access-token.js";
import { asyncHandler } from "../middleware/async-handler.js";

function bearerToken(req: Request): string {
  return String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

export function resolveSupabaseAuthContext(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_JWT_SECRET">) {
  const issuer = supabaseJwtIssuer(env.SUPABASE_URL);

  return {
    async verifyOptional(req: Request): Promise<void> {
      const raw = bearerToken(req);
      if (!raw) return;
      try {
        const payload = await verifySupabaseAccessToken(raw, {
          jwtSecret: env.SUPABASE_JWT_SECRET,
          issuer,
          projectUrl: env.SUPABASE_URL,
        });
        req.supabaseUser = payload;
      } catch {
        /* invalid Bearer — ignored for optional auth */
      }
    },

    async verifyRequired(req: Request): Promise<void> {
      const raw = bearerToken(req);
      if (!raw) throw new HttpError(401, "Authorization Bearer token required");
      try {
        req.supabaseUser = await verifySupabaseAccessToken(raw, {
          jwtSecret: env.SUPABASE_JWT_SECRET,
          issuer,
          projectUrl: env.SUPABASE_URL,
        });
      } catch {
        throw new HttpError(401, "Invalid or expired access token");
      }
    },
  };
}

export function optionalBearerSupabaseJwt(
  env: Pick<Env, "SUPABASE_URL" | "SUPABASE_JWT_SECRET">,
) {
  const ctx = resolveSupabaseAuthContext(env);
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    await ctx.verifyOptional(req);
    next();
  });
}

export function requireBearerSupabaseJwt(
  env: Pick<Env, "SUPABASE_URL" | "SUPABASE_JWT_SECRET">,
) {
  const ctx = resolveSupabaseAuthContext(env);
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    await ctx.verifyRequired(req);
    next();
  });
}
