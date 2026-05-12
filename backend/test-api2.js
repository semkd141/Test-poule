/**
 * API-Football v3 — slim fixture + derived scoring-style results.
 *
 * GET /fixtures?id=… (or league+season for many)
 * https://www.api-football.com/documentation-v3#tag/Fixtures/operation/get-fixtures
 *
 * Output includes:
 *   - Match won / Draw (by team name from API, same as `teams.*.name`)
 *   - Goals, assists (from `events` + player `statistics`)
 *   - Clean sheet (GK/D with minutes when that side conceded 0 in fulltime)
 *   - Penalty saved (player stats)
 *   - Own goal (event detail)
 *   - Yellow / direct red / second-yellow red (from `events` + stats)
 *   - Substitutions (from `events` type `subst`)
 *
 * USE_FIXTURE_JSON=1 reads backend/fixture.json (same shape as live API).
 */
import axios from "axios";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const base = "https://v3.football.api-sports.io";

const apiFootballKey = process.env.API_FOOTBALL_KEY?.trim() ?? "";
const headers = {
  "x-apisports-key": apiFootballKey,
};

/** Set to a fixture id, or use USE_FIXTURE_JSON=1 to read backend/fixture.json */
function parseFixtureId() {
  const env = numOrNull(process.env.FIXTURE_ID);
  if (env) return env;
  const argv = process.argv.slice(2);
  const idx = argv.findIndex((a) => a === "--id" || a === "-i");
  if (idx >= 0) return numOrNull(argv[idx + 1]);
  const positional = numOrNull(argv[0]);
  return positional || 946769;
}

const FIXTURE_ID = parseFixtureId();

const USE_FIXTURE_JSON = process.env.USE_FIXTURE_JSON === "1";

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
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
    scoring_results: deriveScoringResults(item),
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

/** Goals conceded on a player's statistics row (API-Football: team goals against while they were on pitch, approx). */
function statGoalsConceded(stats) {
  const g = stats?.goals ?? {};
  return numOrNull(g.conceded) ?? 0;
}

function statPosition(stats) {
  return str(stats?.games?.position);
}

function statMinutes(stats) {
  return numOrNull(stats?.games?.minutes) ?? 0;
}

/**
 * Match won (country) / Draw — uses `teams.home` / `teams.away` winner flags and goals.
 */
function deriveMatchOutcome(item) {
  const teams = item?.teams ?? {};
  const home = teams.home ?? {};
  const away = teams.away ?? {};
  const goals = item?.goals ?? {};
  const ft = item?.score?.fulltime ?? {};
  const hg = numOrNull(goals.home) ?? numOrNull(ft.home);
  const ag = numOrNull(goals.away) ?? numOrNull(ft.away);
  const homeName = str(home.name);
  const awayName = str(away.name);

  const winHome = home.winner === true;
  const winAway = away.winner === true;

  const match_won = [];
  if (winHome && homeName) match_won.push({ country: homeName, side: "home" });
  if (winAway && awayName) match_won.push({ country: awayName, side: "away" });

  let draw = false;
  if (!winHome && !winAway && hg !== null && ag !== null && hg === ag) draw = true;

  return {
    home_team: homeName,
    away_team: awayName,
    home_goals: hg,
    away_goals: ag,
    match_won,
    draw: draw ? { home_team: homeName, away_team: awayName, goals_home: hg, goals_away: ag } : null,
  };
}

/**
 * Parse `events[]`: goals (incl. own goal), assists on goal, cards, substitutions.
 */
function deriveFromEvents(item) {
  const events = Array.isArray(item?.events) ? item.events : [];
  /** @type {Array<{ type: string; country: string | null; player: string | null; minute: number | null; detail: string | null; assist: string | null }>} */
  const goals = [];
  const assists = [];
  const own_goals = [];
  const yellow_cards = [];
  const direct_red_cards = [];
  const second_yellow_red = [];
  const substitutions = [];

  const yellowByPlayer = new Map();

  for (const ev of events) {
    const minute = numOrNull(ev?.time?.elapsed);
    const country = str(ev?.team?.name);
    const player = str(ev?.player?.name);
    const assist = str(ev?.assist?.name);
    const type = str(ev?.type);
    const detail = str(ev?.detail);

    if (type === "Goal") {
      goals.push({ country, player, minute, detail });
      if (assist) assists.push({ country, player: assist, minute, for_goal_by: player, detail: "assist_on_goal" });
      const d = (detail || "").toLowerCase();
      if (d.includes("own goal")) own_goals.push({ country, player, minute, detail });
    }

    if (type === "Card") {
      const d = (detail || "").toLowerCase();
      if (d.includes("yellow")) {
        yellow_cards.push({ country, player, minute, detail });
        if (player) {
          const k = `${country || ""}|${player}`;
          yellowByPlayer.set(k, (yellowByPlayer.get(k) || 0) + 1);
        }
      } else if (d.includes("red")) {
        if (d.includes("second") || d.includes("2nd")) {
          second_yellow_red.push({ country, player, minute, detail });
        } else {
          direct_red_cards.push({ country, player, minute, detail });
        }
      }
    }

    if (type === "subst" || (type && type.toLowerCase() === "substitution")) {
      substitutions.push({
        country,
        player_out: player,
        player_in: assist,
        minute,
        detail,
      });
    }
  }

  /** Infer second yellow from two yellows same player (when API does not emit a dedicated second-yellow event). */
  for (const [k, count] of yellowByPlayer) {
    if (count >= 2) {
      const pipe = k.indexOf("|");
      const country = pipe >= 0 ? k.slice(0, pipe) : null;
      const player = pipe >= 0 ? k.slice(pipe + 1) : k;
      if (!second_yellow_red.some((r) => r.player === player && r.country === country)) {
        second_yellow_red.push({
          country,
          player,
          minute: null,
          detail: "inferred_from_two_yellow_cards_in_events",
        });
      }
    }
  }

  return {
    goals,
    assists,
    own_goals,
    yellow_cards,
    direct_red_cards,
    second_yellow_red,
    substitutions,
  };
}

