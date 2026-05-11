/**
 * Read backend/fixture.json and build a flat list of squad members:
 * name, country (national team name), playerId, pos — including coaches.
 *
 *   node test-api3.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @param {number | null | undefined} id */
function numId(id) {
  if (id === null || id === undefined) return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Map<string, { name: string | null, country: string | null, playerId: number | null, pos: string | null }>} map
 * @param {"p"|"c"} kind
 * @param {number | null} id
 * @param {{ name: string | null, country: string | null, playerId: number | null, pos: string | null }} row
 */
function upsert(map, kind, id, row) {
  const key = id != null ? `${kind}:${id}` : `${kind}:noid:${row.name ?? ""}:${row.country ?? ""}`;
  if (map.has(key)) return;
  map.set(key, row);
}

/**
 * @param {unknown} item — one element of API `response[]`
 */
function collectFromFixture(item) {
  /** @type {Map<string, { name: string | null, country: string | null, playerId: number | null, pos: string | null }>} */
  const map = new Map();

  const lineups = Array.isArray(item?.lineups) ? item.lineups : [];
  for (const lu of lineups) {
    const country = lu?.team?.name != null ? String(lu.team.name) : null;

    const coach = lu?.coach;
    if (coach && (coach.name != null || coach.id != null)) {
      upsert(map, "c", numId(coach.id), {
        name: coach.name != null ? String(coach.name) : null,
        country,
        playerId: numId(coach.id),
        pos: "Coach",
      });
    }

    const fromList = (list) => {
      if (!Array.isArray(list)) return;
      for (const cell of list) {
        const p = cell?.player;
        if (!p) continue;
        const pid = numId(p.id);
        if (pid === null && p.name == null) continue;
        upsert(map, "p", pid, {
          name: p.name != null ? String(p.name) : null,
          country,
          playerId: pid,
          pos: p.pos != null ? String(p.pos) : null,
        });
      }
    };
    fromList(lu.startXI);
    fromList(lu.substitutes);
  }

  const groups = Array.isArray(item?.players) ? item.players : [];
  for (const g of groups) {
    const country = g?.team?.name != null ? String(g.team.name) : null;
    const plist = g?.players;
    if (!Array.isArray(plist)) continue;

    for (const row of plist) {
      const p = row?.player;
      const stats = Array.isArray(row?.statistics) ? row.statistics[0] : null;
      const pos =
        stats?.games?.position != null ? String(stats.games.position) : null;
      const pid = numId(p?.id);
      if (pid === null && p?.name == null) continue;
      upsert(map, "p", pid, {
        name: p?.name != null ? String(p.name) : null,
        country,
        playerId: pid,
        pos,
      });
    }
  }

  return [...map.values()];
}

const raw = readFileSync(join(__dirname, "fixture.json"), "utf8");
const data = JSON.parse(raw);
const fixtures = Array.isArray(data?.response) ? data.response : [];

const rows = [];
for (const item of fixtures) {
  rows.push(...collectFromFixture(item));
}

console.log(JSON.stringify(rows, null, 2));
