import { getApiBaseUrl } from "./config";
import { getSupabaseBrowser } from "./supabase-browser";

const jsonHeaders = { "Content-Type": "application/json" };

function apiBase() {
  return getApiBaseUrl().replace(/\/$/, "");
}

async function readErrorBody(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t) as {
      error_description?: string;
      error?: string;
      message?: string;
      msg?: string;
    };
    return (
      j.error_description ||
      j.message ||
      j.msg ||
      j.error ||
      t ||
      r.statusText
    );
  } catch {
    return t.slice(0, 300) || r.statusText;
  }
}

export const AUTH_STORAGE_KEY = "wk26_auth_session";

/** Fired when WK-local auth storage changes so UI (e.g. settings → superadmin) can recompute without full reload. */
export const WK_AUTH_SESSION_EVENT = "wk-auth-session-changed";

/** `{ id, name, slug? }` — shared between Register and My Team */
export const WK_SELECTED_COMPETITION_KEY = "wk_selected_competition";

/** Fired on `window` after {@link writeSelectedCompetition} updates session storage (same tab). */
export const WK_SELECTED_COMPETITION_EVENT = "wk-selected-competition-changed";

export type WkSelectedCompetition = {
  id: number;
  name: string;
  slug?: string;
  /** ISO deadline from `/competitions` when known — used to gate Register per pool. */
  registration_deadline?: string;
  registration_open?: boolean;
};

/** Response from `GET /api/internal/analytics` (superadmin dashboard). */
export type AdminAnalyticsSnapshot = {
  generatedAt: string;
  counts: {
    competitions: number;
    competitionsWithOwner: number;
    competitionsPlatform: number;
    teamsRegistered: number;
    teamsLinkedToAuthUser: number;
    competitionMembers: number;
    invitesTotal: number;
    invitesPending: number;
    invitesAccepted: number;
    fixtureMappings: number;
    matches: number;
    participantScoreEvents: number;
    playerPointsRollupRows: number;
    fixtureSquadMembers: number;
    fixtureSquadFetched: number;
    playerStatisticsRows: number;
    apiFootballLeagueTypes: number;
  };
  topPoolsByTeamCount: Array<{
    competition_id: number;
    team_count: number;
    name: string | null;
    slug: string | null;
    owner_user_id: string | null;
  }>;
  recentTeamRegistrations: Array<{
    id: number;
    competition_id: number;
    email: string | null;
    teamnaam: string | null;
    naam: string | null;
    created_at: string | null;
  }>;
};

export function readSelectedCompetition(): WkSelectedCompetition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WK_SELECTED_COMPETITION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as {
      id?: unknown;
      name?: unknown;
      slug?: unknown;
      registration_deadline?: unknown;
      registration_open?: unknown;
    };
    const id = Number(o.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    const name = typeof o.name === "string" ? o.name : "";
    const slug = typeof o.slug === "string" ? o.slug : undefined;
    const registration_deadline =
      typeof o.registration_deadline === "string" ? o.registration_deadline : undefined;
    const registration_open =
      typeof o.registration_open === "boolean" ? o.registration_open : undefined;
    return { id, name, slug, registration_deadline, registration_open };
  } catch {
    return null;
  }
}

