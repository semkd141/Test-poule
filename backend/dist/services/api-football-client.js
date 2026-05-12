import { HttpError } from "../shared/http-error.js";
export class ApiFootballClient {
    apiKey;
    base = "https://v3.football.api-sports.io";
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async get(path, params) {
        const q = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => q.set(k, String(v)));
        const url = `${this.base}${path}?${q.toString()}`;
        const r = await fetch(url, {
            headers: {
                "x-apisports-key": this.apiKey,
            },
        });
        if (!r.ok) {
            const body = await r.text().catch(() => "");
            throw new HttpError(502, `API-Football upstream error ${r.status}: ${body.slice(0, 300)}`);
        }
        const data = (await r.json());
        const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
        if (hasErrors) {
            throw new HttpError(502, `API-Football returned errors: ${JSON.stringify(data.errors).slice(0, 500)}`);
        }
        return data.response ?? [];
    }
    async getFixtureById(fixtureId) {
        const rows = await this.get("/fixtures", { id: fixtureId });
        return rows[0] ?? null;
    }
    /** Full `/fixtures` row (includes `players` when API returns them — often only for some competitions). */
    async getFixtureResponseItemById(fixtureId) {
        const rows = await this.get("/fixtures", { id: fixtureId });
        return rows[0] ?? null;
    }
    /**
     * Squad + per-player stats for a fixture (UEFA leagues, etc. often omit `players` on `/fixtures`).
     * https://www.api-football.com/documentation-v3#tag/Fixtures/operation/get-fixtures-players
     */
    async getFixturePlayerGroupsByFixtureId(fixtureId) {
        return this.get("/fixtures/players", { fixture: fixtureId });
    }
}
//# sourceMappingURL=api-football-client.js.map