/**
 * Map API-Football v3 /fixtures responses → `fixture_mappings` row shape.
 * @see https://www.api-football.com/documentation-v3#tag/Fixtures
 */
import axios, { type AxiosInstance } from "axios";

const API_BASE = "https://v3.football.api-sports.io";

export type ApiFootballFixtureItem = {
  fixture?: {
    id?: number;
    date?: string;
    timestamp?: number;
    venue?: { name?: string | null };
  };
  league?: { round?: string | null };
  teams?: {
    home?: { name?: string | null };
    away?: { name?: string | null };
  };
};

export type FixtureMappingInsertRow = {
  api_football_league_id: number;
  season: number;
  local_key: string;
  api_fixture_id: number;
  stage: string;
  kickoff_at: string | null;
  team_1: string | null;
  team_2: string | null;
  location: string | null;
};

type InternalRow = {
  _bucket: string;
  _kickoff: number;
  api_football_league_id: number;
  season: number;
  api_fixture_id: number;
  stage: string;
  kickoff_at: string | null;
  team_1: string | null;
  team_2: string | null;
  location: string | null;
  local_key: string | null;
};

/** Map API-Football `league.round` to a bucket for local_key assignment. */
export function roundBucket(round: unknown): string {
  const r = String(round ?? "").toLowerCase();
  if (!r) return "unknown";
  if (r.includes("group stage") || /^group\b/.test(r)) return "group";
  if (
    r.includes("round of 16") ||
    r.includes("16th finals") ||
    /\bl\s*\/\s*16\b/.test(r)
  )
    return "r16";
  if (r.includes("quarter") || /\bqf\b/.test(r)) return "qr";
  if (r.includes("semi")) return "sf";
  if (r.includes("3rd place") || r.includes("third place")) return "tp";
  if (/^final\b/.test(r) || r.trim() === "final") return "final";
  return "unknown";
}