export function writeSelectedCompetition(c: WkSelectedCompetition): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WK_SELECTED_COMPETITION_KEY, JSON.stringify(c));
    window.dispatchEvent(new Event(WK_SELECTED_COMPETITION_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearSelectedCompetition(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(WK_SELECTED_COMPETITION_KEY);
  } catch {
    /* ignore */
  }
}

const WK_SKIP_COMPETITION_PICKER_KEY = "wk_skip_competition_picker";

/** Pre-select a competition and open Register on step 2 (details) instead of the competition dropdown. */
export function queueRegisterForCompetition(c: WkSelectedCompetition): void {
  writeSelectedCompetition(c);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WK_SKIP_COMPETITION_PICKER_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Returns true once if the user came from “All competitions” → Register. */
export function consumeRegisterSkipCompetitionStep(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(WK_SKIP_COMPETITION_PICKER_KEY) === "1") {
      sessionStorage.removeItem(WK_SKIP_COMPETITION_PICKER_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function authSendMagicLink(email: string): Promise<boolean> {
  const r = await fetch(`${apiBase()}/auth/otp`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    console.error("[auth] OTP error:", r.status, msg);
    throw new Error(`(${r.status}) ${msg}`);
  }
  return true;
}

/** Email + password → Express `/auth/login` → Supabase password grant; stores session like OTP flow. */
export async function authSignInWithPassword(email: string, password: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: unknown;
}> {
  const r = await fetch(`${apiBase()}/auth/login`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`(${r.status}) ${msg}`);
  }
  const data = (await r.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
    user?: unknown;
  };
  if (!data.access_token) {
    throw new Error("Login response missing access_token");
  }
  authSaveSession(data);
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
    user?: unknown;
  };
}

/** Parses Supabase /signup variants: flat tokens, or nested `session`. */
function extractTokensFromSignupBody(data: Record<string, unknown>): {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user: unknown;
} | null {
  if (typeof data.access_token === "string") {
    return {
      access_token: data.access_token,
      refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
      expires_at: typeof data.expires_at === "number" ? data.expires_at : undefined,
      user: data.user ?? {},
    };
  }
  const session = data.session;
  if (session && typeof session === "object" && !Array.isArray(session)) {
    const s = session as Record<string, unknown>;
    if (typeof s.access_token === "string") {
      return {
        access_token: s.access_token,
        refresh_token: typeof s.refresh_token === "string" ? s.refresh_token : undefined,
        expires_in: typeof s.expires_in === "number" ? s.expires_in : undefined,
        expires_at: typeof s.expires_at === "number" ? s.expires_at : undefined,
        user: data.user ?? {},
      };
    }
  }
  return null;
}

/** Email/password signup → Express `/auth/signup` → Supabase. Session only if confirmations are off or user can sign in immediately. */
export async function authSignUp(
  email: string,
  password: string,
  redirectTo?: string,
): Promise<
  | {
      hasSession: true;
      access_token: string;
      refresh_token: string;
      expires_at: number;
      user: unknown;
    }
  | { hasSession: false }
> {
  const body: Record<string, string> = { email: email.trim(), password };
  if (redirectTo?.trim()) body.redirect_to = redirectTo.trim();

  const r = await fetch(`${apiBase()}/auth/signup`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`(${r.status}) ${msg}`);
  }
  const data = (await r.json()) as Record<string, unknown>;
  const extracted = extractTokensFromSignupBody(data);
  if (!extracted) return { hasSession: false };

  var expiresAt =
    extracted.expires_at ??
    Math.floor(Date.now() / 1000) + (typeof extracted.expires_in === "number" ? extracted.expires_in : 3600);

  authSaveSession({
    access_token: extracted.access_token,
    refresh_token: extracted.refresh_token,
    expires_at: expiresAt,
    user: extracted.user,
  });

  return {
    hasSession: true,
    access_token: extracted.access_token,
    refresh_token: extracted.refresh_token || "",
    expires_at: expiresAt,
    user: extracted.user,
  };
}

export function authSaveSession(data: { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: unknown }) {
  if (!data?.access_token) return;
  const toSave = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || "",
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user || {},
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(toSave));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WK_AUTH_SESSION_EVENT));
  }
}

export function authLoadSession(): {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: unknown;
} | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { access_token?: string };
    if (!s?.access_token) return null;
    return s as { access_token: string; refresh_token: string; expires_at: number; user: unknown };
  } catch {
    return null;
  }
}

export function authClearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WK_AUTH_SESSION_EVENT));
  }
}

export async function authRefreshSession(refreshToken: string) {
  if (!refreshToken) return null;
  try {
    const r = await fetch(`${apiBase()}/auth/refresh`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    authSaveSession(data);
    return data;
  } catch {
    return null;
  }
}

export async function authGetValidSession() {
  const s = authLoadSession();
  if (!s) return null;
  if (s.expires_at && Math.floor(Date.now() / 1000) > s.expires_at - 60) {
    return await authRefreshSession(s.refresh_token);
  }
  return s;
}

export async function authVerifyOTP(email: string, token: string) {
  const r = await fetch(`${apiBase()}/auth/verify`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, token }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const err = e as { msg?: string; error_description?: string };
    throw new Error(err.msg || err.error_description || "Invalid or expired link");
  }
  const data = await r.json();
  authSaveSession(data);
  return data;
}

