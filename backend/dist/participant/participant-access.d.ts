import type { JWTPayload } from "jose";
type JwtUser = JWTPayload & {
    sub?: string;
    email?: string;
};
/** Pool team row (`public.teams`); same ownership checks as legacy `deelnemers`. */
export type TeamRow = {
    user_id?: string | null;
    email?: string | null;
};
/** @deprecated Use `TeamRow` */
export type DeelnemerRow = TeamRow;
export declare function normEmail(e: unknown): string;
/**
 * Ownership: bound user_id matches JWT sub,
 * OR legacy row still unbound (email match so we can migrate user_id on write).
 */
export declare function canMutateParticipantRow(row: TeamRow, jwt: JwtUser | undefined): boolean;
/** Whether we may stamp user_id onto the row during create (same email claim as registration email). */
export declare function canAttachUserOnCreate(registrationEmail: unknown, jwt: JwtUser | undefined): boolean;
export {};
//# sourceMappingURL=participant-access.d.ts.map