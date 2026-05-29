import {
  syncAndScoreCompetitionFixtures,
  type FantasySyncApi,
  type FantasySyncGateway,
} from "../services/fantasy-scoring-sync.service.js";
import type { ApiFootballFixture } from "../services/api-football-client.js";

type Rollup = {
  id: string;
  competition_id: number;
  team_id: number;
  api_football_league_id: number;
  season: number;
  player_id: number;
  points: number;
  is_captain: boolean;
};

type Match = {
  id: number;
  competition_id: number | null;
  external_fixture_id: number;
  applied: boolean;
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const fixture: ApiFootballFixture = {
  fixture: {
    id: 855736,
    date: "2022-11-20T16:00:00+00:00",
    status: { short: "FT", long: "Match Finished" },
    venue: { name: "Al Bayt Stadium" },
  },
  league: { round: "Group Stage - 1" },
  teams: { home: { name: "Qatar" }, away: { name: "Ecuador" } },
  goals: { home: 0, away: 2 },
};

const playerGroups = [
  {
    team: { name: "Ecuador" },
    players: [
      {
        player: { id: 35533, name: "Enner Valencia" },
        statistics: [
          {
            games: { minutes: 77, position: "F" },
            goals: { total: 2, assists: 0, conceded: 0, saves: 0 },
            cards: { yellow: 0, red: 0 },
            penalty: { scored: 1, missed: 0, saved: 0 },
          },
        ],
      },
      {
        player: { id: 2583, name: "Angelo Preciado" },
        statistics: [
          {
            games: { minutes: 90, position: "D" },
            goals: { total: 0, assists: 1, conceded: 0, saves: 0 },
            cards: { yellow: 0, red: 0 },
            penalty: { scored: 0, missed: 0, saved: 0 },
          },
        ],
      },
    ],
  },
  {
    team: { name: "Qatar" },
    players: [
      {
        player: { id: 2525, name: "Saad Al Sheeb" },
        statistics: [
          {
            games: { minutes: 90, position: "G" },
            goals: { total: 0, assists: 0, conceded: 2, saves: 0 },
            cards: { yellow: 1, red: 0 },
            penalty: { scored: 0, missed: 0, saved: 0 },
          },
        ],
      },
    ],
  },
];

class MockApi implements FantasySyncApi {
  async getFixturesByLeagueSeason(): Promise<ApiFootballFixture[]> {
    return [fixture];
  }

  async getFixturePlayerGroupsByFixtureId(fixtureId: number): Promise<unknown[]> {
    assert(fixtureId === fixture.fixture.id, "unexpected fixture player lookup");
    return playerGroups;
  }
}

class MockGateway implements FantasySyncGateway {
  readonly mappings = new Map<string, Record<string, unknown>>();
  readonly matches = new Map<number, Match>();
  readonly rollups = new Map<string, Rollup>();
  readonly scoreEvents = new Set<string>();
  readonly teamTotals = new Map<number, number>();
  readonly playerStats = new Map<string, Record<string, unknown>>();
  private nextMatchId = 1;

  constructor() {
    this.mappings.set("gm-001", {
      id: 1,
      api_football_league_id: 1,
      season: 2022,
      local_key: "gm-001",
      api_fixture_id: 855736,
      stage: "group",
      kickoff_at: fixture.fixture.date,
      team_1: "Qatar",
      team_2: "Ecuador",
      location: "Al Bayt Stadium",
    });
    this.addRollup("r1", 101, 35533, true);
    this.addRollup("r2", 101, 2583, false);
    this.addRollup("r3", 102, 35533, false);
    this.addRollup("r4", 102, 2525, false);
  }

  private addRollup(id: string, teamId: number, playerId: number, isCaptain: boolean): void {
    this.rollups.set(id, {
      id,
      competition_id: 1,
      team_id: teamId,
      api_football_league_id: 1,
      season: 2022,
      player_id: playerId,
      points: 0,
      is_captain: isCaptain,
    });
  }

  getFixtureMappingScopeForCompetition(): { leagueId: number; season: number } {
    return { leagueId: 1, season: 2022 };
  }

  async upsertFixtureMappingsBatch(rows: Array<Record<string, unknown>>): Promise<void> {
    for (const row of rows) this.mappings.set(String(row.local_key), row);
  }

  async listFixtureMappings(): Promise<unknown> {
    return [...this.mappings.values()];
  }

  async upsertMatch(body: Record<string, unknown>): Promise<unknown> {
    const externalId = Number(body.external_fixture_id);
    const existing = this.matches.get(externalId);
    const row: Match = {
      id: existing?.id ?? this.nextMatchId++,
      competition_id: body.competition_id == null ? null : Number(body.competition_id),
      external_fixture_id: externalId,
      applied: existing?.applied ?? false,
    };
    this.matches.set(externalId, row);
    return [row];
  }

  async getMatchByExternalFixtureId(externalFixtureId: number): Promise<Record<string, unknown> | null> {
    return this.matches.get(externalFixtureId) ?? null;
  }

  async upsertPlayerStatisticsBatch(rows: Array<Record<string, unknown>>): Promise<void> {
    for (const row of rows) {
      const key = `${row.fixture_id}:${row.player_id}`;
      this.playerStats.set(key, row);
    }
  }

  async listPlayerRollupsByLeagueSeasonPlayer(
    leagueId: number,
    season: number,
    playerId: number,
  ): Promise<unknown> {
    return [...this.rollups.values()].filter(
      (r) => r.api_football_league_id === leagueId && r.season === season && r.player_id === playerId,
    );
  }

  async applyScoreEventAndIncrementRollupIfMissing(
    participantId: number,
    matchId: number,
    eventKey: string,
    deltaPoints: number,
    rollupId: string,
  ): Promise<boolean> {
    const eventId = `${participantId}:${matchId}:${eventKey}`;
    if (this.scoreEvents.has(eventId)) return false;
    const rollup = this.rollups.get(rollupId);
    assert(rollup && rollup.team_id === participantId, `missing rollup ${rollupId}`);
    this.scoreEvents.add(eventId);
    rollup!.points += deltaPoints;
    return true;
  }

  async recomputeTeamTotalPointsFromRollups(teamIdRaw: string): Promise<void> {
    const teamId = Number(teamIdRaw);
    const total = [...this.rollups.values()]
      .filter((r) => r.team_id === teamId)
      .reduce((sum, r) => sum + r.points, 0);
    this.teamTotals.set(teamId, total);
  }

  async patchMatchByExternalFixtureId(externalFixtureId: number, body: { applied?: boolean }): Promise<void> {
    const row = this.matches.get(externalFixtureId);
    assert(row, "cannot patch missing match");
    if (body.applied !== undefined) row!.applied = body.applied;
  }
}

const log = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  trace() {},
  fatal() {},
  child() {
    return this;
  },
};