export function stageForBucket(bucket: string): string {
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

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function kickoffUnix(item: ApiFootballFixtureItem): number {
  const ts = item?.fixture?.timestamp;
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  const d = item?.fixture?.date;
  const ms = d ? Date.parse(d) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function extractFixtureRow(
  item: ApiFootballFixtureItem,
  apiFootballLeagueId: number,
  season: number,
): InternalRow | null {
  const fixture = item?.fixture ?? {};
  const league = item?.league ?? {};
  const teams = item?.teams ?? {};
  const home = teams?.home?.name ?? null;
  const away = teams?.away?.name ?? null;
  const location =
    fixture?.venue?.name !== undefined && fixture?.venue?.name !== null
      ? String(fixture.venue.name)
      : null;
  const apiId = fixture.id;
  if (typeof apiId !== "number" || !Number.isFinite(apiId) || apiId <= 0) return null;
  const bucket = roundBucket(league.round);
  const dateRaw = fixture.date;
  const kickoff_at =
    typeof dateRaw === "string" && dateRaw.trim() ? dateRaw.trim() : null;
  return {
    _bucket: bucket,
    _kickoff: kickoffUnix(item),
    api_football_league_id: apiFootballLeagueId,
    season,
    api_fixture_id: apiId,
    stage: stageForBucket(bucket),
    kickoff_at,
    team_1: home !== null ? String(home) : null,
    team_2: away !== null ? String(away) : null,
    location,
    local_key: null,
  };
}

export function assignLocalKeys(rows: InternalRow[]): FixtureMappingInsertRow[] {
  const order = ["group", "r16", "qr", "sf", "tp", "final", "unknown"] as const;
  const counters: Record<string, number> = Object.fromEntries(order.map((b) => [b, 0]));

  const byBucket: Record<string, InternalRow[]> = {};
  for (const b of order) byBucket[b] = [];

  for (const row of rows) {
    const b = row._bucket ?? "unknown";
    if (!byBucket[b]) byBucket[b] = [];
    byBucket[b]!.push(row);
  }

  for (const b of order) {
    const list = byBucket[b] ?? [];
    list.sort(
      (a, c) =>
        a._kickoff - c._kickoff || (a.api_fixture_id ?? 0) - (c.api_fixture_id ?? 0),
    );

    if (b === "final") {
      for (const row of list) {
        counters.final = (counters.final ?? 0) + 1;
        row.local_key = `f-${pad2(counters.final)}`;
      }
      continue;
    }

    let prefix: string;
    if (b === "group") prefix = "gm";
    else if (b === "r16") prefix = "r16";
    else if (b === "qr") prefix = "qr";
    else if (b === "sf") prefix = "sf";
    else if (b === "tp") prefix = "tp";
    else prefix = "unk";

    for (const row of list) {
      counters[b] = (counters[b] ?? 0) + 1;
      row.local_key = `${prefix}-${pad3(counters[b] ?? 0)}`;
    }
  }

  return rows.map((row) => {
    const { _bucket, _kickoff, ...rest } = row;
    const lk = rest.local_key;
    if (!lk) throw new Error("assignLocalKeys: missing local_key");
    return {
      api_football_league_id: rest.api_football_league_id,
      season: rest.season,
      local_key: lk,
      api_fixture_id: rest.api_fixture_id,
      stage: rest.stage,
      kickoff_at: rest.kickoff_at,
      team_1: rest.team_1,
      team_2: rest.team_2,
      location: rest.location,
    };
  });
}

export function mapApiResponseToFixtureRows(
  items: ApiFootballFixtureItem[],
  apiFootballLeagueId: number,
  season: number,
): FixtureMappingInsertRow[] {
  const internal: InternalRow[] = [];
  for (const item of items) {
    const row = extractFixtureRow(item, apiFootballLeagueId, season);
    if (row) internal.push(row);
  }
  return assignLocalKeys(internal);
}

export type FetchFixturesParams = {
  apiKey: string;
  league: number;
  season: number;
  /** @default axios default timeout */
  timeoutMs?: number;
};

type FixturesEnvelope = {
  response?: unknown;
  paging?: { total?: number; current?: number };
  errors?: unknown;
  results?: number;
};

function throwIfNonEmptyErrors(data: FixturesEnvelope): void {
  const err = data?.errors;
  const hasErr =
    err != null &&
    (Array.isArray(err)
      ? err.length > 0
      : typeof err === "object" && Object.keys(err as object).length > 0);
  if (hasErr) throw new Error(`API-Football: ${JSON.stringify(err)}`);
}

/**
 * Load every fixture for league + season from API-Football (v3), then return one combined array.
 * First request uses only `league` + `season` (same as test-api.js). Extra pages are fetched in parallel.
 * Callers should map + persist to Supabase in one batch afterward.
 */
export async function fetchAllFixturesFromApiFootball(
  params: FetchFixturesParams,
): Promise<ApiFootballFixtureItem[]> {
  const { apiKey, league, season, timeoutMs = 120_000 } = params;
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) throw new Error("API-Football key is empty");

  const client: AxiosInstance = axios.create({
    baseURL: API_BASE,
    timeout: timeoutMs,
    headers: { "x-apisports-key": key },
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const first = await client.get<FixturesEnvelope>("/fixtures", {
    params: { league, season },
  });
  const d0 = first.data;
  const chunk0 = Array.isArray(d0?.response) ? (d0.response as ApiFootballFixtureItem[]) : [];

  if (chunk0.length === 0) {
    throwIfNonEmptyErrors(d0);
    return [];
  }

  const totalRaw = d0?.paging?.total;
  const totalPages =
    typeof totalRaw === "number" && Number.isFinite(totalRaw) && totalRaw > 0
      ? Math.floor(totalRaw)
      : 1;

  if (totalPages <= 1) {
    return chunk0;
  }

  const extraPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      client.get<FixturesEnvelope>("/fixtures", {
        params: { league, season, page: i + 2 },
      }),
    ),
  );

  const all = [...chunk0];
  for (const res of extraPages) {
    const d = res.data;
    throwIfNonEmptyErrors(d);
    const chunk = Array.isArray(d?.response) ? (d.response as ApiFootballFixtureItem[]) : [];
    all.push(...chunk);
  }

  return all;
}
