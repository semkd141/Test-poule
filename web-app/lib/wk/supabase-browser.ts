import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "./config";

let client: SupabaseClient | null = null;

/**
 * Browser-only Supabase client (Google OAuth, password, OTP). Null if NEXT_PUBLIC_SUPABASE_ANON_KEY is unset.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const key = getSupabaseAnonKey();
  if (!key || !key.length) return null;
  if (!client) {
    client = createClient(getSupabasePublicUrl(), key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
