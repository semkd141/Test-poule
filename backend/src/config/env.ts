import { z } from "zod";

/** Default true unless explicitly falsey strings (backward-compatible participant APIs). */
const boolishLegacy = z.preprocess((v: unknown): boolean => {
  if (v === undefined || v === "") return true;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(s)) return false;
  return true;
}, z.boolean());

/**
 * Validated at process start. See backend/.env.example for full list including
 * optional future vars (API_FOOTBALL_KEY, CRON_SECRET).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required"),
  /**
   * Service role JWT for PostgREST when the server must read/write any row (bypasses RLS).
   * Required for reliable participant lookups (e.g. signup-by-email check) if `deelnemers` has RLS.
   * Dashboard → Project Settings → API → service_role (server-only; never expose to browsers).
   */
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(20).optional(),
  ),
  /** Dashboard → API → JWT secret (HS256 access tokens from Supabase Auth). */
  SUPABASE_JWT_SECRET: z.string().min(1, "SUPABASE_JWT_SECRET is required"),
  API_FOOTBALL_KEY: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(8).optional(),
  ),
  RESEND_API_KEY: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(8).optional(),
  ),
  RESEND_FROM_EMAIL: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().email().optional(),
  ),
  /** Brevo secret: either SMTP password (`xsmtpsib-…`) or REST transactional API key (`xkeysib-…`). Or keep SMTP here and set `BREVO_REST_API_KEY` for REST. */
  BREVO_API_KEY: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(8).optional(),
  ),
  /** Prefer REST sends (`xkeysib-…`, SMTP & API → API keys). Use when `BREVO_API_KEY` is only an SMTP password or SMTP login fails. */
  BREVO_REST_API_KEY: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(8).optional(),
  ),
  BREVO_FROM_EMAIL: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().email().optional(),
  ),
  BREVO_FROM_NAME: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(1).optional(),
  ),
  /** SMTP relay auth.user (Brevo: SMTP & API → SMTP). Often `*@brevo.com`; defaults to `BREVO_FROM_EMAIL` only if your login matches From. */
  BREVO_SMTP_LOGIN: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().email().optional(),
  ),
  CRON_SECRET: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(8).optional(),
  ),
  PARTICIPANT_LEGACY_OPEN_MUTATIONS: boolishLegacy,
  ADMIN_API_SECRET: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(8).optional(),
  ),
  /** Optional fixed admin user id (Supabase auth.users.id) with full backend admin authority. */
  ADMIN_UID: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().uuid().optional(),
  ),
  /** Public web app origin for invitation links, e.g. https://app.example.com (no trailing slash). */
  PUBLIC_APP_URL: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().url().optional(),
  ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Validates and caches process.env once at startup (fail-fast).
 */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    console.error("[config] Invalid environment variables:", details);
    throw new Error(
      "Invalid environment configuration. Check SUPABASE_URL, SUPABASE_KEY, SUPABASE_JWT_SECRET, and PORT.",
    );
  }
  cached = parsed.data;
  return parsed.data;
}
