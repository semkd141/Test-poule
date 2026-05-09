import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";

/**
 * Service-role Supabase client for server-only Auth Admin calls (`auth.admin.*`).
 * Uses {@link Env.SUPABASE_SERVICE_ROLE_KEY}; never expose that key to browsers.
 * {@link Env.SUPABASE_KEY} stays the anon/publishable key for normal Auth + PostgREST.
 */
export function createSupabaseAdmin(env: Env): SupabaseClient | null {
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) return null;
  return createClient(env.SUPABASE_URL, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
