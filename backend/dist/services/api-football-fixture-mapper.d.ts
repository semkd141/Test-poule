export type ApiFootballFixtureItem = {
    fixture?: {
        id?: number;
        date?: string;
        timestamp?: number;
        venue?: {
            name?: string | null;
        };
    };
    league?: {
        round?: string | null;
    };
    teams?: {
        home?: {
            name?: string | null;
        };
        away?: {
            name?: string | null;
        };
    };
};
export type FixtureMappingInsertRow = {
    api_football_league_id: number;
    season: number;
    local_key: string;
    api_fixture_id: number;
    stage: string;
    kickoff_at: string | null;
    team_1: string | null;
    team_2: string | null;
    location: string | null;
};
type InternalRow = {
    _bucket: string;
    _kickoff: number;
    api_football_league_id: number;
    season: number;
    api_fixture_id: number;
    stage: string;
    kickoff_at: string | null;
    team_1: string | null;
    team_2: string | null;
    location: string | null;
    local_key: string | null;
};
/** Map API-Football `league.round` to a bucket for local_key assignment. */
export declare function roundBucket(round: unknown): string;
export declare function stageForBucket(bucket: string): string;
export declare function kickoffUnix(item: ApiFootballFixtureItem): number;
export declare function extractFixtureRow(item: ApiFootballFixtureItem, apiFootballLeagueId: number, season: number): InternalRow | null;
export declare function assignLocalKeys(rows: InternalRow[]): FixtureMappingInsertRow[];
export declare function mapApiResponseToFixtureRows(items: ApiFootballFixtureItem[], apiFootballLeagueId: number, season: number): FixtureMappingInsertRow[];
export type FetchFixturesParams = {
    apiKey: string;
    league: number;
    season: number;
    /** @default axios default timeout */
    timeoutMs?: number;
};
/**
 * Load every fixture for league + season from API-Football (v3), then return one combined array.
 * First request uses only `league` + `season` (same as test-api.js). Extra pages are fetched in parallel.
 * Callers should map + persist to Supabase in one batch afterward.
 */
export declare function fetchAllFixturesFromApiFootball(params: FetchFixturesParams): Promise<ApiFootballFixtureItem[]>;
export {};
//# sourceMappingURL=api-football-fixture-mapper.d.ts.map