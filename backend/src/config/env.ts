import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_KEY: z.string().min(1, "SUPABASE_KEY is required"),
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
    throw new Error("Invalid environment configuration. Check SUPABASE_URL, SUPABASE_KEY, and PORT.");
  }
  cached = parsed.data;
  return parsed.data;
}
