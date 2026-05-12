/**
 * Extract squad rows from one API-Football `/fixtures` response element (lineups + optional `players`).
 * Mirrors backend/test-api3.js: coaches included, `pos` = "Coach" for coaches.
 * Team name from `lineups[].team.name` / `players[].team.name` (see backend/fixture.json).
 */
export type FixtureSquadExtractRow = {
    name: string | null;
    team: string | null;
    playerId: number | null;
    pos: string | null;
};
/** One row for PostgREST `fixture_squad_members` (snake_case matches DB columns). */
export type FixtureSquadMemberInsert = {
    fixture_id: number;
    name: string | null;
    team: string | null;
    player_id: number;
    pos: string | null;
    api_football_league_id: number | null;
    season: number | null;
};
export type FixtureLeagueSeason = {
    api_football_league_id: number | null;
    season: number | null;
};
/**
 * Read API-Football league id + season from one `/fixtures` response element (`league.id`, `league.season`).
 */
export declare function extractFixtureLeagueSeason(item: unknown): FixtureLeagueSeason;
/**
 * @param item — one element of API-Football `GET /fixtures` `response[]`
 */
export declare function extractFixtureSquadRows(item: unknown): FixtureSquadExtractRow[];
//# sourceMappingURL=fixture-squad-extract.d.ts.map