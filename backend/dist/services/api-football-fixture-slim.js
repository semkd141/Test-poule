/**
 * Slim fixture + player rows from API-Football v3 /fixtures response (see test-api2.js).
 */
export function numOrNull(v) {
    if (v === null || v === undefined || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
/**
 * `players`: [ { team, players: [ { player, statistics: [ { goals, penalty } ] } ] } ]
 */
export function extractPlayersFromApiFixtureItem(item) {
    const out = [];
    const obj = item;
    const groups = obj.players;
    if (!Array.isArray(groups))
        return out;
    for (const g of groups) {
        const grp = g;
        const land = grp.team?.name != null ? String(grp.team.name) : null;
        const plist = grp.players;
        if (!Array.isArray(plist))
            continue;
        for (const row of plist) {
            const r = row;
            const spelerNaam = r.player?.name != null ? String(r.player.name) : null;
            const playerId = numOrNull(r.player?.id);
            const stats = Array.isArray(r.statistics) ? r.statistics[0] : null;
            const st = stats;
            const gstat = st?.goals ?? {};
            let punten = numOrNull(gstat.total) ?? 0;
            const penScored = numOrNull(st?.penalty?.scored) ?? 0;
            if (penScored > 0)
                punten += penScored;
            out.push({
                land,
                spelerNaam,
                playerId,
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
export function extractPlayersFromFixturePlayersEndpoint(response) {
    if (!Array.isArray(response))
        return [];
    return extractPlayersFromApiFixtureItem({ players: response });
}
/** Build `matches` upsert body from raw API-Football fixture item. */
export function matchUpsertBodyFromApiFixtureItem(competitionId, item) {
    const obj = item;
    const fx = obj.fixture ?? {};
    const league = obj.league ?? {};
    const teams = obj.teams ?? {};
    const home = teams.home ?? {};
    const away = teams.away ?? {};
    const goals = obj.goals ?? {};
    const score = obj.score ?? {};
    const ft = score.fulltime ?? {};
    const statusObj = fx.status;
    const homeGoals = numOrNull(goals.home) ?? numOrNull(ft.home);
    const awayGoals = numOrNull(goals.away) ?? numOrNull(ft.away);
    const fid = numOrNull(fx.id);
    if (fid == null) {
        throw new Error("API-Football fixture payload missing fixture.id");
    }
    const statusShort = statusObj?.short != null ? String(statusObj.short) : "";
    const statusLong = statusObj?.long != null ? String(statusObj.long) : "";
    const status = statusShort || statusLong || "NS";
    const kick = fx.date != null && String(fx.date).trim() ? String(fx.date) : new Date().toISOString();
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
export function playerStatisticsRowsFromSlim(fixtureId, slimPlayers) {
    const out = [];
    for (const p of slimPlayers) {
        const land = p.land != null && String(p.land).trim() ? String(p.land).trim() : "";
        const name = p.spelerNaam != null && String(p.spelerNaam).trim() ? String(p.spelerNaam).trim() : "";
        if (!land || !name)
            continue;
        const pid = p.playerId;
        const player_id = pid != null && Number.isFinite(pid) && pid > 0 ? Math.floor(Number(pid)) : null;
        out.push({
            fixture_id: fixtureId,
            land,
            speler_naam: name,
            player_id,
            punten: Number.isFinite(Number(p.punten)) ? Math.floor(Number(p.punten)) : 0,
        });
    }
    return out;
}
//# sourceMappingURL=api-football-fixture-slim.js.map