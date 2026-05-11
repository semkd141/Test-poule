import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "./supabase-gateway.js";
import { ApiFootballClient } from "./api-football-client.js";
import { extractFixtureSquadRows } from "./fixture-squad-extract.js";
import { HttpError } from "../shared/http-error.js";

const SUCCESS_MESSAGE = "players with this fixture fetched";

export async function syncFixtureSquadMembers(
  fixtureId: number,
  gateway: SupabaseGateway,
  env: Env,
): Promise<{ message: string }> {
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    throw new HttpError(400, "fixtureId is required and must be a positive integer");
  }

  if (await gateway.hasFixtureSquadFetched(fixtureId)) {
    return { message: SUCCESS_MESSAGE };
  }

  if (!env.API_FOOTBALL_KEY) {
    throw new HttpError(500, "API_FOOTBALL_KEY is not configured");
  }

  const api = new ApiFootballClient(env.API_FOOTBALL_KEY);
  const raw = await api.getFixtureResponseItemById(fixtureId);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(404, "Fixture not found from API-Football");
  }

  const rawObj = raw as Record<string, unknown>;
  let item: unknown = raw;
  const existingPlayers = rawObj.players;
  if (!Array.isArray(existingPlayers) || existingPlayers.length === 0) {
    const extra = await api.getFixturePlayerGroupsByFixtureId(fixtureId);
    if (Array.isArray(extra) && extra.length > 0) {
      item = { ...rawObj, players: extra };
    }
  }

  const extracted = extractFixtureSquadRows(item);
  const countriesAlready = await gateway.listFixtureSquadMemberCountries();

  const toInsert = extracted.filter((r) => {
    const c = r.country?.trim();
    if (!c) return true;
    return !countriesAlready.has(c);
  });

  const dbRows = toInsert
    .filter((r) => r.playerId != null)
    .map((r) => ({
      fixture_id: fixtureId,
      name: r.name,
      country: r.country?.trim() || null,
      player_id: r.playerId as number,
      pos: r.pos,
    }));

  if (dbRows.length > 0) {
    await gateway.insertFixtureSquadMembers(dbRows);
  }

  await gateway.insertFixtureSquadFetchedMarker(fixtureId);
  return { message: SUCCESS_MESSAGE };
}
