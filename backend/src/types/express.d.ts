import type { JWTPayload } from "jose";

declare global {
  namespace Express {
    interface Request {
      /** Populated after optional/required Bearer JWT verification. */
      supabaseUser?: JWTPayload & { sub?: string; email?: string };
      /** Loaded before PATCH / DELETE handlers for participant mutations. */
      participantRow?: Record<string, unknown>;
    }
  }
}

export {};
