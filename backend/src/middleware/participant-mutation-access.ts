import type { Request, Response, NextFunction } from "express";
import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { HttpError } from "../shared/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { canMutateParticipantRow, type DeelnemerRow } from "../participant/participant-access.js";
import { isRegistrationClosedByPoolStart } from "../participant/competition-deadline.js";
import { canManageCompetition } from "../auth/can-manage-competition.js";

function isAdminJwt(req: Request, env: Env): boolean {
  const role = String(req.supabaseUser?.role ?? "");
  const appRole = String(
    (req.supabaseUser as Record<string, unknown> | undefined)?.app_metadata &&
      typeof (req.supabaseUser as Record<string, unknown>).app_metadata === "object"
      ? ((req.supabaseUser as Record<string, unknown>).app_metadata as Record<string, unknown>).role ?? ""
      : "",
  );
  return (
    (env.ADMIN_UID && String(req.supabaseUser?.sub ?? "") === env.ADMIN_UID) ||
    role === "admin" ||
    role === "service_role" ||
    appRole === "admin"
  );
}

export function participantMutationGate(gateway: SupabaseGateway, env: Env) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || typeof id !== "string") {
      next();
      return;
    }
    const row = await gateway.getParticipant(id);
    if (!row) throw new HttpError(404, "Team not found");
    req.participantRow = row;

    const adminOk = Boolean(
      env.ADMIN_API_SECRET && req.get("x-admin-secret") === env.ADMIN_API_SECRET,
    ) || isAdminJwt(req, env);

    let poolManagerOk = false;
    if (!adminOk && req.supabaseUser?.sub) {
      const cid = (row as Record<string, unknown>).competition_id;
      if (cid !== undefined && cid !== null && String(cid).trim() !== "") {
        const comp = await gateway.getCompetitionById(String(cid));
        if (comp && typeof comp === "object" && !Array.isArray(comp)) {
          poolManagerOk = canManageCompetition(req, env, comp as Record<string, unknown>);
        }
      }
    }

    const competitionId = (row as Record<string, unknown>).competition_id;
    if (
      !adminOk &&
      !poolManagerOk &&
      (req.method === "PATCH" || req.method === "DELETE") &&
      competitionId !== undefined &&
      competitionId !== null
    ) {
      const comp = await gateway.getCompetitionById(String(competitionId));
      if (isRegistrationClosedByPoolStart(comp)) {
        throw new HttpError(403, "The pool has already started. Team changes are no longer allowed.");
      }
    }

    if (!adminOk && !poolManagerOk) {
      const jwt = req.supabaseUser;
      if (!jwt?.sub) throw new HttpError(401, "Authorization Bearer token required");
      if (!canMutateParticipantRow(row as DeelnemerRow, jwt)) {
        throw new HttpError(403, "Cannot modify another participant's registration");
      }
    }

    next();
  });
}
