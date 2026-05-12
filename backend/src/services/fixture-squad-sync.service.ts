import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import type { SupabaseGateway } from "./supabase-gateway.js";
import { ApiFootballClient } from "./api-football-client.js";
import {
  extractFixtureLeagueSeason,
  extractFixtureSquadRows,
  type FixtureLeagueSeason,
  type FixtureSquadExtractRow,
  type FixtureSquadMemberInsert,
} from "./fixture-squad-extract.js";
import { HttpError } from "../shared/http-error.js";

const SUCCESS_MESSAGE = "players with this fixture fetched";
export const FIXTURE_SQUAD_BATCH_BACKGROUND_MESSAGE = "Squad members are being fetched.";

const API_SPACING_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLeagueSeason(
  fromMapping: FixtureLeagueSeason | undefined,
  fromApi: FixtureLeagueSeason,
): { api_football_league_id: number | null; season: number | null } {
  const lid =
    fromMapping?.api_football_league_id ??
    fromApi.api_football_league_id ??
    null;
  const season = fromMapping?.season ?? fromApi.season ?? null;
  return { api_football_league_id: lid, season };
}

function groupExtractedByTeam(extracted: FixtureSquadExtractRow[]): Map<string, FixtureSquadExtractRow[]> {
  const m = new Map<string, FixtureSquadExtractRow[]>();
  for (const row of extracted) {
    const key = row.team?.trim() ?? "";
    const arr = m.get(key) ?? [];
    arr.push(row);
    m.set(key, arr);
  }
  return m;
}

/** Prefer a non-coach with a player id for the league+season+team skip probe. */
function pickRepresentativeForTeamSkip(group: FixtureSquadExtractRow[]): FixtureSquadExtractRow | null {
  const withPid = group.filter((r) => r.playerId != null);
  const nonCoach = withPid.find((r) => (r.pos ?? "") !== "Coach");
  if (nonCoach) return nonCoach;
  return withPid[0] ?? null;
}

/**
 * Build insert rows: for each lineup side (`team` = API `lineups[].team.name`), if league+season are known and any row
 * already exists for that triple, skip the whole side; otherwise include all lines (players + coaches).
 * Rows with no `team` are always inserted (no skip rule).
 */
export async function buildFixtureSquadMemberInserts(
  extracted: FixtureSquadExtractRow[],
  fixtureId: number,
  leagueId: number | null,
  season: number | null,
  gateway: SupabaseGateway,
): Promise<FixtureSquadMemberInsert[]> {
  const leagueOk = leagueId != null && Number.isFinite(leagueId) && leagueId > 0;
  const seasonOk = season != null && Number.isFinite(season) && season > 0;
  const canSkipByScope = leagueOk && seasonOk;
  const leagueVal = leagueOk ? Math.floor(leagueId as number) : null;
  const seasonVal = seasonOk ? Math.floor(season as number) : null;

  const groupMap = groupExtractedByTeam(extracted);
  const out: FixtureSquadMemberInsert[] = [];

  for (const [teamKey, group] of groupMap) {
    if (!teamKey) {
      for (const r of group) {
        if (r.playerId == null) continue;
        out.push({
          fixture_id: fixtureId,
          name: r.name,
          team: r.team?.trim() || null,
          player_id: r.playerId,
          pos: r.pos,
          api_football_league_id: leagueVal,
          season: seasonVal,
        });
      }
      continue;
    }

    if (canSkipByScope) {
      const rep = pickRepresentativeForTeamSkip(group);
      if (rep) {
        const skip = await gateway.existsFixtureSquadLeagueSeasonTeam(
          leagueVal as number,
          seasonVal as number,
          teamKey,
        );
        if (skip) continue;
      }
    }

    for (const r of group) {
      if (r.playerId == null) continue;
      out.push({
        fixture_id: fixtureId,
        name: r.name,
        team: r.team?.trim() || null,
        player_id: r.playerId,
        pos: r.pos,
        api_football_league_id: leagueVal,
        season: seasonVal,
      });
    }
  }
  return out;
}

async function loadMergedFixtureItem(api: ApiFootballClient, fixtureId: number): Promise<unknown | null> {
  const raw = await api.getFixtureResponseItemById(fixtureId);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rawObj = raw as Record<string, unknown>;
  let item: unknown = raw;
  const existingPlayers = rawObj.players;
  if (!Array.isArray(existingPlayers) || existingPlayers.length === 0) {
    const extra = await api.getFixturePlayerGroupsByFixtureId(fixtureId);
    if (Array.isArray(extra) && extra.length > 0) {
      item = { ...rawObj, players: extra };
    }
  }
  return item;
}

