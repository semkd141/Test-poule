import { type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
/**
 * Service-role Supabase client for server-only Auth Admin calls (`auth.admin.*`).
 * Uses {@link Env.SUPABASE_SERVICE_ROLE_KEY}; never expose that key to browsers.
 * {@link Env.SUPABASE_KEY} stays the anon/publishable key for normal Auth + PostgREST.
 */
export declare function createSupabaseAdmin(env: Env): SupabaseClient | null;
//# sourceMappingURL=supabase-admin.d.ts.map