export async function authGetUser(accessToken: string) {
  try {
    const r = await fetch(`${apiBase()}/auth/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return {};
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function authSignOut(accessToken: string | undefined) {
  try {
    const sb = getSupabaseBrowser();
    if (sb) await sb.auth.signOut();
  } catch {
    /* ignore */
  }
  try {
    await fetch(`${apiBase()}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken || ""}` },
    });
  } catch {
    /* ignore */
  }
  authClearSession();
}

/** Copy Supabase-js session into WK local storage so REST calls can send `Authorization: Bearer`. */
export function persistSupabaseSessionToWkStorage(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user: unknown;
}) {
  authSaveSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    user: session.user,
  });
}

/** Express API: send Supabase access_token if the user is logged in (Supabase client session or WK storage). Refreshes when stale so POST /participants does not get 401 from invalid/expired JWTs. */
async function participantAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};

  let token: string | undefined;

  const wk = await authGetValidSession();
  if (wk?.access_token) token = wk.access_token;

  try {
    const sb = getSupabaseBrowser();
    if (sb) {
      const { data } = await sb.auth.getSession();
      let sess = data.session;
      let t = sess?.access_token;
      const exp = sess?.expires_at;
      if (t && typeof exp === "number" && Math.floor(Date.now() / 1000) >= exp - 60) {
        const { data: ref } = await sb.auth.refreshSession();
        if (ref.session?.access_token) {
          t = ref.session.access_token;
          sess = ref.session;
        }
      }
      if (t && sess) {
        persistSupabaseSessionToWkStorage({
          access_token: sess.access_token,
          refresh_token: sess.refresh_token,
          expires_at: sess.expires_at,
          expires_in: sess.expires_in,
          user: sess.user,
        });
        token = t;
      }
    }
  } catch {
    /* ignore */
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseSpelersField(d: { spelers?: unknown }) {
  const raw = d.spelers;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown[];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

export type ApiFootballLeagueOption = {
  league_type: string;
  league_id: number;
};

/** API-Football league ids for the competition create dropdown (`api_football_league_lookup`). */
export async function listLeagueTypes(): Promise<ApiFootballLeagueOption[]> {
  try {
    const r = await fetch(`${apiBase()}/league-types`, { headers: jsonHeaders });
    if (!r.ok) return [];
    const data = (await r.json()) as unknown;
    return Array.isArray(data) ? (data as ApiFootballLeagueOption[]) : [];
  } catch {
    return [];
  }
}

export type PublicCompetition = {
  id: number;
  slug?: string;
  name?: string;
  league_type?: string | null;
  api_football_league_id?: number | null;
  season_label?: string | null;
  starts_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string | null;
  owner_user_id?: string | null;
  creator?: {
    id: string;
    email: string | null;
    full_name: string | null;
  } | null;
  registration_deadline?: string;
  registration_deadline_label?: string | null;
  registration_open?: boolean;
  team_count?: number;
};

export async function listPublicCompetitions(): Promise<PublicCompetition[]> {
  try {
    const r = await fetch(`${apiBase()}/competitions`, { headers: jsonHeaders });
    if (!r.ok) return [];
    const data = (await r.json()) as PublicCompetition[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** For Edit / My team picker: drop pools `viewerUserId` organizes (`owner_user_id`). */
export function hideOwnedPoolsForViewer<T extends { owner_user_id?: string | null }>(
  rows: T[],
  viewerUserId: string | null | undefined,
): T[] {
  const v = viewerUserId != null && typeof viewerUserId === "string" ? viewerUserId.trim() : "";
  if (!v) return rows;
  return rows.filter(function (c) {
    const o = c.owner_user_id;
    const os = o != null && String(o).trim() ? String(o).trim() : "";
    return os !== v;
  });
}

/** Competitions you may pick on Register: pools you are a member of, excluding pools you organize (requires Bearer). */
export async function listMyRegisterableCompetitions(): Promise<PublicCompetition[]> {
  const bearer = await participantAuthHeaders();
  if (!bearer.Authorization) return [];
  const r = await fetch(`${apiBase()}/participants/registerable-competitions`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (r.status === 401) return [];
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = (await r.json()) as PublicCompetition[];
  return Array.isArray(data) ? data : [];
}

/** My Team tab dropdown: member pools, pools you own, or pools with your team — not the full public list (requires Bearer). */
export async function listMyTeamCompetitions(): Promise<PublicCompetition[]> {
  const bearer = await participantAuthHeaders();
  if (!bearer.Authorization) return [];
  const r = await fetch(`${apiBase()}/participants/my-team-competitions`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (r.status === 401) return [];
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = (await r.json()) as PublicCompetition[];
  return Array.isArray(data) ? data : [];
}

/** Mirrors `public.fixture_mappings` (league + season scope; shared across pools). */
export type FixtureMappingPublic = {
  id: number;
  api_football_league_id: number;
  season: number;
  local_key: string | null;
  api_fixture_id: number | null;
  stage: string | null;
  kickoff_at: string | null;
  /** DB column `team_1` — first side name */
  team_1: string | null;
  /** DB column `team_2` — second side name */
  team_2: string | null;
  location: string | null;
  created_at: string | null;
};

export async function listPublicFixtureMappings(competitionId: number): Promise<FixtureMappingPublic[]> {
  const r = await fetch(
    `${apiBase()}/competitions/${encodeURIComponent(String(competitionId))}/fixture-mappings`,
    { headers: jsonHeaders, cache: "no-store" },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = (await r.json()) as unknown;
  return Array.isArray(data) ? (data as FixtureMappingPublic[]) : [];
}

/** Distinct players from `fixture_squad_members` for the pool's league+season (API-Football ids). */
export type SquadRosterPlayer = {
  player_id: number;
  name: string | null;
  team: string | null;
  pos: string | null;
};

export async function fetchPublicCompetitionSquadRoster(competitionId: number): Promise<SquadRosterPlayer[]> {
  const r = await fetch(
    `${apiBase()}/competitions/${encodeURIComponent(String(competitionId))}/squad-roster`,
    { headers: jsonHeaders, cache: "no-store" },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = (await r.json()) as unknown;
  return Array.isArray(data) ? (data as SquadRosterPlayer[]) : [];
}

export type PlayerRollupRow = {
  id?: number;
  competition_id?: number;
  team_id?: number;
  api_football_league_id?: number;
  season?: number;
  player_id: number;
  pos: string | null;
  is_captain: boolean;
  points: number;
};

export async function fetchParticipantPlayerRollups(participantId: number | string): Promise<PlayerRollupRow[]> {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/participants/${encodeURIComponent(String(participantId))}/player-rollups`,
    { headers: { ...jsonHeaders, ...bearer }, cache: "no-store" },
  );
  if (r.status === 401) return [];
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = (await r.json()) as unknown;
  return Array.isArray(data) ? (data as PlayerRollupRow[]) : [];
}

