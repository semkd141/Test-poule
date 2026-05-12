import type { Request, Response } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../shared/http-error.js";
import { UpstreamHttpError } from "../shared/upstream-error.js";
import { z } from "zod";
import { TransactionalEmailService } from "../services/transactional-email.js";

const otpBodySchema = z.object({
  email: z.string().min(3, "email is required"),
});

const passwordLoginBodySchema = z.object({
  email: z.string().min(3, "email is required"),
  password: z.string().min(1, "password is required"),
});

const signUpBodySchema = z.object({
  email: z.string().min(3, "email is required"),
  password: z.string().min(6, "password must be at least 6 characters"),
  /** Must be listed under Supabase Auth → URL configuration → Redirect URLs */
  redirect_to: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().url("redirect_to must be a valid URL").optional(),
  ),
});

const verifyBodySchema = z.object({
  email: z.string().min(3),
  token: z.string().min(1, "token is required"),
});

const refreshBodySchema = z.object({
  refresh_token: z.string().min(1, "refresh_token is required"),
});

const inviteBodySchema = z.object({
  email: z.string().email("valid email required"),
  competitionName: z.string().min(1).default("Competition"),
  inviteUrl: z.string().url("inviteUrl must be a valid URL"),
});

function bearerToken(req: Request): string {
  return String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
}

function rowsFromParticipantLookup(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((x): x is Record<string, unknown> =>
    Boolean(x && typeof x === "object" && !Array.isArray(x)),
  );
}

const accountAlreadyExistsMessage = (email: string) =>
  `A user account already exists for "${email}". Please log in instead of signing up again.`;

const noTeamRegistrationMessage = (email: string) =>
  `No team registration exists for "${email}". Register your team on the Register tab first using this exact email address, then return here to create your login password.`;

function userIdFromSignupBody(data: unknown): string | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const u = d.user;
  if (u && typeof u === "object" && !Array.isArray(u)) {
    const id = (u as Record<string, unknown>).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return undefined;
}

/** Supabase GoTrue duplicate signup / existing identity responses */
function isSupabaseAuthUserAlreadyExists(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const code = String(p.error_code ?? p.code ?? "").toLowerCase();
  const msg = String(p.msg ?? p.message ?? p.error_description ?? "").toLowerCase();
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    code.includes("already_registered") ||
    code.includes("identity_already_exists")
  ) {
    return true;
  }
  if (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already") ||
    msg.includes("email address is already") ||
    msg.includes("already been registered")
  ) {
    return true;
  }
  return false;
}

export type AuthHandlers = {
  sendOtp: ReturnType<typeof asyncHandler>;
  verifyOtp: ReturnType<typeof asyncHandler>;
  signInWithPassword: ReturnType<typeof asyncHandler>;
  signUpWithPassword: ReturnType<typeof asyncHandler>;
  refreshSession: ReturnType<typeof asyncHandler>;
  logout: ReturnType<typeof asyncHandler>;
  getUser: ReturnType<typeof asyncHandler>;
  sendInvite: ReturnType<typeof asyncHandler>;
};

function isAdminRequest(req: Request, env: Env): boolean {
  if (env.ADMIN_API_SECRET && req.get("x-admin-secret") === env.ADMIN_API_SECRET) return true;
  if (env.ADMIN_UID && String(req.supabaseUser?.sub ?? "") === env.ADMIN_UID) return true;
  const role = String(req.supabaseUser?.role ?? "");
  const appRole = String(
    (req.supabaseUser as Record<string, unknown> | undefined)?.app_metadata &&
      typeof (req.supabaseUser as Record<string, unknown>).app_metadata === "object"
      ? ((req.supabaseUser as Record<string, unknown>).app_metadata as Record<string, unknown>).role ?? ""
      : "",
  );
  return role === "admin" || role === "service_role" || appRole === "admin";
}

export function createAuthHandlers(gateway: SupabaseGateway, env: Env): AuthHandlers {
  const mailer = new TransactionalEmailService(env);
  return {
    sendOtp: asyncHandler(async (req: Request, res: Response) => {
      const parsed = otpBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join("; ");
        throw new HttpError(400, msg);
      }
      const data = await gateway.sendOtp(parsed.data.email.trim());
      res.json(data);
    }),

    verifyOtp: asyncHandler(async (req: Request, res: Response) => {
      const parsed = verifyBodySchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "Invalid email or token");
      const { email, token } = parsed.data;
      const data = await gateway.verifyOtp(email.trim(), token.trim());
      res.json(data);
    }),

    signInWithPassword: asyncHandler(async (req: Request, res: Response) => {
      const parsed = passwordLoginBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join("; ");
        throw new HttpError(400, msg);
      }
      const { email, password } = parsed.data;
      const data = await gateway.signInWithPassword(email.trim(), password);
      res.json(data);
    }),

    signUpWithPassword: asyncHandler(async (req: Request, res: Response) => {
      const parsed = signUpBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join("; ");
        throw new HttpError(400, msg);
      }
      const emailTrimmed = parsed.data.email.trim();

      const authLookup = await gateway.lookupAuthUserByEmail(emailTrimmed);
      if (authLookup === "exists") {
        throw new HttpError(400, accountAlreadyExistsMessage(emailTrimmed));
      }

      const existing = rowsFromParticipantLookup(await gateway.findParticipantByEmail(emailTrimmed));
      const { password, redirect_to } = parsed.data;

      if (existing.length === 0) {
        // Admin list-users `filter` can miss emails; calling signup detects duplicates reliably.
        try {
          const data = await gateway.signUpWithPassword(emailTrimmed, password, redirect_to);
          const uid = userIdFromSignupBody(data);
          if (uid) await gateway.adminDeleteUser(uid);
          throw new HttpError(400, noTeamRegistrationMessage(emailTrimmed));
        } catch (e) {
          if (e instanceof HttpError) throw e;
          if (e instanceof UpstreamHttpError && isSupabaseAuthUserAlreadyExists(e.payload)) {
            throw new HttpError(400, accountAlreadyExistsMessage(emailTrimmed));
          }
          throw e;
        }
      }

      try {
        const data = await gateway.signUpWithPassword(emailTrimmed, password, redirect_to);
        res.json(data);
      } catch (e) {
        if (e instanceof UpstreamHttpError && isSupabaseAuthUserAlreadyExists(e.payload)) {
          throw new HttpError(400, accountAlreadyExistsMessage(emailTrimmed));
        }
        throw e;
      }
    }),

    refreshSession: asyncHandler(async (req: Request, res: Response) => {
      const parsed = refreshBodySchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "refresh_token required");
      const data = await gateway.refreshSession(parsed.data.refresh_token);
      res.json(data);
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
      const accessToken = bearerToken(req);
      if (!accessToken) throw new HttpError(401, "Authorization Bearer token required");
      await gateway.logout(accessToken);
      res.status(204).send();
    }),

    getUser: asyncHandler(async (req: Request, res: Response) => {
      const accessToken = bearerToken(req);
      if (!accessToken) throw new HttpError(401, "Authorization Bearer token required");
      const data = await gateway.getUser(accessToken);
      res.json(data);
    }),

    sendInvite: asyncHandler(async (req: Request, res: Response) => {
      if (!isAdminRequest(req, env)) throw new HttpError(403, "Admin authorization required");
      const parsed = inviteBodySchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
      const out = await mailer.sendCompetitionInvite(
        parsed.data.email.trim(),
        parsed.data.competitionName.trim(),
        parsed.data.inviteUrl.trim(),
      );
      res.json({ ok: true, ...out });
    }),
  };
}
