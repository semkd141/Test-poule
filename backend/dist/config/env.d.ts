import { z } from "zod";
/**
 * Validated at process start. See backend/.env.example for full list including
 * optional future vars (API_FOOTBALL_KEY, CRON_SECRET).
 */
declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    SUPABASE_URL: z.ZodString;
    SUPABASE_KEY: z.ZodString;
    SUPABASE_SERVICE_ROLE_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    SUPABASE_JWT_SECRET: z.ZodString;
    API_FOOTBALL_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    RESEND_API_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    RESEND_FROM_EMAIL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    BREVO_API_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    BREVO_REST_API_KEY: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    BREVO_FROM_EMAIL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    BREVO_FROM_NAME: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    BREVO_SMTP_LOGIN: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    CRON_SECRET: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    PARTICIPANT_LEGACY_OPEN_MUTATIONS: z.ZodPreprocess<z.ZodBoolean>;
    ADMIN_API_SECRET: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    ADMIN_UID: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    PUBLIC_APP_URL: z.ZodPreprocess<z.ZodOptional<z.ZodString>>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<{
        error: "error";
        fatal: "fatal";
        warn: "warn";
        info: "info";
        debug: "debug";
        trace: "trace";
        silent: "silent";
    }>>;
}, z.core.$strip>;
export type Env = z.infer<typeof envSchema>;
/**
 * Validates and caches process.env once at startup (fail-fast).
 */
export declare function loadEnv(): Env;
export {};
//# sourceMappingURL=env.d.ts.map