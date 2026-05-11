import type { SupabaseGateway } from "./services/supabase-gateway.js";
import { HttpError } from "./shared/http-error.js";

/** Normalize `league_type` and set `api_football_league_id` from `api_football_league_lookup`. */
export async function resolvedLeagueFields(
  gateway: SupabaseGateway,
  leagueTypeRaw: string,
): Promise<{ league_type: string; api_football_league_id: number }> {
  const league_type = leagueTypeRaw.trim().toLowerCase();
  if (!league_type) throw new HttpError(400, "league_type is required");
  const api_football_league_id = await gateway.getApiFootballLeagueIdByType(league_type);
  if (api_football_league_id == null) {
    throw new HttpError(400, `Unknown league_type: ${leagueTypeRaw.trim()}`);
  }
  return { league_type, api_football_league_id };
}

/**
 * API-Football `season` year for `metadata.api_football` — derived on the server from `league_type`
 * (no separate DB column or client input). Extend this map when you add league types.
 */
export function defaultApiFootballSeasonForLeagueType(league_type: string): number {
  const t = league_type.trim().toLowerCase();
  if (t === "world_cup" || t.startsWith("world_cup")) return 2026;
  if (t === "premier_league") return 2024;
  if (t === "champions_league") return 2024;
  return 2026;
}
