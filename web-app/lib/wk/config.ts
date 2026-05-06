/** Public URLs only (safe for NEXT_PUBLIC_*). No API secrets. */

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

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000/api";
}

export function getAdminPassword(): string {
  return process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "poule2026";
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