export async function patchParticipantPlayerRollups(
  participantId: number | string,
  players: Array<{ player_id: number; pos?: string | null; is_captain?: boolean; points?: number }>,
): Promise<void> {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/participants/${encodeURIComponent(String(participantId))}/players`,
    {
      method: "PATCH",
      headers: { ...jsonHeaders, ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ players }),
    },
  );
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`(${r.status}) ${msg}`);
  }
}

export type FixtureStatisticsPlayer = {
  land: string;
  speler_naam: string;
  player_id: number | null;
  punten: number;
};

export type FixtureStatisticsResponse = {
  source: "database" | "api_football";
  match: Record<string, unknown>;
  players: FixtureStatisticsPlayer[];
};

/** Load match + player_statistics from DB, or fetch from API-Football, persist, then return. */
export async function fetchFixtureStatistics(
  competitionId: number,
  fixtureId: number,
): Promise<FixtureStatisticsResponse> {
  const r = await fetch(
    `${apiBase()}/competitions/${encodeURIComponent(String(competitionId))}/fixture-statistics`,
    {
      method: "POST",
      headers: { ...jsonHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureId }),
      cache: "no-store",
    },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as FixtureStatisticsResponse;
}

/** Registers the signed-in user in the pool (`competition_members`) so they can submit a team. Idempotent. */
export async function joinCompetition(competitionId: number): Promise<{
  ok: boolean;
  alreadyMember?: boolean;
  competitionId: number;
  competitionName?: string;
  slug?: string;
}> {
  const bearer = await participantAuthHeaders();
  if (!bearer.Authorization) {
    throw new Error("Sign in required");
  }
  const r = await fetch(`${apiBase()}/participants/join`, {
    method: "POST",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ competition_id: competitionId }),
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`(${r.status}) ${msg}`);
  }
  return (await r.json()) as {
    ok: boolean;
    alreadyMember?: boolean;
    competitionId: number;
    competitionName?: string;
    slug?: string;
  };
}

export type MyParticipantSummary = {
  id: number;
  competition_id?: unknown;
  naam?: unknown;
  teamnaam?: unknown;
};

export async function listMyParticipantSummaries(): Promise<MyParticipantSummary[]> {
  try {
    const bearer = await participantAuthHeaders();
    const r = await fetch(`${apiBase()}/participants/mine`, {
      headers: { ...jsonHeaders, ...bearer },
    });
    if (!r.ok) return [];
    const data = (await r.json()) as MyParticipantSummary[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getMyDeelnemer(email: string, competitionId?: number) {
  const bearer = await participantAuthHeaders();
  const qs = new URLSearchParams({ email: email.trim() });
  if (competitionId != null && Number.isFinite(Number(competitionId))) {
    qs.set("competition_id", String(Number(competitionId)));
  }
  const r = await fetch(`${apiBase()}/participants/by-email?${qs.toString()}`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) return null;
  const data = (await r.json()) as Record<string, unknown>[];
  if (!data?.length) return null;
  const d = data[0] as { id?: number; spelers?: unknown; [k: string]: unknown };
  return { ...d, spelers: parseSpelersField(d) };
}

export async function dbLees() {
  try {
    const bearer = await participantAuthHeaders();
    const r = await fetch(`${apiBase()}/participants`, { headers: { ...jsonHeaders, ...bearer } });
    if (!r.ok) return [];
    const data = (await r.json()) as Array<{ spelers?: unknown; [k: string]: unknown }>;
    return data.map((d) => ({ ...d, spelers: parseSpelersField(d) }));
  } catch (e) {
    console.error("dbLees error", e);
    return [];
  }
}

export async function dbLeesSpelers() {
  try {
    const url = `${apiBase()}/players`;
    const r = await fetch(url, { headers: jsonHeaders });
    if (!r.ok) {
      const errText = await readErrorBody(r);
      console.warn(`[wk_spelers] HTTP ${r.status} — ${errText}`);
      console.warn("[wk_spelers] Ensure the API is running (NEXT_PUBLIC_API_BASE) and Supabase exposes wk_spelers.");
      return [];
    }
    const data = (await r.json()) as unknown[];
    console.log(`[wk_spelers] loaded ${data.length} rows`);
    return data;
  } catch (e) {
    console.error("dbLeesSpelers error", e);
    console.warn("[wk_spelers] Network error — is the backend running at NEXT_PUBLIC_API_BASE?");
    return [];
  }
}

export async function dbToevoegen(deelnemer: {
  naam: string;
  teamnaam?: string;
  email?: string;
  systeem?: string;
  spelers?: unknown[];
  competition_id?: number;
  competition_name?: string;
  /** When set, server may stamp `competitions.starts_at` (if still unset) to this ISO datetime = registration close. */
  pool_registration_starts_at?: string;
}) {
  const bearer = await participantAuthHeaders();
  const body: Record<string, unknown> = {
    naam: deelnemer.naam,
    teamnaam: deelnemer.teamnaam || "",
    email: deelnemer.email || "",
    systeem: deelnemer.systeem || "",
    spelers: JSON.stringify(deelnemer.spelers || []),
  };
  if (deelnemer.competition_id != null && Number.isFinite(Number(deelnemer.competition_id))) {
    body.competition_id = Number(deelnemer.competition_id);
  }
  if (deelnemer.competition_name != null && String(deelnemer.competition_name).trim()) {
    body.competition_name = String(deelnemer.competition_name).trim();
  }
  if (deelnemer.pool_registration_starts_at != null && String(deelnemer.pool_registration_starts_at).trim()) {
    body.pool_registration_starts_at = String(deelnemer.pool_registration_starts_at).trim();
  }
  const r = await fetch(`${apiBase()}/participants`, {
    method: "POST",
    headers: { ...jsonHeaders, ...bearer, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`Insert mislukt: (${r.status}) ${msg}`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function dbBijwerkenSpelers(id: number | string, spelers: unknown[]) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/participants/${id}/players`, {
    method: "PATCH",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ spelers }),
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`Update mislukt: (${r.status}) ${msg}`);
  }
}

