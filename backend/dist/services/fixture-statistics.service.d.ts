import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "./supabase-gateway.js";
export type FixtureStatisticsPlayer = {
    land: string;
    speler_naam: string;
    /** API-Football `players.id` when stored; null for legacy rows or missing upstream id. */
    player_id: number | null;
    punten: number;
};
export type FixtureStatisticsMatch = Record<string, unknown>;
export type FixtureStatisticsResult = {
    source: "database" | "api_football";
    match: FixtureStatisticsMatch;
    players: FixtureStatisticsPlayer[];
};
export declare function getOrSyncFixtureStatistics(gateway: SupabaseGateway, env: Env, competitionId: number, fixtureId: number): Promise<FixtureStatisticsResult>;
//# sourceMappingURL=fixture-statistics.service.d.ts.map