import type { Request, Response } from "express";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { HttpError } from "../shared/http-error.js";
import { z } from "zod";

const otpBodySchema = z.object({
  email: z.string().min(3, "email is required"),
});

const verifyBodySchema = z.object({
  email: z.string().min(3),
  token: z.string().min(1, "token is required"),
});

const refreshBodySchema = z.object({
  refresh_token: z.string().min(1, "refresh_token is required"),
});

function bearerToken(req: Request): string {
  return String(req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
}

export type AuthHandlers = {
  sendOtp: ReturnType<typeof asyncHandler>;
  verifyOtp: ReturnType<typeof asyncHandler>;
  refreshSession: ReturnType<typeof asyncHandler>;
  logout: ReturnType<typeof asyncHandler>;
  getUser: ReturnType<typeof asyncHandler>;
};

export function createAuthHandlers(gateway: SupabaseGateway): AuthHandlers {
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
  };
}
