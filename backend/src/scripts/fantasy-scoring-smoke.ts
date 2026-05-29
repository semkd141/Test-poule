import "dotenv/config";

import { ApiFootballClient } from "../services/api-football-client.js";
import {
  extractFantasyPlayerDeltas,
  statFieldKeysFromPlayerGroups,
} from "../services/fantasy-stat-parser.js";

const key = process.env.API_FOOTBALL_KEY?.trim();
if (!key) {
  throw new Error("API_FOOTBALL_KEY is required for the fantasy scoring smoke test");
}

const api = new ApiFootballClient(key, 6500);
const fixtureLimit = Math.max(1, Math.min(5, Math.floor(Number(process.env.SMOKE_FIXTURE_LIMIT)) || 3));
const fixtureIds = process.argv
  .slice(2)
  .map((v) => Math.floor(Number(v)))
  .filter((v) => Number.isFinite(v) && v > 0);

const requiredFields = [
  "cards.red",
  "cards.yellow",
  "games.minutes",
  "games.position",
  "goals.assists",
  "goals.conceded",
  "goals.total",
  "penalty.missed",
  "penalty.saved",
  "penalty.scored",
];

const fixtures = [];
if (fixtureIds.length > 0) {
  for (const id of fixtureIds) {
    fixtures.push(await api.getFixtureById(id));
  }
} else {
  fixtures.push(
    ...(await api.getFixturesByLeagueSeason(1, 2022))
      .filter((f) => ["FT", "AET", "PEN"].includes(String(f.fixture.status?.short ?? "")))
      .slice(0, fixtureLimit),
  );
}

const summaries = [];
for (const fixture of fixtures) {
  if (!fixture) continue;
  const groups = await api.getFixturePlayerGroupsByFixtureId(fixture.fixture.id);
  const events = await api.getFixtureEventsByFixtureId(fixture.fixture.id);
  const deltas = extractFantasyPlayerDeltas(groups, {
    [fixture.teams.home.name]: Math.floor(Number(fixture.goals.away)) || 0,
    [fixture.teams.away.name]: Math.floor(Number(fixture.goals.home)) || 0,
  });
  const statFields = statFieldKeysFromPlayerGroups(groups);
  const missing = requiredFields.filter((field) => !statFields.includes(field));
  if (groups.length === 0 || deltas.length === 0 || missing.length > 0) {
    throw new Error(
      `Fixture ${fixture.fixture.id} failed smoke requirements: groups=${groups.length}, deltas=${deltas.length}, missing=${missing.join(",")}`,
    );
  }
  if (fixture.fixture.id === 855736) {
    const valencia = deltas.find((d) => d.playerId === 35533);
    const qatarCleanSheet = deltas.some(
      (d) => d.teamName === "Qatar" && d.breakdown.some((b) => b.key === "cleanSheet"),
    );
    if (!valencia || valencia.totalPoints !== 10 || qatarCleanSheet) {
      throw new Error("Known fixture 855736 scoring assertion failed");
    }
  }
  const nonZero = deltas
    .filter((d) => d.totalPoints !== 0)
    .sort((a, b) => Math.abs(b.totalPoints) - Math.abs(a.totalPoints))
    .slice(0, 8)
    .map((d) => ({
      playerId: d.playerId,
      playerName: d.playerName,
      teamName: d.teamName,
      position: d.position,
      minutes: d.minutes,
      totalPoints: d.totalPoints,
      breakdown: d.breakdown,
    }));

  summaries.push({
    fixtureId: fixture.fixture.id,
    fixture: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
    status: fixture.fixture.status?.short ?? "",
    playerGroups: groups.length,
    playerRows: deltas.length,
    statFields,
    eventTypes: [...new Set(events.map((e) => {
      const row = e && typeof e === "object" && !Array.isArray(e) ? e as Record<string, unknown> : {};
      return `${String(row.type ?? "")}:${String(row.detail ?? "")}`;
    }))].sort(),
    nonZeroPlayerDeltas: nonZero,
  });
}

console.log(JSON.stringify({ ok: true, fixturesChecked: summaries.length, summaries }, null, 2));
