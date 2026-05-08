import type { Request, Response, NextFunction } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { canMutateParticipantRow, type DeelnemerRow } from "../participant/participant-access.js";
import { isPastCompetitionDeadline } from "../participant/competition-deadline.js";

export function participantMutationGate(gateway: SupabaseGateway, env: Env) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== "string") {
      next();
      return;
    }
    const row = await gateway.getParticipant(id);
    if (!row) throw new HttpError(404, "Participant not found");
    req.participantRow = row;

    const adminOk = Boolean(
      env.ADMIN_API_SECRET && req.get("x-admin-secret") === env.ADMIN_API_SECRET,
    );

    const competitionId = (row as Record<string, unknown>).competition_id;
    if (!adminOk && (req.method === "PATCH" || req.method === "DELETE") && competitionId !== undefined && competitionId !== null) {
      const cfgRow = await gateway.getCompetitionConfigRow(String(competitionId));
      if (isPastCompetitionDeadline(cfgRow)) {
        throw new HttpError(403, "Registration deadline has passed. Team mutations are read-only.");
      }
    }

    if (!adminOk) {
      const jwt = req.supabaseUser;
      if (!jwt?.sub) throw new HttpError(401, "Authorization Bearer token required");
      if (!canMutateParticipantRow(row as DeelnemerRow, jwt)) {
        throw new HttpError(403, "Cannot modify another participant's registration");
      }
    }

    next();
  });
}
