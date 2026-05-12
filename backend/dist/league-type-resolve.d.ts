import type { SupabaseGateway } from "./services/supabase-gateway.js";
/** Normalize `league_type` and set `api_football_league_id` from `api_football_league_lookup`. */
export declare function resolvedLeagueFields(gateway: SupabaseGateway, leagueTypeRaw: string): Promise<{
    league_type: string;
    api_football_league_id: number;
}>;
/**
 * API-Football `season` year for `metadata.api_football` — derived on the server from `league_type`
 * (no separate DB column or client input). Extend this map when you add league types.
 */
export declare function defaultApiFootballSeasonForLeagueType(league_type: string): number;
/**
 * Best-effort API-Football `season` year from `competitions.season_label`
 * (e.g. `"2022"`, `"2022/23"`, `"Season 2024"`). Returns null if nothing plausible is found.
 */
export declare function parseApiFootballSeasonYearFromSeasonLabel(season_label: unknown): number | null;
//# sourceMappingURL=league-type-resolve.d.ts.map