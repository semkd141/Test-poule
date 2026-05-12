export type ApiFootballFixture = {
    fixture: {
        id: number;
        date: string;
        status?: {
            short?: string;
            long?: string;
        };
    };
    teams: {
        home: {
            name: string;
        };
        away: {
            name: string;
        };
    };
    goals: {
        home: number | null;
        away: number | null;
    };
    league?: {
        round?: string;
    };
};
export declare class ApiFootballClient {
    private readonly apiKey;
    private readonly base;
    constructor(apiKey: string);
    private get;
    getFixtureById(fixtureId: number): Promise<ApiFootballFixture | null>;
    /** Full `/fixtures` row (includes `players` when API returns them — often only for some competitions). */
    getFixtureResponseItemById(fixtureId: number): Promise<unknown | null>;
    /**
     * Squad + per-player stats for a fixture (UEFA leagues, etc. often omit `players` on `/fixtures`).
     * https://www.api-football.com/documentation-v3#tag/Fixtures/operation/get-fixtures-players
     */
    getFixturePlayerGroupsByFixtureId(fixtureId: number): Promise<unknown[]>;
}
//# sourceMappingURL=api-football-client.d.ts.map