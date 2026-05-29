import { HttpError } from "../shared/http-error.js";

export type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    status?: { short?: string; long?: string };
    venue?: { name?: string | null };
  };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  league?: { round?: string };
};

type ApiFootballResponse<T> = {
  response?: T[];
  errors?: Record<string, unknown> | unknown[];
  paging?: { current?: number; total?: number };
};

export class ApiFootballClient {
  private readonly base = "https://v3.football.api-sports.io";
  private lastRequestAt = 0;
  constructor(
    private readonly apiKey: string,
    private readonly minDelayMs = 0,
    private readonly timeoutMs = 20_000,
  ) {}

  private async waitForRateLimitSlot(): Promise<void> {
    if (this.minDelayMs <= 0) return;
    const elapsed = Date.now() - this.lastRequestAt;
    const waitMs = this.minDelayMs - elapsed;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }

  private async getEnvelope<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<ApiFootballResponse<T>> {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => q.set(k, String(v)));
    const url = `${this.base}${path}?${q.toString()}`;
    await this.waitForRateLimitSlot();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "x-apisports-key": this.apiKey,
      },
    }).finally(() => clearTimeout(timeout));
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new HttpError(502, `API-Football upstream error ${r.status}: ${body.slice(0, 300)}`);
    }
    const data = (await r.json()) as ApiFootballResponse<T>;
    const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
    if (hasErrors) {
      throw new HttpError(502, `API-Football returned errors: ${JSON.stringify(data.errors).slice(0, 500)}`);
    }
    return data;
  }

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
    const data = await this.getEnvelope<T>(path, params);
    return data.response ?? [];
  }

  async getFixtureById(fixtureId: number): Promise<ApiFootballFixture | null> {
    const rows = await this.get<ApiFootballFixture>("/fixtures", { id: fixtureId });
    return rows[0] ?? null;
  }

  async getFixturesByLeagueSeason(leagueId: number, season: number): Promise<ApiFootballFixture[]> {
    const first = await this.getEnvelope<ApiFootballFixture>("/fixtures", { league: leagueId, season });
    const out = [...(first.response ?? [])];
    const total = Math.floor(Number(first.paging?.total)) || 1;
    for (let page = 2; page <= total; page += 1) {
      const next = await this.getEnvelope<ApiFootballFixture>("/fixtures", { league: leagueId, season, page });
      out.push(...(next.response ?? []));
    }
    return out;
  }

  /** Full `/fixtures` row (includes `players` when API returns them — often only for some competitions). */
  async getFixtureResponseItemById(fixtureId: number): Promise<unknown | null> {
    const rows = await this.get<unknown>("/fixtures", { id: fixtureId });
    return rows[0] ?? null;
  }

  /**
   * Squad + per-player stats for a fixture (UEFA leagues, etc. often omit `players` on `/fixtures`).
   * https://www.api-football.com/documentation-v3#tag/Fixtures/operation/get-fixtures-players
   */
  async getFixturePlayerGroupsByFixtureId(fixtureId: number): Promise<unknown[]> {
    return this.get<unknown>("/fixtures/players", { fixture: fixtureId });
  }

  async getFixtureEventsByFixtureId(fixtureId: number): Promise<unknown[]> {
    return this.get<unknown>("/fixtures/events", { fixture: fixtureId });
  }
}
