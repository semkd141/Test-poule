/**
 * Smoke test: API-Football (v3) fixtures → rows shaped like `fixture_mappings`.
 *
 * https://www.api-football.com/documentation-v3#tag/Fixtures
 */
import axios from "axios";

const COMPETITION_ID = 2;

const base = "https://v3.football.api-sports.io";

const headers = {
  "x-apisports-key": "0bef116d289c6e99caa0cb59ae11357e",
};

const url = `${base}/fixtures`;

const params = {
  league: 1,
  season: 2026,
};

/**
 * Map API-Football `league.round` to a bucket for local_key assignment.
 * Order matters: more specific checks before generic "final".
 */
function roundBucket(round) {
  const r = String(round ?? "").toLowerCase();
  if (!r) return "unknown";
  if (r.includes("group stage") || /^group\b/.test(r)) return "group";
  if (r.includes("round of 16") || r.includes("16th finals") || /\bl\s*\/\s*16\b/.test(r))
    return "r16";
  if (r.includes("quarter") || /\bqf\b/.test(r)) return "qr";
  if (r.includes("semi")) return "sf";
  if (r.includes("3rd place") || r.includes("third place")) return "tp";
  if (/^final\b/.test(r) || r.trim() === "final") return "final";
  return "unknown";
}

/** DB `fixture_mappings.stage` value aligned with bucket (see seed migrations). */
function stageForBucket(bucket) {
  switch (bucket) {
    case "group":
      return "group";
    case "r16":
      return "r16";
    case "qr":
      return "qr";
    case "sf":
      return "sf";
    case "tp":
      return "thirdp";
    case "final":
      return "final";
    default:
      return bucket;
  }
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Build chronological ordering key from fixture root. */
function kickoffUnix(item) {
  const ts = item?.fixture?.timestamp;
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  const d = item?.fixture?.date;
  const ms = d ? Date.parse(d) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

/**
 * From API fixture entry → one mapping row + assign local_key per bucket order.
 */
function extractFixtureRow(item) {
  const fixture = item?.fixture ?? {};
  const league = item?.league ?? {};
  const teams = item?.teams ?? {};
  const home = teams?.home?.name ?? null;
  const away = teams?.away?.name ?? null;
  const location = fixture?.venue?.name ?? null;
  const bucket = roundBucket(league.round);
  return {
    _bucket: bucket,
    _kickoff: kickoffUnix(item),
    competition_id: COMPETITION_ID,
    api_fixture_id: fixture.id ?? null,
    stage: stageForBucket(bucket),
    kickoff_at: fixture.date ?? null,
    team_1: home,
    team_2: away,
    location: location,
    // filled after sort
    local_key: null,
  };
}

/** Assign sequential local_keys: gm-001, r16-001, qr-001, sf-001, tp-001, f-01, unk-001. */
function assignLocalKeys(rows) {
  const order = ["group", "r16", "qr", "sf", "tp", "final", "unknown"];
  const counters = Object.fromEntries(order.map((b) => [b, 0]));

  const byBucket = {};
  for (const b of order) byBucket[b] = [];

  for (const row of rows) {
    const b = row._bucket ?? "unknown";
    (byBucket[b] ?? byBucket.unknown).push(row);
  }

  for (const b of order) {
    const list = byBucket[b] ?? [];
    list.sort((a, c) => a._kickoff - c._kickoff || (a.api_fixture_id ?? 0) - (c.api_fixture_id ?? 0));

    if (b === "final") {
      for (const row of list) {
        counters.final += 1;
        row.local_key = `f-${pad2(counters.final)}`;
      }
      continue;
    }

    let prefix;
    if (b === "group") prefix = "gm";
    else if (b === "r16") prefix = "r16";
    else if (b === "qr") prefix = "qr";
    else if (b === "sf") prefix = "sf";
    else if (b === "tp") prefix = "tp";
    else prefix = "unk";

    for (const row of list) {
      counters[b] += 1;
      row.local_key = `${prefix}-${pad3(counters[b])}`;
    }
  }

  return rows.map((row) => {
    const { _bucket, _kickoff, ...rest } = row;
    return rest;
  });
}

axios({ method: "get", url, headers, params })
  .then((res) => {
    const fixtures = Array.isArray(res.data?.response) ? res.data.response : [];
    const enriched = fixtures.map(extractFixtureRow);
    const mappings = assignLocalKeys(enriched);
    console.log(JSON.stringify({ count: mappings.length, mappings }, null, 2));
  })
  .catch((err) => console.error(err.response?.status, err.response?.data || err.message));