export async function dbBijwerkenVeld(
  id: number | string,
  fields: Partial<{ naam: string; teamnaam: string; systeem: string; spelers: string }>,
) {
  const allowed: Partial<{ naam: string; teamnaam: string; systeem: string; spelers: string }> = {};
  (["naam", "teamnaam", "systeem", "spelers"] as const).forEach((k) => {
    if (fields[k] !== undefined) allowed[k] = fields[k]!;
  });
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/participants/${id}`, {
    method: "PATCH",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify(allowed),
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`Update mislukt: (${r.status}) ${msg}`);
  }
}

export async function dbVerwijderParticipant(id: number | string): Promise<void> {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/participants/${id}`, {
    method: "DELETE",
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) {
    const msg = await readErrorBody(r);
    throw new Error(`(${r.status}) ${msg}`);
  }
}

export async function adminListCompetitions() {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/internal/competitions`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function adminCreateCompetition(body: {
  slug: string;
  name: string;
  league_type: string;
  season_label?: string;
  starts_at?: string;
  metadata?: Record<string, unknown>;
}) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/internal/competitions`, {
    method: "POST",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return await r.json();
}

export async function adminDeleteCompetition(id: number | string): Promise<void> {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/internal/competitions/${id}`, {
    method: "DELETE",
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
}

/**
 * List fixture mappings (shared by league + season). Pass either `competitionId` (pool id, resolved server-side)
 * or both `apiFootballLeagueId` and `season`.
 */
export async function adminListFixtureMappings(
  competitionOrLeagueId: number | string,
  season?: number,
) {
  const bearer = await participantAuthHeaders();
  const qs = new URLSearchParams();
  if (season !== undefined && season !== null) {
    qs.set("leagueId", String(competitionOrLeagueId));
    qs.set("season", String(season));
  } else {
    qs.set("competitionId", String(competitionOrLeagueId));
  }
  const r = await fetch(`${apiBase()}/internal/fixture-mappings?${qs.toString()}`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function adminUpdateFixtureMapping(
  id: number | string,
  api_fixture_id: number | null,
) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/internal/fixture-mappings/${id}`, {
    method: "PATCH",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ api_fixture_id }),
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return await r.json();
}

