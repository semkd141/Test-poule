import type { Request } from "express";
import type { Env } from "../config/env.js";

/** Pool creator only (`competitions.owner_user_id`). Platform-wide changes use internal/admin routes. */
export function canManageCompetition(req: Request, _env: Env, competitionRow: Record<string, unknown>): boolean {
  const uid = String(req.supabaseUser?.sub ?? "");
  const o = competitionRow.owner_user_id;
  return Boolean(uid && o != null && String(o) === uid);
}
