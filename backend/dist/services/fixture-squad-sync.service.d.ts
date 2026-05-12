import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "./supabase-gateway.js";
import { type FixtureSquadExtractRow, type FixtureSquadMemberInsert } from "./fixture-squad-extract.js";
export declare const FIXTURE_SQUAD_BATCH_BACKGROUND_MESSAGE = "Squad members are being fetched.";
/**
 * Build insert rows: for each lineup side (`team` = API `lineups[].team.name`), if league+season are known and any row
 * already exists for that triple, skip the whole side; otherwise include all lines (players + coaches).
 * Rows with no `team` are always inserted (no skip rule).
 */
export declare function buildFixtureSquadMemberInserts(extracted: FixtureSquadExtractRow[], fixtureId: number, leagueId: number | null, season: number | null, gateway: SupabaseGateway): Promise<FixtureSquadMemberInsert[]>;
/**
 * @param leagueSeasonFromMapping — When the caller already knows league + season (e.g. from `fixture_mappings`), pass it so rows are labeled even if `/fixtures` omits `league`.
 */
export declare function syncFixtureSquadMembers(fixtureId: number, gateway: SupabaseGateway, env: Env, leagueSeasonFromMapping?: {
    api_football_league_id: number;
    season: number;
}): Promise<{
    message: string;
}>;
type BatchOpts = {
    fixtureIds: number[];
    leagueId: number;
    season: number;
};
/** Fire-and-forget background processing (3s between upstream API calls). */
export declare function startFixtureSquadBackgroundBatch(opts: BatchOpts, gateway: SupabaseGateway, env: Env, log: AppLogger): void;
export {};
//# sourceMappingURL=fixture-squad-sync.service.d.ts.map