import type { Request } from "express";
import type { Env } from "../config/env.js";
import { isPlatformOperator } from "./platform-operator.js";

/** Owner of the competition, or platform operator (same as my-competitions routes). */
export function canManageCompetition(req: Request, env: Env, competitionRow: Record<string, unknown>): boolean {
  if (isPlatformOperator(req, env)) return true;
  const uid = String(req.supabaseUser?.sub ?? "");
  const o = competitionRow.owner_user_id;
  return Boolean(uid && o != null && String(o) === uid);
}
