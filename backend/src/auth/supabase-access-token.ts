import { jwtVerify, type JWTPayload } from "jose";

/**
 * Validates Supabase-issued JWTs (GoTrue) signed with HS256 using the project's JWT secret.
 * Configure in Dashboard → Project Settings → API → JWT Signing Key / legacy JWT secret.
 */
export async function verifySupabaseAccessToken(
  token: string,
  opts: {
    jwtSecret: string;
    issuer: string;
  },
): Promise<JWTPayload & { sub?: string; email?: string }> {
  const signingKey = new TextEncoder().encode(opts.jwtSecret);
  const { payload } = await jwtVerify(token, signingKey, {
    algorithms: ["HS256"],
    issuer: opts.issuer,
  });
  return payload as JWTPayload & { sub?: string; email?: string };
}

export function supabaseJwtIssuer(projectUrlNoTrailingSlash: string): string {
  return `${projectUrlNoTrailingSlash.replace(/\/$/, "")}/auth/v1`;
}
