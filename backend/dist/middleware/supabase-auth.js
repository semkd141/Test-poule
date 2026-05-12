import { HttpError } from "../shared/http-error.js";
import { verifySupabaseAccessToken, supabaseJwtIssuer } from "../auth/supabase-access-token.js";
import { asyncHandler } from "../middleware/async-handler.js";
function bearerToken(req) {
    return String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}
export function resolveSupabaseAuthContext(env) {
    const issuer = supabaseJwtIssuer(env.SUPABASE_URL);
    return {
        async verifyOptional(req) {
            const raw = bearerToken(req);
            if (!raw)
                return;
            try {
                const payload = await verifySupabaseAccessToken(raw, {
                    jwtSecret: env.SUPABASE_JWT_SECRET,
                    issuer,
                    projectUrl: env.SUPABASE_URL,
                });
                req.supabaseUser = payload;
            }
            catch {
                /* invalid Bearer — ignored for optional auth */
            }
        },
        async verifyRequired(req) {
            const raw = bearerToken(req);
            if (!raw)
                throw new HttpError(401, "Authorization Bearer token required");
            try {
                req.supabaseUser = await verifySupabaseAccessToken(raw, {
                    jwtSecret: env.SUPABASE_JWT_SECRET,
                    issuer,
                    projectUrl: env.SUPABASE_URL,
                });
            }
            catch {
                throw new HttpError(401, "Invalid or expired access token");
            }
        },
    };
}
export function optionalBearerSupabaseJwt(env) {
    const ctx = resolveSupabaseAuthContext(env);
    return asyncHandler(async (req, _res, next) => {
        await ctx.verifyOptional(req);
        next();
    });
}
export function requireBearerSupabaseJwt(env) {
    const ctx = resolveSupabaseAuthContext(env);
    return asyncHandler(async (req, _res, next) => {
        await ctx.verifyRequired(req);
        next();
    });
}
//# sourceMappingURL=supabase-auth.js.map