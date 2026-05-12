import type { Request } from "express";
import type { Env } from "../config/env.js";
/**
 * Platform operators: cron, env `ADMIN_UID` (superadmin user), or Supabase admin/service JWT.
 * Superadmin (same UUID as frontend `NEXT_PUBLIC_SUPERADMIN_UID`) passes here when using Bearer user token.
 */
export declare function isPlatformOperator(req: Request, env: Env): boolean;
//# sourceMappingURL=platform-operator.d.ts.map