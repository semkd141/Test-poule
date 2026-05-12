import type { Request } from "express";
import type { Env } from "../config/env.js";
/** Pool creator only (`competitions.owner_user_id`). Platform-wide changes use internal/admin routes. */
export declare function canManageCompetition(req: Request, _env: Env, competitionRow: Record<string, unknown>): boolean;
//# sourceMappingURL=can-manage-competition.d.ts.map