/**
 * Per-player rows from statistics: goals, assists, saves, cards, clean-sheet eligibility.
 */
function deriveFromPlayerStatistics(item, outcome) {
  const homeName = outcome.home_team;
  const awayName = outcome.away_team;
  const hg = outcome.home_goals ?? 0;
  const ag = outcome.away_goals ?? 0;

  /** Goals conceded by the *team* (full match scoreline). */
  function teamConceded(teamName) {
    if (!teamName) return null;
    if (homeName && teamName === homeName) return ag;
    if (awayName && teamName === awayName) return hg;
    return null;
  }

  const penalties_saved = [];
  const clean_sheets = [];
  const player_rows = [];

  const groups = item?.players;
  if (!Array.isArray(groups)) {
    return { penalties_saved, clean_sheets, player_rows };
  }

  for (const g of groups) {
    const country = str(g?.team?.name);
    const concededTeam = teamConceded(country);
    const plist = g?.players;
    if (!Array.isArray(plist)) continue;

    for (const row of plist) {
      const player = str(row?.player?.name);
      const pid = numOrNull(row?.player?.id);
      const stats = Array.isArray(row?.statistics) ? row.statistics[0] : null;
      if (!stats) continue;

      const pos = statPosition(stats);
      const minutes = statMinutes(stats);
      const gstat = stats.goals ?? {};
      const goalsTotal = numOrNull(gstat.total) ?? 0;
      const assists = numOrNull(gstat.assists) ?? 0;
      const saves = numOrNull(gstat.saves) ?? 0;
      const penSaved = numOrNull(stats.penalty?.saved) ?? 0;
      const yellow = numOrNull(stats.cards?.yellow) ?? 0;
      const red = numOrNull(stats.cards?.red) ?? 0;
      const concededRow = statGoalsConceded(stats);

      if (penSaved > 0) {
        penalties_saved.push({ country, player, penalty_saved: penSaved });
      }

      /** Clean sheet: side conceded 0; player participated; typically GK/D (same as many poule rules). */
      if (concededTeam === 0 && minutes > 0 && (pos === "G" || pos === "D")) {
        clean_sheets.push({ country, player, position: pos, minutes });
      }

      player_rows.push({
        country,
        player,
        player_id: pid,
        position: pos,
        minutes,
        goals: goalsTotal,
        assists,
        saves,
        penalty_saved: penSaved,
        yellow_cards: yellow,
        red_cards: red,
        goals_conceded_stat: concededRow,
      });
    }
  }

  return { penalties_saved, clean_sheets, player_rows };
}

function deriveScoringResults(item) {
  const outcome = deriveMatchOutcome(item);
  const fromEvents = deriveFromEvents(item);
  const fromStats = deriveFromPlayerStatistics(item, outcome);

  return {
    match_outcome: outcome,
    from_events: fromEvents,
    penalties_saved: fromStats.penalties_saved,
    clean_sheets: fromStats.clean_sheets,
    player_statistics_summary: fromStats.player_rows,
  };
}

function runWithPayload(data) {
  const fixtures = Array.isArray(data?.response) ? data.response : [];
  const slim = fixtures.map(slimFixture);
  const payload = slim.length === 1 ? slim[0] : { fixtures: slim };
  console.log(JSON.stringify(payload, null, 2));

  if (!USE_FIXTURE_JSON && slim.length === 0) {
    const errs = Array.isArray(data?.errors) ? data.errors : data?.errors;
    const errStr = errs != null ? JSON.stringify(errs).toLowerCase() : "";
    const lines = [
      "No fixtures returned from API-Football.",
      `Tried fixture id=${FIXTURE_ID}.`,
      !apiFootballKey ? "API_FOOTBALL_KEY is empty — set it in backend/.env (same as the main server)." : null,
      errStr.includes("suspended")
        ? "Your API-Sports / API-Football account is suspended — renew or fix billing at https://dashboard.api-football.com/ (live calls will stay empty until that is resolved)."
        : null,
      "Try:",
      "- USE_FIXTURE_JSON=1 node test-api2.js",
      `- FIXTURE_ID=866683 node test-api2.js   (example id from backend/fixture.json)`,
      "- node test-api2.js --id <fixtureId>",
    ].filter(Boolean);
    console.error(lines.join("\n"));
    if (errs) console.error("API errors:", errs);
  }
}

if (USE_FIXTURE_JSON) {
  const raw = readFileSync(join(__dirname, "fixture.json"), "utf8");
  runWithPayload(JSON.parse(raw));
} else {
  axios({
    method: "get",
    url: `${base}/fixtures`,
    headers,
    params: { id: 855740 },
  })
    .then((res) => runWithPayload(res.data))
    .catch((err) => console.error(err.response?.status, err.response?.data || err.message));
}
