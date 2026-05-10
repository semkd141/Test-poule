import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import { UpstreamHttpError } from "../shared/upstream-error.js";
import { createSupabaseAdmin } from "./supabase-admin.js";

type FetchInit = RequestInit;

/**
 * Encapsulates all HTTP calls to Supabase Auth and PostgREST.
 * Single place for URLs, headers, and error handling.
 */
export class SupabaseGateway {
  private readonly dbBase: string;
  private readonly authBase: string;
  /** Lazily created; null if {@link Env.SUPABASE_SERVICE_ROLE_KEY} is unset. */
  private supabaseAdminClient: SupabaseClient | null | undefined;

  constructor(
    private readonly env: Env,
    private readonly log: AppLogger,
  ) {
    const base = env.SUPABASE_URL.replace(/\/$/, "");
    this.dbBase = `${base}/rest/v1`;
    this.authBase = `${base}/auth/v1`;
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      this.log.warn(
        "SUPABASE_SERVICE_ROLE_KEY is unset. With Row Level Security on `deelnemers`, PostgREST queries using only the anon/publishable SUPABASE_KEY may return zero rows for other users' emails — password signup will falsely say no team registration exists. Add the service_role key from Supabase Dashboard → API.",
      );
    }
  }

  /** Auth Admin (`auth.admin.*`) via `@supabase/supabase-js` + service role key. */
  private supabaseAdmin(): SupabaseClient | null {
    if (this.supabaseAdminClient !== undefined) return this.supabaseAdminClient;
    const client = createSupabaseAdmin(this.env);
    this.supabaseAdminClient = client;
    return client;
  }

  /** PostgREST: use service role when set so server reads/writes are not blocked by RLS. User JWT requests keep anon apikey + Bearer user. */
  private serviceHeaders(accessToken?: string): Record<string, string> {
    if (accessToken) {
      return {
        "Content-Type": "application/json",
        apikey: this.env.SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      };
    }
    const key = this.env.SUPABASE_SERVICE_ROLE_KEY ?? this.env.SUPABASE_KEY;
    return {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    };
  }

  private async parseJsonSafe(r: globalThis.Response): Promise<unknown> {
    try {
      return await r.json();
    } catch {
      return { error: `Upstream failed with status ${r.status}` };
    }
  }

  private async parseSuccessBody(r: globalThis.Response): Promise<unknown> {
    const text = await r.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { raw: text };
    }
  }

  private async request(
    label: string,
    url: string,
    init: FetchInit,
  ): Promise<globalThis.Response> {
    const started = Date.now();
    this.log.debug({ label, method: init.method ?? "GET", url }, "upstream request");
    const r = await fetch(url, init);
    const ms = Date.now() - started;
    if (!r.ok) {
      const payload = await this.parseJsonSafe(r);
      this.log.warn({ label, status: r.status, ms, payload }, "upstream error");
      throw new UpstreamHttpError(r.status, payload);
    }
    this.log.debug({ label, status: r.status, ms }, "upstream ok");
    return r;
  }

  // --- Auth ---

  async sendOtp(email: string): Promise<unknown> {
    const r = await this.request(
      "auth.otp",
      `${this.authBase}/otp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.env.SUPABASE_KEY,
        },
        body: JSON.stringify({ email, create_user: true }),
      },
    );
    return this.parseSuccessBody(r);
  }

  async signInWithPassword(email: string, password: string): Promise<unknown> {
    const r = await this.request(
      "auth.password",
      `${this.authBase}/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.env.SUPABASE_KEY,
        },
        body: JSON.stringify({ email, password }),
      },
    );
    return this.parseSuccessBody(r);
  }

  /**
   * Uses GoTrue `GET /admin/users?filter=…` (service role). The JS client's `listUsers()`
   * does not pass `filter`, so we keep this HTTP call; {@link adminDeleteUser} uses `auth.admin` instead.
   */
  async lookupAuthUserByEmail(email: string): Promise<"exists" | "absent" | "unavailable"> {
    if (!this.supabaseAdmin()) return "unavailable";

    const trimmed = email.trim();
    const filter = encodeURIComponent(trimmed);
    const serviceKey = this.env.SUPABASE_SERVICE_ROLE_KEY!;
    const url = `${this.authBase}/admin/users?page=1&per_page=100&filter=${filter}`;
    const started = Date.now();
    this.log.debug({ label: "auth.admin.users", method: "GET" }, "upstream request");

    let r: globalThis.Response;
    try {
      r = await fetch(url, {
        method: "GET",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
    } catch (e) {
      this.log.warn({ err: e }, "auth admin users request failed");
      return "unavailable";
    }

    const ms = Date.now() - started;
    if (!r.ok) {
      const payload = await this.parseJsonSafe(r);
      this.log.warn({ status: r.status, ms, payload }, "auth admin users lookup failed");
      return "unavailable";
    }

    const data = (await this.parseJsonSafe(r)) as Record<string, unknown>;
    const rows = Array.isArray(data.users) ? data.users : [];
    const needle = trimmed.toLowerCase();
    for (const u of rows) {
      if (u && typeof u === "object" && !Array.isArray(u)) {
        const em = String((u as Record<string, unknown>).email ?? "").toLowerCase();
        if (em === needle) return "exists";
      }
    }
    return "absent";
  }

  /** Removes an Auth user via `supabase.auth.admin.deleteUser` (service role). Logs on failure; does not throw. */
  async adminDeleteUser(userId: string): Promise<void> {
    const admin = this.supabaseAdmin();
    if (!admin) {
      this.log.warn("adminDeleteUser skipped: SUPABASE_SERVICE_ROLE_KEY unset");
      return;
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      this.log.warn({ userId, message: error.message, status: error.status }, "auth.admin.deleteUser failed");
    }
  }

  async signUpWithPassword(email: string, password: string, redirectTo?: string): Promise<unknown> {
    const body: Record<string, unknown> = { email, password };
    // Confirmation/magic-link URLs must match Dashboard → Auth → Redirect URLs
    if (redirectTo) body.redirect_to = redirectTo;
    const r = await this.request(
      "auth.signup",
      `${this.authBase}/signup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.env.SUPABASE_KEY,
        },
        body: JSON.stringify(body),
      },
    );
    return this.parseSuccessBody(r);
  }

  async verifyOtp(email: string, token: string): Promise<unknown> {
    const r = await this.request(
      "auth.verify",
      `${this.authBase}/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.env.SUPABASE_KEY,
        },
        body: JSON.stringify({ type: "email", email, token }),
      },
    );
    return this.parseSuccessBody(r);
  }

  async refreshSession(refreshToken: string): Promise<unknown> {
    const r = await this.request(
      "auth.refresh",
      `${this.authBase}/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.env.SUPABASE_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );
    return this.parseSuccessBody(r);
  }

  async logout(accessToken: string): Promise<void> {
    await this.request(
      "auth.logout",
      `${this.authBase}/logout`,
      {
        method: "POST",
        headers: {
          apikey: this.env.SUPABASE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  }

  async getUser(accessToken: string): Promise<unknown> {
    const r = await this.request(
      "auth.user",
      `${this.authBase}/user`,
      {
        headers: {
          apikey: this.env.SUPABASE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    return this.parseSuccessBody(r);
  }

  /**
   * Auth user record for public competition “creator” display (service role only).
   * Returns null if service role is not configured or the user does not exist.
   */
  async adminGetUserById(userId: string): Promise<Record<string, unknown> | null> {
    const admin = this.supabaseAdmin();
    if (!admin) return null;
    const trimmed = userId.trim();
    if (!trimmed) return null;
    const { data, error } = await admin.auth.admin.getUserById(trimmed);
    if (error) {
      this.log.debug({ userId: trimmed, message: error.message }, "adminGetUserById failed");
      return null;
    }
    if (!data?.user) return null;
    return data.user as unknown as Record<string, unknown>;
  }

  /** Count non-config participants per competition (single query). */
  async fetchParticipantCountsByCompetition(): Promise<Map<number, number>> {
    const r = await this.request(
      "db.deelnemers.competitionCounts",
      `${this.dbBase}/deelnemers?email=not.eq.__config__&select=competition_id`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    const map = new Map<number, number>();
    if (!Array.isArray(data)) return map;
    for (const row of data) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const cid = Number((row as Record<string, unknown>).competition_id);
      if (!Number.isFinite(cid)) continue;
      map.set(cid, (map.get(cid) ?? 0) + 1);
    }
    return map;
  }

  // --- REST (deelnemers / wk_spelers) ---

  async listParticipants(): Promise<unknown> {
    const r = await this.request(
      "db.deelnemers.list",
      `${this.dbBase}/deelnemers?select=*&order=id`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async getParticipant(id: string): Promise<Record<string, unknown> | null> {
    const enc = encodeURIComponent(id);
    const r = await this.request(
      "db.deelnemers.byId",
      `${this.dbBase}/deelnemers?id=eq.${enc}&select=*&limit=1`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as Record<string, unknown>;
  }

  async findParticipantByEmail(email: string): Promise<unknown> {
    const enc = encodeURIComponent(email.trim());
    // ilike = case-insensitive match (eq. on text is case-sensitive and breaks lookups vs registration casing)
    const r = await this.request(
      "db.deelnemers.byEmail",
      `${this.dbBase}/deelnemers?email=ilike.${enc}&email=not.eq.__config__&limit=1`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  /** All participant rows for an email (multiple competitions). */
  async findAllParticipantsByEmail(email: string): Promise<unknown> {
    const enc = encodeURIComponent(email.trim());
    const r = await this.request(
      "db.deelnemers.byEmailAll",
      `${this.dbBase}/deelnemers?email=ilike.${enc}&email=not.eq.__config__&select=*&order=id`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async findParticipantByEmailAndCompetition(
    email: string,
    competitionId: number,
  ): Promise<unknown> {
    const enc = encodeURIComponent(email.trim());
    const cid = encodeURIComponent(String(competitionId));
    const r = await this.request(
      "db.deelnemers.byEmailCompetition",
      `${this.dbBase}/deelnemers?email=ilike.${enc}&email=not.eq.__config__&competition_id=eq.${cid}&limit=1`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async getCompetitionConfigRow(competitionId: string | number): Promise<Record<string, unknown> | null> {
    const enc = encodeURIComponent(String(competitionId));
    const r = await this.request(
      "db.deelnemers.configByCompetition",
      `${this.dbBase}/deelnemers?competition_id=eq.${enc}&email=eq.__config__&select=*&limit=1`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as Record<string, unknown>;
  }

  async listWkSpelers(): Promise<unknown> {
    const r = await this.request(
      "db.wk_spelers.list",
      `${this.dbBase}/wk_spelers?select=*&order=land,positie,naam`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async listParticipantsByCompetition(competitionId: number): Promise<unknown> {
    const r = await this.request(
      "db.deelnemers.byCompetition",
      `${this.dbBase}/deelnemers?competition_id=eq.${encodeURIComponent(String(competitionId))}&select=*&email=not.eq.__config__&order=id`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async listFixtureMappings(competitionId: number): Promise<unknown> {
    const r = await this.request(
      "db.fixture_mapping.list",
      `${this.dbBase}/fixture_mappings?competition_id=eq.${encodeURIComponent(String(competitionId))}&select=*&order=local_key`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async getFixtureMappingById(id: string): Promise<Record<string, unknown> | null> {
    const r = await this.request(
      "db.fixture_mapping.byId",
      `${this.dbBase}/fixture_mappings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as Record<string, unknown>;
  }

  async patchFixtureMapping(
    id: string,
    body: { api_fixture_id?: number | null },
  ): Promise<unknown> {
    const r = await this.request(
      "db.fixture_mapping.patch",
      `${this.dbBase}/fixture_mappings?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(body),
      },
    );
    return this.parseSuccessBody(r);
  }

  async upsertMatch(body: Record<string, unknown>): Promise<unknown> {
    const r = await this.request(
      "db.matches.upsert",
      `${this.dbBase}/matches?on_conflict=external_fixture_id`,
      {
        method: "POST",
        headers: {
          ...this.serviceHeaders(),
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(body),
      },
    );
    return this.parseSuccessBody(r);
  }

  async listScorableMatches(competitionId: number): Promise<unknown> {
    const r = await this.request(
      "db.matches.scorable",
      `${this.dbBase}/matches?competition_id=eq.${encodeURIComponent(String(competitionId))}&status=in.(FT,AET,PEN)&select=*&order=kickoff_at.asc`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async insertScoreEventIfMissing(
    participantId: number,
    matchId: number,
    eventKey: string,
    deltaPoints: number,
  ): Promise<boolean> {
    const body = {
      participant_id: participantId,
      match_id: matchId,
      event_key: eventKey,
      delta_points: deltaPoints,
    };
    const r = await fetch(`${this.dbBase}/participant_score_events`, {
      method: "POST",
      headers: {
        ...this.serviceHeaders(),
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const payload = await this.parseJsonSafe(r);
      this.log.warn({ participantId, matchId, eventKey, payload }, "score event insert failed");
      throw new UpstreamHttpError(r.status, payload);
    }
    const out = await this.parseSuccessBody(r);
    return Array.isArray(out) && out.length > 0;
  }

  async getCompetitionBySlug(slug: string): Promise<Record<string, unknown> | null> {
    const r = await this.request(
      "db.competitions.bySlug",
      `${this.dbBase}/competitions?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as Record<string, unknown>;
  }

  async getCompetitionById(id: string): Promise<Record<string, unknown> | null> {
    const r = await this.request(
      "db.competitions.byId",
      `${this.dbBase}/competitions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as Record<string, unknown>;
  }

  async listCompetitionsByOwner(ownerUserId: string): Promise<unknown> {
    const r = await this.request(
      "db.competitions.byOwner",
      `${this.dbBase}/competitions?owner_user_id=eq.${encodeURIComponent(ownerUserId)}&select=*&order=id`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async listCompetitions(): Promise<unknown> {
    const r = await this.request(
      "db.competitions.list",
      `${this.dbBase}/competitions?select=*&order=id`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async createCompetition(body: Record<string, unknown>): Promise<unknown> {
    const r = await this.request(
      "db.competitions.insert",
      `${this.dbBase}/competitions`,
      {
        method: "POST",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(body),
      },
    );
    return this.parseSuccessBody(r);
  }

  async patchCompetition(id: string, body: Record<string, unknown>): Promise<unknown> {
    const r = await this.request(
      "db.competitions.patch",
      `${this.dbBase}/competitions?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(body),
      },
    );
    return this.parseSuccessBody(r);
  }

  async deleteCompetition(id: string): Promise<void> {
    await this.request(
      "db.competitions.delete",
      `${this.dbBase}/competitions?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
      },
    );
  }

  async createParticipant(body: unknown): Promise<unknown> {
    const row =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>) }
        : {};
    delete row.competition_name;
    const r = await this.request(
      "db.deelnemers.insert",
      `${this.dbBase}/deelnemers`,
      {
        method: "POST",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(row),
      },
    );
    return this.parseSuccessBody(r);
  }

  async patchParticipantPlayers(id: string, payload: Record<string, unknown>): Promise<unknown> {
    const r = await this.request(
      "db.deelnemers.patchPlayers",
      `${this.dbBase}/deelnemers?id=eq.${id}`,
      {
        method: "PATCH",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(payload),
      },
    );
    return this.parseSuccessBody(r);
  }

  async patchParticipant(id: string, body: unknown): Promise<unknown> {
    const r = await this.request(
      "db.deelnemers.patch",
      `${this.dbBase}/deelnemers?id=eq.${id}`,
      {
        method: "PATCH",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(body),
      },
    );
    return this.parseSuccessBody(r);
  }

  async patchParticipantAggregates(
    id: string,
    totalPoints: number,
    attackerGoals: number,
  ): Promise<unknown> {
    const r = await this.request(
      "db.deelnemers.patchAggregates",
      `${this.dbBase}/deelnemers?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({
          total_points: totalPoints,
          attacker_goals: attackerGoals,
        }),
      },
    );
    return this.parseSuccessBody(r);
  }

  async deleteParticipant(id: string): Promise<void> {
    await this.request(
      "db.deelnemers.delete",
      `${this.dbBase}/deelnemers?id=eq.${id}`,
      {
        method: "DELETE",
        headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
      },
    );
  }

  // --- Competition invites / members ---

  hashInviteToken(plainToken: string): string {
    return createHash("sha256").update(plainToken.trim(), "utf8").digest("hex");
  }

  createInviteSecret(): { plainToken: string; tokenHash: string } {
    const plainToken = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(plainToken, "utf8").digest("hex");
    return { plainToken, tokenHash };
  }

  async deletePendingInvitesForEmail(competitionId: number, email: string): Promise<void> {
    const em = encodeURIComponent(email.trim().toLowerCase());
    await this.request(
      "db.competition_invites.deletePending",
      `${this.dbBase}/competition_invites?competition_id=eq.${competitionId}&email=eq.${em}&accepted_at=is.null`,
      {
        method: "DELETE",
        headers: { ...this.serviceHeaders(), Prefer: "return=minimal" },
      },
    );
  }

  async insertCompetitionInvite(row: {
    competition_id: number;
    email: string;
    token_hash: string;
    invited_by: string;
    expires_at: string;
  }): Promise<unknown> {
    const r = await this.request(
      "db.competition_invites.insert",
      `${this.dbBase}/competition_invites`,
      {
        method: "POST",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(row),
      },
    );
    return this.parseSuccessBody(r);
  }

  async getInviteByTokenHash(tokenHash: string): Promise<Record<string, unknown> | null> {
    const r = await this.request(
      "db.competition_invites.byHash",
      `${this.dbBase}/competition_invites?token_hash=eq.${encodeURIComponent(tokenHash)}&select=*&limit=1`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as Record<string, unknown>;
  }

  async listCompetitionInvites(competitionId: number): Promise<unknown> {
    const r = await this.request(
      "db.competition_invites.list",
      `${this.dbBase}/competition_invites?competition_id=eq.${competitionId}&select=id,email,created_at,expires_at,accepted_at,accepted_user_id,invited_by&order=created_at.desc`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async patchCompetitionInvite(
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const r = await this.request(
      "db.competition_invites.patch",
      `${this.dbBase}/competition_invites?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(body),
      },
    );
    return this.parseSuccessBody(r);
  }

  async isCompetitionMember(competitionId: number, userId: string): Promise<boolean> {
    const r = await this.request(
      "db.competition_members.check",
      `${this.dbBase}/competition_members?competition_id=eq.${competitionId}&user_id=eq.${encodeURIComponent(userId)}&select=competition_id&limit=1`,
      { headers: this.serviceHeaders() },
    );
    const data = await this.parseSuccessBody(r);
    return Array.isArray(data) && data.length > 0;
  }

  async insertCompetitionMember(
    competitionId: number,
    userId: string,
    inviteId: number | null,
  ): Promise<boolean> {
    const r = await fetch(`${this.dbBase}/competition_members`, {
      method: "POST",
      headers: {
        ...this.serviceHeaders(),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        competition_id: competitionId,
        user_id: userId,
        invite_id: inviteId,
      }),
    });
    if (r.status === 201 || r.status === 200) return true;
    if (r.status === 409) return false;
    const payload = await this.parseJsonSafe(r);
    this.log.warn({ competitionId, userId, status: r.status, payload }, "competition_members insert failed");
    throw new UpstreamHttpError(r.status, payload);
  }
}
