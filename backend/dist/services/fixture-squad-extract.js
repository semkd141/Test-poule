/**
 * Extract squad rows from one API-Football `/fixtures` response element (lineups + optional `players`).
 * Mirrors backend/test-api3.js: coaches included, `pos` = "Coach" for coaches.
 * Team name from `lineups[].team.name` / `players[].team.name` (see backend/fixture.json).
 */
/**
 * Read API-Football league id + season from one `/fixtures` response element (`league.id`, `league.season`).
 */
export function extractFixtureLeagueSeason(item) {
    const root = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const league = root.league;
    if (!league || typeof league !== "object" || Array.isArray(league)) {
        return { api_football_league_id: null, season: null };
    }
    const L = league;
    const lid = Number(L.id);
    const seasonN = L.season != null ? Number(L.season) : NaN;
    return {
        api_football_league_id: Number.isFinite(lid) && lid > 0 ? Math.floor(lid) : null,
        season: Number.isFinite(seasonN) && seasonN > 0 ? Math.floor(seasonN) : null,
    };
}
function numId(id) {
    if (id === null || id === undefined)
        return null;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
}
function upsert(map, kind, id, row) {
    const key = id != null ? `${kind}:${id}` : `${kind}:noid:${row.name ?? ""}:${row.team ?? ""}`;
    if (map.has(key))
        return;
    map.set(key, row);
}
/**
 * @param item — one element of API-Football `GET /fixtures` `response[]`
 */
export function extractFixtureSquadRows(item) {
    const map = new Map();
    const root = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const lineups = Array.isArray(root.lineups) ? root.lineups : [];
    for (const lu of lineups) {
        const luObj = lu && typeof lu === "object" && !Array.isArray(lu) ? lu : {};
        const team = luObj.team != null && typeof luObj.team === "object" && !Array.isArray(luObj.team)
            ? String(luObj.team.name ?? "") || null
            : null;
        const coach = luObj.coach;
        if (coach && typeof coach === "object" && !Array.isArray(coach)) {
            const c = coach;
            if (c.name != null || c.id != null) {
                upsert(map, "c", numId(c.id), {
                    name: c.name != null ? String(c.name) : null,
                    team,
                    playerId: numId(c.id),
                    pos: "Coach",
                });
            }
        }
        const fromList = (list) => {
            if (!Array.isArray(list))
                return;
            for (const cell of list) {
                const cellObj = cell && typeof cell === "object" && !Array.isArray(cell) ? cell : {};
                const p = cellObj.player;
                if (!p || typeof p !== "object" || Array.isArray(p))
                    continue;
                const pl = p;
                const pid = numId(pl.id);
                if (pid === null && pl.name == null)
                    continue;
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
        const gObj = g && typeof g === "object" && !Array.isArray(g) ? g : {};
        const team = gObj.team != null && typeof gObj.team === "object" && !Array.isArray(gObj.team)
            ? String(gObj.team.name ?? "") || null
            : null;
        const plist = gObj.players;
        if (!Array.isArray(plist))
            continue;
        for (const row of plist) {
            const rowObj = row && typeof row === "object" && !Array.isArray(row) ? row : {};
            const p = rowObj.player;
            if (!p || typeof p !== "object" || Array.isArray(p))
                continue;
            const pl = p;
            const statsArr = rowObj.statistics;
            const stats = Array.isArray(statsArr) && statsArr[0] && typeof statsArr[0] === "object" && !Array.isArray(statsArr[0])
                ? statsArr[0]
                : null;
            const games = stats?.games && typeof stats.games === "object" && !Array.isArray(stats.games)
                ? stats.games
                : null;
            const pos = games?.position != null ? String(games.position) : null;
            const pid = numId(pl.id);
            if (pid === null && pl.name == null)
                continue;
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
//# sourceMappingURL=fixture-squad-extract.js.map