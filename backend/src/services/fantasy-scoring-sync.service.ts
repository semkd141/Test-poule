import type { AppLogger } from "../lib/logger.js";
import {
  mapApiResponseToFixtureRows,
  type ApiFootballFixtureItem,
} from "./api-football-fixture-mapper.js";
import type { ApiFootballFixture } from "./api-football-client.js";
import {
  extractFantasyPlayerDeltas,
  type FantasyPlayerDelta,
} from "./fantasy-stat-parser.js";
export type FantasySyncGateway = {
  getFixtureMappingScopeForCompetition(comp: Record<string, unknown>): { leagueId: number; season: number } | null;
  upsertFixtureMappingsBatch(rows: Array<{
    api_football_league_id: number;
    season: number;
    local_key: string;
    api_fixture_id: number | null;
    stage: string;
    kickoff_at: string | null;
    team_1: string | null;
    team_2: string | null;
    location: string | null;
  }>): Promise<void>;
  listFixtureMappings(competitionId: number): Promise<unknown>;
  upsertMatch(body: Record<string, unknown>): Promise<unknown>;
  getMatchByExternalFixtureId(externalFixtureId: number): Promise<Record<string, unknown> | null>;
  upsertPlayerStatisticsBatch(rows: Array<{
    fixture_id: number;
    land: string;
    speler_naam: string;
    player_id: number | null;
    punten: number;
  }>): Promise<void>;
  listPlayerRollupsByLeagueSeasonPlayer(leagueId: number, season: number, playerId: number): Promise<unknown>;
  applyScoreEventAndIncrementRollupIfMissing(
    participantId: number,
    matchId: number,
    eventKey: string,
    deltaPoints: number,
    rollupId: string,
  ): Promise<boolean>;
  recomputeTeamTotalPointsFromRollups(teamId: string): Promise<void>;
  patchMatchByExternalFixtureId(externalFixtureId: number, body: { applied?: boolean }): Promise<void>;
};

export type FantasySyncApi = {
  getFixturesByLeagueSeason(leagueId: number, season: number): Promise<ApiFootballFixture[]>;
  getFixturePlayerGroupsByFixtureId(fixtureId: number): Promise<unknown[]>;
};

type FixtureMapRow = {
  id: number;
  local_key: string;
  api_fixture_id: number | null;
};

type MatchRow = {
  id: number;
  applied?: unknown;
};

type RollupRow = {
  id?: unknown;
  team_id?: unknown;
  points?: unknown;
  is_captain?: unknown;
};

export type FantasySyncResult = {
  fixtureMappingsRefreshed: number;
  apiSeasonFixturesAvailable: number;
  syncedFixtures: number;
  scoredFixtures: number;
  playerStatRows: number;
  scoreEventsApplied: number;
  teamsTouched: number;
};

type RefreshFixtureResult = {
  totalFromApi: number;
  written: number;
  fixturesById: Map<number, ApiFootballFixture>;
};

function isFinished(status: string): boolean {
  return ["FT", "AET", "PEN"].includes(status);
}

function matchApplied(row: Record<string, unknown> | null): boolean {
  const value = row?.applied;
  return value === true || value === "true" || value === 1 || value === "t";
}

function matchRowFromUpsert(raw: unknown, fallback: Record<string, unknown> | null): MatchRow | null {
  const row =
    Array.isArray(raw) && raw.length > 0
      ? raw[0]
      : raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw
        : fallback;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const id = Number((row as Record<string, unknown>).id);
  return Number.isFinite(id) && id > 0 ? { id, applied: (row as Record<string, unknown>).applied } : null;
}

function toMatchPayload(src: ApiFootballFixture): Record<string, unknown> {
  return {
    external_fixture_id: src.fixture.id,
    status: src.fixture.status?.short ?? "NS",
    round: src.league?.round ?? null,
    kickoff_at: src.fixture.date,
    home_team: src.teams.home.name,
    away_team: src.teams.away.name,
    home_goals: src.goals.home,
    away_goals: src.goals.away,
    payload: src,
    synced_at: new Date().toISOString(),
  };
}

function playerStatRows(fixtureId: number, deltas: FantasyPlayerDelta[]) {
  return deltas.map((d) => ({
    fixture_id: fixtureId,
    land: d.teamName,
    speler_naam: d.playerName,
    player_id: d.playerId,
    punten: d.totalPoints,
  }));
}

function teamGoalsConcededFromFixture(fixture: ApiFootballFixture): Record<string, number> {
  return {
    [fixture.teams.home.name]: Math.floor(Number(fixture.goals.away)) || 0,
    [fixture.teams.away.name]: Math.floor(Number(fixture.goals.home)) || 0,
  };
}

async function refreshApiFixtureMappings(
  gateway: FantasySyncGateway,
  api: FantasySyncApi,
  leagueId: number,
  season: number,
  log: AppLogger,
): Promise<RefreshFixtureResult> {
  const fixtures = await api.getFixturesByLeagueSeason(leagueId, season);
  const fixturesById = new Map<number, ApiFootballFixture>();
  for (const fixture of fixtures) fixturesById.set(Number(fixture.fixture.id), fixture);
  if (fixtures.length === 0) {
    log.info({ leagueId, season }, "API-Football returned no fixtures for league season; keeping seeded mappings");
    return { totalFromApi: 0, written: 0, fixturesById };
  }

  const rows = mapApiResponseToFixtureRows(
    fixtures as unknown as ApiFootballFixtureItem[],
    leagueId,
    season,
  );
  if (rows.length === 0) return { totalFromApi: fixtures.length, written: 0, fixturesById };
  await gateway.upsertFixtureMappingsBatch(rows);
  return { totalFromApi: fixtures.length, written: rows.length, fixturesById };
}