/** Superadmin analytics snapshot (counts, top pools, recent team sign-ups). */
export async function adminFetchAnalytics(): Promise<AdminAnalyticsSnapshot> {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/internal/analytics`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as AdminAnalyticsSnapshot;
}

/** Competitions you own (requires logged-in session). */
export async function myListCompetitions() {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/my-competitions`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function myCreateCompetition(body: {
  slug: string;
  name: string;
  league_type: string;
  season_label?: string;
  starts_at?: string;
  metadata?: Record<string, unknown>;
}) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/my-competitions`, {
    method: "POST",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return await r.json();
}

/** Single competition you created (`owner_user_id` matches the signed-in user). */
export async function myGetMyCompetition(id: number | string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/my-competitions/${encodeURIComponent(String(id))}`, {
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as Record<string, unknown>;
}

export async function myPatchMyCompetition(
  id: number | string,
  body: Partial<{
    slug: string;
    name: string;
    league_type: string;
    season_label: string | null;
    starts_at: string | null;
    metadata: Record<string, unknown>;
  }>,
) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/my-competitions/${id}`, {
    method: "PATCH",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return await r.json();
}

/** Replace all editable fields at once (PUT). Send `null` for season_label / starts_at to clear. */
export async function myPutMyCompetition(
  id: number | string,
  body: {
    slug: string;
    name: string;
    league_type: string;
    season_label: string | null;
    starts_at: string | null;
    metadata: Record<string, unknown>;
  },
) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/my-competitions/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return await r.json();
}

export async function myDeleteMyCompetition(id: number | string): Promise<void> {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/my-competitions/${id}`, {
    method: "DELETE",
    headers: { ...jsonHeaders, ...bearer },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
}

export async function myListCompetitionParticipants(competitionId: number | string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/my-competitions/${encodeURIComponent(String(competitionId))}/participants`,
    { headers: { ...jsonHeaders, ...bearer } },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function myListCompetitionFixtureMappings(competitionId: number | string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/my-competitions/${encodeURIComponent(String(competitionId))}/fixture-mappings`,
    { headers: { ...jsonHeaders, ...bearer } },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function myPatchCompetitionFixtureMapping(
  competitionId: number | string,
  mappingId: number | string,
  api_fixture_id: number | null,
) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/my-competitions/${encodeURIComponent(String(competitionId))}/fixture-mappings/${encodeURIComponent(String(mappingId))}`,
    {
      method: "PATCH",
      headers: { ...jsonHeaders, ...bearer },
      body: JSON.stringify({ api_fixture_id }),
    },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return await r.json();
}

export async function myImportApiFootballFixtures(
  competitionId: number | string,
  body?: { league?: number; season?: number },
) {
  const bearer = await participantAuthHeaders();
  const payload: Record<string, number> = {};
  if (body?.league != null && Number.isFinite(body.league) && body.league > 0) {
    payload.league = body.league;
  }
  if (body?.season != null && Number.isFinite(body.season) && body.season > 0) {
    payload.season = body.season;
  }
  const r = await fetch(
    `${apiBase()}/my-competitions/${encodeURIComponent(String(competitionId))}/import-api-football-fixtures`,
    {
      method: "POST",
      headers: { ...jsonHeaders, ...bearer },
      body: JSON.stringify(payload),
    },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as {
    ok: boolean;
    totalFromApi: number;
    written: number;
    league: number;
    season: number;
    message?: string;
  };
}

/** Queue background squad import for all mapped API fixtures (3s between upstream API calls). */
export async function myFetchAllFixtureSquads(competitionId: number | string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/my-competitions/${encodeURIComponent(String(competitionId))}/fetch-all-fixture-squads`,
    {
      method: "POST",
      headers: { ...jsonHeaders, ...bearer },
      body: JSON.stringify({}),
    },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as { message: string; queued?: number };
}

export async function invitePreview(token: string) {
  const r = await fetch(`${apiBase()}/invites/preview?token=${encodeURIComponent(token)}`, {
    headers: { ...jsonHeaders },
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as {
    competitionId: number;
    name: string;
    slug: string;
    alreadyUsed?: boolean;
  };
}

export async function inviteAccept(token: string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/invites/accept`, {
    method: "POST",
    headers: { ...jsonHeaders, ...bearer },
    body: JSON.stringify({ token }),
  });
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as {
    ok: boolean;
    alreadyMember?: boolean;
    competitionId: number;
    competitionName: string;
    slug: string;
  };
}

export async function mySendCompetitionInvite(competitionId: number | string, email: string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/my-competitions/${encodeURIComponent(String(competitionId))}/invites`,
    {
      method: "POST",
      headers: { ...jsonHeaders, ...bearer },
      body: JSON.stringify({ email: email.trim() }),
    },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  return (await r.json()) as {
    ok: boolean;
    inviteUrl: string;
    emailed: boolean;
    emailReason?: string;
    expires_at: string;
  };
}

export async function myListCompetitionInvites(competitionId: number | string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(
    `${apiBase()}/my-competitions/${encodeURIComponent(String(competitionId))}/invites`,
    { headers: { ...jsonHeaders, ...bearer } },
  );
  if (!r.ok) throw new Error(`(${r.status}) ${await readErrorBody(r)}`);
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}
