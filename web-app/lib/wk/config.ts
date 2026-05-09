/**
 * Browser-exposed settings only (NEXT_PUBLIC_*). No backend secrets here.
 *
 * Variables:
 * - NEXT_PUBLIC_API_BASE — Express API root (default http://localhost:4000/api)
 * - NEXT_PUBLIC_SUPABASE_URL — public Supabase URL (storage URLs)
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase publishable anon key (Auth in the browser)
 * - NEXT_PUBLIC_SITE_URL — origin used in redirect URLs for OAuth/email (e.g. http://localhost:3000)
 * - NEXT_PUBLIC_ADMIN_UID — admin auth.users.id required for frontend admin mode
 */

export const DEFAULT_DEADLINE = "2026-06-10T23:59:59+02:00";
export const DEFAULT_DEADLINE_LABEL = "10 juni 2026";
export const WC_START = new Date("2026-06-11T18:00:00+02:00");

export function getSupabasePublicUrl(): string {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u || !u.startsWith("http")) {
    return "https://ucqimrpcndzepgofwdvt.supabase.co";
  }
  return u.replace(/\/$/, "");
}

export function getSupabaseAnonKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return k?.trim()?.length ? k.trim() : undefined;
}

/** Site URL for Supabase redirect (OAuth / magic links). Fallback: browser origin during client use. */
export function getSiteUrl(): string | undefined {
  const u = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (u?.startsWith("http")) return u.replace(/\/$/, "");
  return typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : undefined;
}

/**
 * `emailRedirectTo` / OAuth `redirectTo` for Supabase Auth.
 * Must be a plain https? URL with no `#fragment` — GoTrue rejects or mishandles redirects
 * that embed hash routes (often surfacing as 500s on `/auth/v1/otp` or broken magic links).
 */
export function getSupabaseAuthRedirectOrigin(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site?.startsWith("http")) return site.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "";
}

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000/api";
}

export function getAdminUid(): string {
  return (
    process.env.NEXT_PUBLIC_ADMIN_UID?.trim() ||
    "9d038a42-843f-4aa2-8462-5284431b628d"
  );
}

export function buildPhotos(supabaseUrl: string) {
  const base = `${supabaseUrl}/storage/v1/object/public/fotos/`;
  return {
    virgil: base + "virgil-removebg-preview.png",
    messi: base + "messi_2.0-removebg-preview.png",
    mbappe: base + "mbappe-removebg-preview.png",
    ronaldo: base + "ronadlo-removebg-preview.png",
    weghorst: base + "weghorst-removebg-preview.png",
    hakimi: base + "hakimi-removebg-preview.png",
    mane: base + "Mane-removebg-preview.png",
    yamal: base + "yamal-removebg-preview.png",
    palmer: base + "palmer-removebg-preview.png",
    trophy: base + "world_cup-removebg-preview.png",
    wcPhoto: base + "world_cup_foto-removebg-preview.png",
    paqueta: base + "paquetta-removebg-preview.png",
    bacuna: base + "bacuna-removebg-preview.png",
  } as const;
}
