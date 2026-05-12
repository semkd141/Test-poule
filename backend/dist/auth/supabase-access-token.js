import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, } from "jose";
/**
 * Validates Supabase Auth access tokens:
 * - Legacy HS256: Dashboard JWT secret (same as PostgREST JWT verification).
 * - Modern ES256 / RS256: asymmetric signing — verify via Auth JWKS at `/auth/v1/.well-known/jwks.json`.
 *
 * @see https://supabase.com/docs/guides/auth/jwt-fields
 */
export async function verifySupabaseAccessToken(token, opts) {
    let alg;
    try {
        alg = decodeProtectedHeader(token).alg;
    }
    catch {
        throw new Error("Invalid JWT");
    }
    if (!alg)
        throw new Error("JWT missing alg");
    if (alg === "HS256") {
        const signingKey = new TextEncoder().encode(opts.jwtSecret);
        const { payload } = await jwtVerify(token, signingKey, {
            algorithms: ["HS256"],
            issuer: opts.issuer,
        });
        return payload;
    }
    if (alg === "ES256" || alg === "RS256") {
        const JWKS = remoteJwksForSupabase(opts.projectUrl);
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: opts.issuer,
            algorithms: [alg],
        });
        return payload;
    }
    throw new Error(`Unsupported JWT algorithm: ${String(alg)}`);
}
const jwksCache = new Map();
function remoteJwksForSupabase(projectUrl) {
    const base = projectUrl.replace(/\/$/, "");
    let j = jwksCache.get(base);
    if (!j) {
        const url = `${base}/auth/v1/.well-known/jwks.json`;
        j = createRemoteJWKSet(new URL(url));
        jwksCache.set(base, j);
    }
    return j;
}
export function supabaseJwtIssuer(projectUrlNoTrailingSlash) {
    return `${projectUrlNoTrailingSlash.replace(/\/$/, "")}/auth/v1`;
}
//# sourceMappingURL=supabase-access-token.js.map