/**
 * Slim fixture + player rows from API-Football v3 /fixtures response (see test-api2.js).
 */
export declare function numOrNull(v: unknown): number | null;
export type SlimPlayerRow = {
    land: string | null;
    spelerNaam: string | null;
    /** API-Football `player.id` when present. */
    playerId: number | null;
    punten: number;
};
/**
 * `players`: [ { team, players: [ { player, statistics: [ { goals, penalty } ] } ] } ]
 */
export declare function extractPlayersFromApiFixtureItem(item: unknown): SlimPlayerRow[];
/**
 * `/fixtures/players` returns `response` as an array of `{ team, players }` — same shape as `item.players`
 * on a full `/fixtures` row when present.
 */
export declare function extractPlayersFromFixturePlayersEndpoint(response: unknown): SlimPlayerRow[];
/** Build `matches` upsert body from raw API-Football fixture item. */
export declare function matchUpsertBodyFromApiFixtureItem(competitionId: number, item: unknown): Record<string, unknown>;
export declare function playerStatisticsRowsFromSlim(fixtureId: number, slimPlayers: SlimPlayerRow[]): Array<{
    fixture_id: number;
    land: string;
    speler_naam: string;
    player_id: number | null;
    punten: number;
}>;
//# sourceMappingURL=api-football-fixture-slim.d.ts.map