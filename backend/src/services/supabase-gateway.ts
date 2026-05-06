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

  async findParticipantByEmail(email: string): Promise<unknown> {
    const enc = encodeURIComponent(email);
    const r = await this.request(
      "db.deelnemers.byEmail",
      `${this.dbBase}/deelnemers?email=eq.${enc}&email=not.eq.__config__&limit=1`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
  }

  async listWkSpelers(): Promise<unknown> {
    const r = await this.request(
      "db.wk_spelers.list",
      `${this.dbBase}/wk_spelers?select=*&order=land,positie,naam`,
      { headers: this.serviceHeaders() },
    );
    return this.parseSuccessBody(r);
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

  async patchParticipantPlayers(id: string, spelers: unknown): Promise<unknown> {
    const r = await this.request(
      "db.deelnemers.patchPlayers",
      `${this.dbBase}/deelnemers?id=eq.${id}`,
      {
        method: "PATCH",
        headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
        body: JSON.stringify({ spelers }),
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
