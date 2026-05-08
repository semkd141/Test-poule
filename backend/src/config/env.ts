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
  /** Dashboard → API → JWT secret (HS256 access tokens from Supabase Auth). */
  SUPABASE_JWT_SECRET: z.string().min(1, "SUPABASE_JWT_SECRET is required"),
  PARTICIPANT_LEGACY_OPEN_MUTATIONS: boolishLegacy,
  ADMIN_API_SECRET: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(8).optional(),
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