const gateway = new MockGateway();
const api = new MockApi();
const competition = { id: 1, metadata: { api_football: { league: 1, season: 2022 } } };

const first = await syncAndScoreCompetitionFixtures(gateway, api, competition, log as never);
const second = await syncAndScoreCompetitionFixtures(gateway, api, competition, log as never);

assert(first.scoredFixtures === 1, "first run should score one fixture");
assert(first.scoreEventsApplied === 5, `expected 5 score events, got ${first.scoreEventsApplied}`);
assert(first.teamsTouched === 2, `expected 2 teams touched, got ${first.teamsTouched}`);
assert(second.scoredFixtures === 0, "second run should not rescore applied match");
assert(second.scoreEventsApplied === 0, "second run should not apply duplicate events");
assert(
  gateway.rollups.get("r1")?.points === 20,
  `captain Valencia should get doubled 2-goal points, got ${gateway.rollups.get("r1")?.points}; events=${[...gateway.scoreEvents].join("|")}`,
);
assert(gateway.rollups.get("r2")?.points === 7, "Preciado should get assist + clean sheet");
assert(gateway.rollups.get("r3")?.points === 10, "non-captain Valencia should get 2-goal points");
assert(gateway.rollups.get("r4")?.points === -1, "Qatar keeper should get yellow-card penalty only");
assert(gateway.teamTotals.get(101) === 27, "team 101 total should be 27");
assert(gateway.teamTotals.get(102) === 9, "team 102 total should be 9");
assert(gateway.playerStats.size === 3, "player stats should be upserted for all parsed players");

console.log(JSON.stringify({
  ok: true,
  first,
  second,
  rollups: Object.fromEntries([...gateway.rollups].map(([id, row]) => [id, row!.points])),
  teamTotals: Object.fromEntries(gateway.teamTotals),
  scoreEventCount: gateway.scoreEvents.size,
  playerStatRows: gateway.playerStats.size,
}, null, 2));
