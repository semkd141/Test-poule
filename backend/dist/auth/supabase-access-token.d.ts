import { type JWTPayload } from "jose";
/**
 * Validates Supabase Auth access tokens:
 * - Legacy HS256: Dashboard JWT secret (same as PostgREST JWT verification).
 * - Modern ES256 / RS256: asymmetric signing — verify via Auth JWKS at `/auth/v1/.well-known/jwks.json`.
 *
 * @see https://supabase.com/docs/guides/auth/jwt-fields
 */
export declare function verifySupabaseAccessToken(token: string, opts: {
    jwtSecret: string;
    issuer: string;
    /** Same as `SUPABASE_URL` — used to fetch JWKS for asymmetric tokens */
    projectUrl: string;
}): Promise<JWTPayload & {
    sub?: string;
    email?: string;
}>;
export declare function supabaseJwtIssuer(projectUrlNoTrailingSlash: string): string;
//# sourceMappingURL=supabase-access-token.d.ts.map