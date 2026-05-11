/**
 * Slim fixture + player rows from API-Football v3 /fixtures response (see test-api2.js).
 */

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type SlimPlayerRow = {
  land: string | null;
  spelerNaam: string | null;
  punten: number;
};

/**
 * `players`: [ { team, players: [ { player, statistics: [ { goals, penalty } ] } ] } ]
 */
export function extractPlayersFromApiFixtureItem(item: unknown): SlimPlayerRow[] {
  const out: SlimPlayerRow[] = [];
  const obj = item as { players?: unknown };
  const groups = obj.players;
  if (!Array.isArray(groups)) return out;

  for (const g of groups) {
    const grp = g as { team?: { name?: unknown }; players?: unknown };
    const land = grp.team?.name != null ? String(grp.team.name) : null;
    const plist = grp.players;
    if (!Array.isArray(plist)) continue;

    for (const row of plist) {
      const r = row as {
        player?: { name?: unknown };
        statistics?: unknown[];
      };
      const spelerNaam = r.player?.name != null ? String(r.player.name) : null;
      const stats = Array.isArray(r.statistics) ? r.statistics[0] : null;
      const st = stats as { goals?: { total?: unknown }; penalty?: { scored?: unknown } } | null;
      const gstat = st?.goals ?? {};
      let punten = numOrNull((gstat as { total?: unknown }).total) ?? 0;
      const penScored = numOrNull(st?.penalty?.scored) ?? 0;
      if (penScored > 0) punten += penScored;

      out.push({
        land,
        spelerNaam,
        punten,
      });
    }
  }

  return out;
}

/**
 * `/fixtures/players` returns `response` as an array of `{ team, players }` — same shape as `item.players`
 * on a full `/fixtures` row when present.
 */
export function extractPlayersFromFixturePlayersEndpoint(response: unknown): SlimPlayerRow[] {
  if (!Array.isArray(response)) return [];
  return extractPlayersFromApiFixtureItem({ players: response });
}

/** Build `matches` upsert body from raw API-Football fixture item. */
export function matchUpsertBodyFromApiFixtureItem(
  competitionId: number,
  item: unknown,
): Record<string, unknown> {
  const obj = item as Record<string, unknown>;
  const fx = (obj.fixture as Record<string, unknown>) ?? {};
  const league = (obj.league as Record<string, unknown>) ?? {};
  const teams = (obj.teams as Record<string, unknown>) ?? {};
  const home = (teams.home as Record<string, unknown>) ?? {};
  const away = (teams.away as Record<string, unknown>) ?? {};
  const goals = (obj.goals as Record<string, unknown>) ?? {};
  const score = (obj.score as Record<string, unknown>) ?? {};
  const ft = (score.fulltime as Record<string, unknown>) ?? {};
  const statusObj = fx.status as Record<string, unknown> | undefined;

  const homeGoals = numOrNull(goals.home) ?? numOrNull(ft.home);
  const awayGoals = numOrNull(goals.away) ?? numOrNull(ft.away);
  const fid = numOrNull(fx.id);
  if (fid == null) {
    throw new Error("API-Football fixture payload missing fixture.id");
  }

  const statusShort = statusObj?.short != null ? String(statusObj.short) : "";
  const statusLong = statusObj?.long != null ? String(statusObj.long) : "";
  const status = statusShort || statusLong || "NS";

  const kick =
    fx.date != null && String(fx.date).trim() ? String(fx.date) : new Date().toISOString();

  return {
    competition_id: competitionId,
    external_fixture_id: fid,
    status,
    round: league.round != null ? String(league.round) : null,
    kickoff_at: kick,
    home_team: home.name != null && String(home.name).trim() ? String(home.name) : "—",
    away_team: away.name != null && String(away.name).trim() ? String(away.name) : "—",
    home_goals: homeGoals,
    away_goals: awayGoals,
    payload: item,
    synced_at: new Date().toISOString(),
  };
}

export function playerStatisticsRowsFromSlim(
  fixtureId: number,
  slimPlayers: SlimPlayerRow[],
): Array<{ fixture_id: number; land: string; speler_naam: string; punten: number }> {
  const out: Array<{ fixture_id: number; land: string; speler_naam: string; punten: number }> = [];
  for (const p of slimPlayers) {
    const land = p.land != null && String(p.land).trim() ? String(p.land).trim() : "";
    const name = p.spelerNaam != null && String(p.spelerNaam).trim() ? String(p.spelerNaam).trim() : "";
    if (!land || !name) continue;
    out.push({
      fixture_id: fixtureId,
      land,
      speler_naam: name,
      punten: Number.isFinite(Number(p.punten)) ? Math.floor(Number(p.punten)) : 0,
    });
  }
  return out;
}
