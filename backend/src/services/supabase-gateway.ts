import type { Env } from "../config/env.js";
import type { AppLogger } from "../lib/logger.js";
import { UpstreamHttpError } from "../shared/upstream-error.js";

type FetchInit = RequestInit;

/**
 * Encapsulates all HTTP calls to Supabase Auth and PostgREST.
 * Single place for URLs, headers, and error handling.
 */
export class SupabaseGateway {
  private readonly dbBase: string;
  private readonly authBase: string;

  constructor(
    private readonly env: Env,
    private readonly log: AppLogger,
  ) {
    const base = env.SUPABASE_URL.replace(/\/$/, "");
    this.dbBase = `${base}/rest/v1`;
    this.authBase = `${base}/auth/v1`;
  }

  private serviceHeaders(accessToken?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      apikey: this.env.SUPABASE_KEY,
      Authorization: accessToken
        ? `Bearer ${accessToken}`
        : `Bearer ${this.env.SUPABASE_KEY}`,
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
    const enc = encodeURIComponent(email);
    const r = await this.request(
      "db.deelnemers.byEmail",
      `${this.dbBase}/deelnemers?email=eq.${enc}&email=not.eq.__config__&limit=1`,
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

  async createParticipant(body: unknown): Promise<unknown> {
    const r = await this.request(
      "db.deelnemers.insert",
      `${this.dbBase}/deelnemers`,
      {
        method: "POST",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(body),
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
}
