import { HttpError } from "./shared/http-error.js";
/** Normalize `league_type` and set `api_football_league_id` from `api_football_league_lookup`. */
export async function resolvedLeagueFields(gateway, leagueTypeRaw) {
    const league_type = leagueTypeRaw.trim().toLowerCase();
    if (!league_type)
        throw new HttpError(400, "league_type is required");
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
export function defaultApiFootballSeasonForLeagueType(league_type) {
    const t = league_type.trim().toLowerCase();
    if (t === "world_cup" || t.startsWith("world_cup"))
        return 2026;
    if (t === "premier_league")
        return 2024;
    if (t === "champions_league")
        return 2024;
    return 2026;
}
/**
 * Best-effort API-Football `season` year from `competitions.season_label`
 * (e.g. `"2022"`, `"2022/23"`, `"Season 2024"`). Returns null if nothing plausible is found.
 */
export function parseApiFootballSeasonYearFromSeasonLabel(season_label) {
    if (season_label == null)
        return null;
    if (typeof season_label === "number" && Number.isFinite(season_label)) {
        const y = Math.floor(season_label);
        if (y >= 1900 && y <= 2100)
            return y;
        return null;
    }
    const s = String(season_label).trim();
    if (!s)
        return null;
    const direct = Number(s);
    if (Number.isFinite(direct)) {
        const y = Math.floor(direct);
        if (y >= 1900 && y <= 2100)
            return y;
    }
    const m = s.match(/\b(19|20)\d{2}\b/);
    if (!m)
        return null;
    const y = Number(m[0]);
    return Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null;
}
//# sourceMappingURL=league-type-resolve.js.map