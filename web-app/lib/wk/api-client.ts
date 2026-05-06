import { getApiBaseUrl } from "./config";

const jsonHeaders = { "Content-Type": "application/json" };

function apiBase() {
  return getApiBaseUrl().replace(/\/$/, "");
}

async function readErrorBody(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t) as { error?: string; message?: string; msg?: string };
    return j.error || j.message || j.msg || t || r.statusText;
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
    await fetch(`${apiBase()}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken || ""}` },
    });
  } catch {
    /* ignore */
  }
  authClearSession();
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
  const r = await fetch(`${apiBase()}/participants/by-email?email=${encodeURIComponent(email)}`, { headers: jsonHeaders });
  if (!r.ok) return null;
  const data = (await r.json()) as Record<string, unknown>[];
  if (!data?.length) return null;
  const d = data[0] as { id?: number; spelers?: unknown; [k: string]: unknown };
  return { ...d, spelers: parseSpelersField(d) };
}

export async function dbLees() {
  try {
    const r = await fetch(`${apiBase()}/participants`, { headers: jsonHeaders });
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
  const body = {
    naam: deelnemer.naam,
    teamnaam: deelnemer.teamnaam || "",
    email: deelnemer.email || "",
    systeem: deelnemer.systeem || "",
    spelers: JSON.stringify(deelnemer.spelers || []),
  };
  const r = await fetch(`${apiBase()}/participants`, {
    method: "POST",
    headers: { ...jsonHeaders, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Insert mislukt: ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function dbBijwerkenSpelers(id: number | string, spelers: unknown[]) {
  const r = await fetch(`${apiBase()}/participants/${id}/players`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ spelers }),
  });
  if (!r.ok) throw new Error(`Update mislukt: ${r.status}`);
}

export async function dbBijwerkenVeld(
  id: number | string,
  fields: Partial<{ naam: string; teamnaam: string; systeem: string; spelers: string }>,
) {
  const allowed: Partial<{ naam: string; teamnaam: string; systeem: string; spelers: string }> = {};
  (["naam", "teamnaam", "systeem", "spelers"] as const).forEach((k) => {
    if (fields[k] !== undefined) allowed[k] = fields[k]!;
  });
  const r = await fetch(`${apiBase()}/participants/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(allowed),
  });
  if (!r.ok) throw new Error(`Update mislukt: ${r.status}`);
}
