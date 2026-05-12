import type { Env } from "../config/env.js";
import { HttpError } from "../shared/http-error.js";
import type { SupabaseGateway } from "./supabase-gateway.js";
import { ApiFootballClient } from "./api-football-client.js";
import {
  extractPlayersFromApiFixtureItem,
  extractPlayersFromFixturePlayersEndpoint,
  matchUpsertBodyFromApiFixtureItem,
  playerStatisticsRowsFromSlim,
  type SlimPlayerRow,
} from "./api-football-fixture-slim.js";

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

function asPlayerRows(raw: unknown): FixtureStatisticsPlayer[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    const pid = row.player_id;
    const player_id =
      pid != null && Number.isFinite(Number(pid)) && Number(pid) > 0 ? Math.floor(Number(pid)) : null;
    return {
      land: row.land != null ? String(row.land) : "",
      speler_naam: row.speler_naam != null ? String(row.speler_naam) : "",
      player_id,
      punten: Number(row.punten) || 0,
    };
  });
}

function asMatchRow(raw: unknown): FixtureStatisticsMatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { ...(raw as Record<string, unknown>) };
}

async function resolveSlimPlayersFromApi(
  api: ApiFootballClient,
  fixtureId: number,
  fixtureItem: unknown,
): Promise<SlimPlayerRow[]> {
  let slim = extractPlayersFromApiFixtureItem(fixtureItem);
  if (slim.length > 0) return slim;
  try {
    const groups = await api.getFixturePlayerGroupsByFixtureId(fixtureId);
    slim = extractPlayersFromFixturePlayersEndpoint(groups);
  } catch {
    /* keep empty if /fixtures/players fails */
  }
  return slim;
}

export async function getOrSyncFixtureStatistics(
  gateway: SupabaseGateway,
  env: Env,
  competitionId: number,
  fixtureId: number,
): Promise<FixtureStatisticsResult> {
  const comp = await gateway.getCompetitionById(String(competitionId));
  if (!comp) throw new HttpError(404, "Competition not found");

  const existing = await gateway.getMatchByCompetitionAndExternalFixture(competitionId, fixtureId);
  if (existing) {
    let playersRaw = await gateway.listPlayerStatisticsByFixture(fixtureId);
    let players = asPlayerRows(playersRaw);
    if (
      players.length === 0 &&
      env.API_FOOTBALL_KEY &&
      env.API_FOOTBALL_KEY.length >= 8
    ) {
      const api = new ApiFootballClient(env.API_FOOTBALL_KEY);
      const item = await api.getFixtureResponseItemById(fixtureId);
      const slimPlayers = await resolveSlimPlayersFromApi(api, fixtureId, item ?? {});
      const statRows = playerStatisticsRowsFromSlim(fixtureId, slimPlayers);
      if (statRows.length > 0) {
        await gateway.deletePlayerStatisticsByFixture(fixtureId);
        await gateway.insertPlayerStatisticsBatch(statRows);
        playersRaw = await gateway.listPlayerStatisticsByFixture(fixtureId);
        players = asPlayerRows(playersRaw);
      }
    }
    return {
      source: "database",
      match: existing,
      players,
    };
  }

  if (!env.API_FOOTBALL_KEY || env.API_FOOTBALL_KEY.length < 8) {
    throw new HttpError(503, "API_FOOTBALL_KEY is not configured");
  }

  const api = new ApiFootballClient(env.API_FOOTBALL_KEY);
  const item = await api.getFixtureResponseItemById(fixtureId);
  if (!item) {
    throw new HttpError(404, "Fixture not found in API-Football");
  }

  const matchBody = matchUpsertBodyFromApiFixtureItem(competitionId, item);
  const upserted = await gateway.upsertMatch(matchBody);
  const firstUpsert =
    Array.isArray(upserted) && upserted.length > 0
      ? upserted[0]
      : upserted && typeof upserted === "object" && !Array.isArray(upserted)
        ? upserted
        : null;
  let match = asMatchRow(firstUpsert);
  if (!match) {
    match =
      (await gateway.getMatchByCompetitionAndExternalFixture(competitionId, fixtureId)) ??
      (matchBody as FixtureStatisticsMatch);
  }

  const slimPlayers = await resolveSlimPlayersFromApi(api, fixtureId, item);
  const statRows = playerStatisticsRowsFromSlim(fixtureId, slimPlayers);

  await gateway.deletePlayerStatisticsByFixture(fixtureId);
  if (statRows.length > 0) {
    await gateway.insertPlayerStatisticsBatch(statRows);
  }

  const playersRaw = await gateway.listPlayerStatisticsByFixture(fixtureId);
  return {
    source: "api_football",
    match: match ?? { ...matchBody },
    players: asPlayerRows(playersRaw),
  };
}