async function applyFantasyDeltas(
  gateway: FantasySyncGateway,
  leagueId: number,
  season: number,
  matchId: number,
  deltas: FantasyPlayerDelta[],
): Promise<{ events: number; teams: Set<string> }> {
  let events = 0;
  const teams = new Set<string>();

  for (const delta of deltas) {
    if (delta.breakdown.length === 0) continue;
    const rollupsRaw = await gateway.listPlayerRollupsByLeagueSeasonPlayer(
      leagueId,
      season,
      delta.playerId,
    );
    const rollups = Array.isArray(rollupsRaw) ? (rollupsRaw as RollupRow[]) : [];

    for (const rollup of rollups) {
      const rollupId = rollup.id != null ? String(rollup.id) : "";
      const teamId = Number(rollup.team_id);
      if (!rollupId || !Number.isFinite(teamId) || teamId <= 0) continue;

      for (const item of delta.breakdown) {
        const multiplier = rollup.is_captain === true || rollup.is_captain === "true" ? 2 : 1;
        const appliedDelta = item.points * multiplier;
        const eventKey = `fantasy:${matchId}:p${delta.playerId}:${item.key}`;
        const inserted = await gateway.applyScoreEventAndIncrementRollupIfMissing(
          teamId,
          matchId,
          eventKey,
          appliedDelta,
          rollupId,
        );
        if (!inserted) continue;
        events += 1;
        teams.add(String(teamId));
      }
    }
  }

  return { events, teams };
}

export async function syncAndScoreCompetitionFixtures(
  gateway: FantasySyncGateway,
  api: FantasySyncApi,
  competition: Record<string, unknown>,
  log: AppLogger,
): Promise<FantasySyncResult> {
  const competitionId = Number(competition.id);
  const scope = gateway.getFixtureMappingScopeForCompetition(competition);
  if (!Number.isFinite(competitionId) || competitionId <= 0 || !scope) {
    return {
      fixtureMappingsRefreshed: 0,
      apiSeasonFixturesAvailable: 0,
      syncedFixtures: 0,
      scoredFixtures: 0,
      playerStatRows: 0,
      scoreEventsApplied: 0,
      teamsTouched: 0,
    };
  }

  const refreshed = await refreshApiFixtureMappings(
    gateway,
    api,
    scope.leagueId,
    scope.season,
    log,
  );
  const mappings = (await gateway.listFixtureMappings(competitionId)) as FixtureMapRow[];
  const mappedFixtureIds = new Set(
    mappings
      .map((mapping) => Number(mapping.api_fixture_id))
      .filter((fixtureId) => Number.isFinite(fixtureId) && fixtureId > 0),
  );
  const fixturesFromSeason = [...refreshed.fixturesById.values()].filter(
    (fixture) => mappedFixtureIds.has(Number(fixture.fixture.id)) && isFinished(String(fixture.fixture.status?.short ?? "")),
  );
  let syncedFixtures = 0;
  let scoredFixtures = 0;
  let playerStatRowsCount = 0;
  let scoreEventsApplied = 0;
  const teamsTouched = new Set<string>();

  for (const fixture of fixturesFromSeason) {
    const fixtureId = Number(fixture.fixture.id);
    const status = String(fixture.fixture.status?.short ?? "");
    if (!isFinished(status)) continue;

    const matchPayload = toMatchPayload(fixture);
    const upserted = await gateway.upsertMatch(matchPayload);
    const persisted = await gateway.getMatchByExternalFixtureId(fixtureId);
    const match = matchRowFromUpsert(upserted, persisted);
    syncedFixtures += 1;
    if (!match || matchApplied(persisted)) continue;

    const groups = await api.getFixturePlayerGroupsByFixtureId(fixtureId);
    const deltas = extractFantasyPlayerDeltas(groups, teamGoalsConcededFromFixture(fixture));
    if (deltas.length === 0) {
      log.warn({ fixtureId }, "API-Football returned no player stat rows; fixture will be retried later");
      continue;
    }
    const rows = playerStatRows(fixtureId, deltas);
    if (rows.length > 0) await gateway.upsertPlayerStatisticsBatch(rows);
    playerStatRowsCount += rows.length;

    const applied = await applyFantasyDeltas(
      gateway,
      scope.leagueId,
      scope.season,
      match.id,
      deltas,
    );
    for (const teamId of applied.teams) teamsTouched.add(teamId);
    scoreEventsApplied += applied.events;

    for (const teamId of applied.teams) {
      await gateway.recomputeTeamTotalPointsFromRollups(teamId);
    }
    await gateway.patchMatchByExternalFixtureId(fixtureId, { applied: true });
    scoredFixtures += 1;
  }

  return {
    fixtureMappingsRefreshed: refreshed.written,
    apiSeasonFixturesAvailable: refreshed.totalFromApi,
    syncedFixtures,
    scoredFixtures,
    playerStatRows: playerStatRowsCount,
    scoreEventsApplied,
    teamsTouched: teamsTouched.size,
  };
}
