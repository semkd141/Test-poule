/**
 * API-Football v3 — slim fixture + player rows for scoring / imports.
 *
 * GET /fixtures?id=… (or league+season for many)
 * https://www.api-football.com/documentation-v3#tag/Fixtures/operation/get-fixtures
 *
 * If `players` is empty, your plan may omit player stats on this endpoint;
 * try the same fixture id on GET /fixtures/players?fixture={id} or enable
 * expanded fixture responses per API-Football docs.
 */
import axios from "axios";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const base = "https://v3.football.api-sports.io";

const headers = {
  "x-apisports-key": process.env.API_FOOTBALL_KEY?.trim() || "0bef116d289c6e99caa0cb59ae11357e",
};

/** Set to a fixture id, or use USE_FIXTURE_JSON=1 to read backend/fixture.json */
const FIXTURE_ID = 946769;

const USE_FIXTURE_JSON = process.env.USE_FIXTURE_JSON === "1";

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} item — one element of `response[]`
 */
function slimFixture(item) {
  const fixture = item?.fixture ?? {};
  const league = item?.league ?? {};
  const teams = item?.teams ?? {};
  const goals = item?.goals ?? {};
  const ft = item?.score?.fulltime ?? {};

  const homeGoals = numOrNull(goals.home) ?? numOrNull(ft.home);
  const awayGoals = numOrNull(goals.away) ?? numOrNull(ft.away);

  return {
    fixture_id: fixture.id ?? null,
    round: league.round ?? null,
    kickoff_at: fixture.date ?? null,
    home_team: teams.home?.name ?? null,
    away_team: teams.away?.name ?? null,
    status: fixture.status?.long ?? null,
    home_goals: homeGoals,
    away_goals: awayGoals,
    players: extractPlayers(item),
  };
}

/**
 * `players`: [ { team, players: [ { player, statistics: [ { goals, penalty } ] } ] } ]
 */
function extractPlayers(item) {
  const out = [];
  const groups = item?.players;
  if (!Array.isArray(groups)) return out;

  for (const g of groups) {
    const land = g?.team?.name != null ? String(g.team.name) : null;
    const plist = g?.players;
    if (!Array.isArray(plist)) continue;

    for (const row of plist) {
      const spelerNaam = row?.player?.name != null ? String(row.player.name) : null;
      const stats = Array.isArray(row?.statistics) ? row.statistics[0] : null;
      const gstat = stats?.goals ?? {};
      let punten = numOrNull(gstat.total) ?? 0;
      const penScored = numOrNull(stats?.penalty?.scored) ?? 0;
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

function runWithPayload(data) {
  const fixtures = Array.isArray(data?.response) ? data.response : [];
  const slim = fixtures.map(slimFixture);
  const payload = slim.length === 1 ? slim[0] : { fixtures: slim };
  console.log(JSON.stringify(payload, null, 2));
}

if (USE_FIXTURE_JSON) {
  const raw = readFileSync(join(__dirname, "fixture.json"), "utf8");
  runWithPayload(JSON.parse(raw));
} else {
  axios({
    method: "get",
    url: `${base}/fixtures`,
    headers,
    params: { id: FIXTURE_ID },
  })
    .then((res) => runWithPayload(res.data))
    .catch((err) => console.error(err.response?.status, err.response?.data || err.message));
}
