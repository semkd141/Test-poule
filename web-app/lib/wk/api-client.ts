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
  try {
    const sb = getSupabaseBrowser();
    if (sb) {
      const { data } = await sb.auth.getSession();
      let t = data.session?.access_token;
      const exp = data.session?.expires_at;
      if (t && typeof exp === "number" && Math.floor(Date.now() / 1000) >= exp - 60) {
        const { data: ref } = await sb.auth.refreshSession();
        if (ref.session?.access_token) t = ref.session.access_token;
      }
      if (t) return { Authorization: `Bearer ${t}` };
    }
  } catch {
    /* ignore */
  }
  const s = await authGetValidSession();
  return s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {};
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

export async function getMyDeelnemer(email: string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/participants/by-email?email=${encodeURIComponent(email)}`, {
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
}) {
  const bearer = await participantAuthHeaders();
  const body = {
    naam: deelnemer.naam,
    teamnaam: deelnemer.teamnaam || "",
    email: deelnemer.email || "",
    systeem: deelnemer.systeem || "",
    spelers: JSON.stringify(deelnemer.spelers || []),
  };
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

export async function adminListFixtureMappings(competitionId: number | string) {
  const bearer = await participantAuthHeaders();
  const r = await fetch(`${apiBase()}/internal/fixture-mappings?competitionId=${encodeURIComponent(String(competitionId))}`, {
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
