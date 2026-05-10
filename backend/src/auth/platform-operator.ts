import type { Request } from "express";
import type { Env } from "../config/env.js";

/**
 * Platform operators: cron, env `ADMIN_UID` (superadmin user), or Supabase admin/service JWT.
 * Superadmin (same UUID as frontend `NEXT_PUBLIC_SUPERADMIN_UID`) passes here when using Bearer user token.
 */
export function isPlatformOperator(req: Request, env: Env): boolean {
  if (env.CRON_SECRET && req.get("x-cron-secret") === env.CRON_SECRET) return true;
  if (env.ADMIN_UID && String(req.supabaseUser?.sub ?? "") === env.ADMIN_UID) return true;
  const role = String(req.supabaseUser?.role ?? "");
  const appRole = String(
    (req.supabaseUser as Record<string, unknown> | undefined)?.app_metadata &&
      typeof (req.supabaseUser as Record<string, unknown>).app_metadata === "object"
      ? ((req.supabaseUser as Record<string, unknown>).app_metadata as Record<string, unknown>).role ?? ""
      : "",
  );
  return role === "service_role" || role === "admin" || appRole === "admin";
}
