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
export function extractFixtureLeagueSeason(item: unknown): FixtureLeagueSeason {
  const root = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
  const league = root.league;
  if (!league || typeof league !== "object" || Array.isArray(league)) {
    return { api_football_league_id: null, season: null };
  }
  const L = league as Record<string, unknown>;
  const lid = Number(L.id);
  const seasonN = L.season != null ? Number(L.season) : NaN;
  return {
    api_football_league_id: Number.isFinite(lid) && lid > 0 ? Math.floor(lid) : null,
    season: Number.isFinite(seasonN) && seasonN > 0 ? Math.floor(seasonN) : null,
  };
}

function numId(id: unknown): number | null {
  if (id === null || id === undefined) return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

type MapRow = {
  name: string | null;
  team: string | null;
  playerId: number | null;
  pos: string | null;
};

function upsert(
  map: Map<string, MapRow>,
  kind: "p" | "c",
  id: number | null,
  row: MapRow,
): void {
  const key = id != null ? `${kind}:${id}` : `${kind}:noid:${row.name ?? ""}:${row.team ?? ""}`;
  if (map.has(key)) return;
  map.set(key, row);
}

/**
 * @param item — one element of API-Football `GET /fixtures` `response[]`
 */
export function extractFixtureSquadRows(item: unknown): FixtureSquadExtractRow[] {
  const map = new Map<string, MapRow>();

  const root = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};

  const lineups = Array.isArray(root.lineups) ? root.lineups : [];
  for (const lu of lineups) {
    const luObj = lu && typeof lu === "object" && !Array.isArray(lu) ? (lu as Record<string, unknown>) : {};
    const team =
      luObj.team != null && typeof luObj.team === "object" && !Array.isArray(luObj.team)
        ? String((luObj.team as Record<string, unknown>).name ?? "") || null
        : null;

    const coach = luObj.coach;
    if (coach && typeof coach === "object" && !Array.isArray(coach)) {
      const c = coach as Record<string, unknown>;
      if (c.name != null || c.id != null) {
        upsert(map, "c", numId(c.id), {
          name: c.name != null ? String(c.name) : null,
          team,
          playerId: numId(c.id),
          pos: "Coach",
        });
      }
    }

    const fromList = (list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const cell of list) {
        const cellObj = cell && typeof cell === "object" && !Array.isArray(cell) ? (cell as Record<string, unknown>) : {};
        const p = cellObj.player;
        if (!p || typeof p !== "object" || Array.isArray(p)) continue;
        const pl = p as Record<string, unknown>;
        const pid = numId(pl.id);
        if (pid === null && pl.name == null) continue;
        upsert(map, "p", pid, {
          name: pl.name != null ? String(pl.name) : null,
          team,
          playerId: pid,
          pos: pl.pos != null ? String(pl.pos) : null,
        });
      }
    };
    fromList(luObj.startXI);
    fromList(luObj.substitutes);
  }

  const groups = Array.isArray(root.players) ? root.players : [];
  for (const g of groups) {
    const gObj = g && typeof g === "object" && !Array.isArray(g) ? (g as Record<string, unknown>) : {};
    const team =
      gObj.team != null && typeof gObj.team === "object" && !Array.isArray(gObj.team)
        ? String((gObj.team as Record<string, unknown>).name ?? "") || null
        : null;
    const plist = gObj.players;
    if (!Array.isArray(plist)) continue;

    for (const row of plist) {
      const rowObj = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      const p = rowObj.player;
      if (!p || typeof p !== "object" || Array.isArray(p)) continue;
      const pl = p as Record<string, unknown>;
      const statsArr = rowObj.statistics;
      const stats =
        Array.isArray(statsArr) && statsArr[0] && typeof statsArr[0] === "object" && !Array.isArray(statsArr[0])
          ? (statsArr[0] as Record<string, unknown>)
          : null;
      const games = stats?.games && typeof stats.games === "object" && !Array.isArray(stats.games)
        ? (stats.games as Record<string, unknown>)
        : null;
      const pos = games?.position != null ? String(games.position) : null;
      const pid = numId(pl.id);
      if (pid === null && pl.name == null) continue;
      upsert(map, "p", pid, {
        name: pl.name != null ? String(pl.name) : null,
        team,
        playerId: pid,
        pos,
      });
    }
  }

  return [...map.values()];
}