async function persistAfterApiFetch(
  gateway: SupabaseGateway,
  fixtureId: number,
  rows: FixtureSquadMemberInsert[],
): Promise<void> {
  if (rows.length > 0) await gateway.insertFixtureSquadMembers(rows);
  await gateway.insertFixtureSquadFetchedMarker(fixtureId);
}

/**
 * @param leagueSeasonFromMapping — When the caller already knows league + season (e.g. from `fixture_mappings`), pass it so rows are labeled even if `/fixtures` omits `league`.
 */
export async function syncFixtureSquadMembers(
  fixtureId: number,
  gateway: SupabaseGateway,
  env: Env,
  leagueSeasonFromMapping?: { api_football_league_id: number; season: number },
): Promise<{ message: string }> {
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    throw new HttpError(400, "fixtureId is required and must be a positive integer");
  }

  if (await gateway.hasFixtureSquadMembersForFixture(fixtureId)) {
    return { message: SUCCESS_MESSAGE };
  }
  if (await gateway.hasFixtureSquadFetched(fixtureId)) {
    return { message: SUCCESS_MESSAGE };
  }

  if (!env.API_FOOTBALL_KEY) {
    throw new HttpError(500, "API_FOOTBALL_KEY is not configured");
  }

  const api = new ApiFootballClient(env.API_FOOTBALL_KEY);
  const item = await loadMergedFixtureItem(api, fixtureId);
  if (item == null) {
    throw new HttpError(404, "Fixture not found from API-Football");
  }

  const extracted = extractFixtureSquadRows(item);
  const fromApiLeague = extractFixtureLeagueSeason(item);
  const mappingScope: FixtureLeagueSeason | undefined =
    leagueSeasonFromMapping &&
    leagueSeasonFromMapping.api_football_league_id > 0 &&
    leagueSeasonFromMapping.season > 0
      ? {
          api_football_league_id: leagueSeasonFromMapping.api_football_league_id,
          season: leagueSeasonFromMapping.season,
        }
      : undefined;
  const { api_football_league_id, season } = resolveLeagueSeason(mappingScope, fromApiLeague);

  const dbRows = await buildFixtureSquadMemberInserts(
    extracted,
    fixtureId,
    api_football_league_id,
    season,
    gateway,
  );
  await persistAfterApiFetch(gateway, fixtureId, dbRows);
  return { message: SUCCESS_MESSAGE };
}

type BatchOpts = { fixtureIds: number[]; leagueId: number; season: number };

async function runFixtureSquadBatchJob(
  opts: BatchOpts,
  gateway: SupabaseGateway,
  env: Env,
  log: AppLogger,
): Promise<void> {
  if (!env.API_FOOTBALL_KEY) {
    log.error("fixture squad batch: API_FOOTBALL_KEY missing");
    return;
  }

  const unique = [...new Set(opts.fixtureIds.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n > 0))];
  const { leagueId, season } = opts;
  if (!Number.isFinite(leagueId) || leagueId <= 0 || !Number.isFinite(season) || season <= 0) {
    log.error({ leagueId, season }, "fixture squad batch: invalid league or season");
    return;
  }

  const api = new ApiFootballClient(env.API_FOOTBALL_KEY);
  let apiCalls = 0;

  for (const fixtureId of unique) {
    try {
      if (await gateway.hasFixtureSquadMembersForFixture(fixtureId)) continue;
      if (await gateway.hasFixtureSquadFetched(fixtureId)) continue;

      if (apiCalls > 0) await sleep(API_SPACING_MS);

      const item = await loadMergedFixtureItem(api, fixtureId);
      apiCalls += 1;

      if (item == null) {
        log.warn({ fixtureId }, "fixture squad batch: fixture not found from API");
        await gateway.insertFixtureSquadFetchedMarker(fixtureId);
        continue;
      }

      const extracted = extractFixtureSquadRows(item);
      const dbRows = await buildFixtureSquadMemberInserts(
        extracted,
        fixtureId,
        leagueId,
        season,
        gateway,
      );
      await persistAfterApiFetch(gateway, fixtureId, dbRows);
    } catch (e) {
      log.error({ err: e, fixtureId }, "fixture squad batch: fixture failed");
    }
  }
}

/** Fire-and-forget background processing (3s between upstream API calls). */
export function startFixtureSquadBackgroundBatch(opts: BatchOpts, gateway: SupabaseGateway, env: Env, log: AppLogger): void {
  void runFixtureSquadBatchJob(opts, gateway, env, log).catch((e) => {
    log.error({ err: e }, "fixture squad batch job crashed");
  });
}
