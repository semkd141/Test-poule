export declare function extractDeadlineFromConfigSpelers(spelers: unknown): Date;
/** Pool `teams` __config__ row: prefer typed columns, then legacy `spelers` JSON on the same row if present. */
export declare function extractDeadlineFromConfigRow(configRow: Record<string, unknown> | null): Date;
export declare function isPastCompetitionDeadline(configRow: Record<string, unknown> | null, nowMs?: number): boolean;
/** Human label: `teams.registration_deadline_label`, then legacy JSON `deadlineLabel` in `spelers`. */
export declare function extractDeadlineLabelFromConfigRow(configRow: Record<string, unknown> | null): string | null;
/** @deprecated Prefer extractDeadlineLabelFromConfigRow */
export declare function extractDeadlineLabelFromConfigSpelers(spelers: unknown): string | null;
/**
 * Registration closes when the pool's scheduled start (`competitions.starts_at`) is reached.
 * If `starts_at` is unset, registration stays open.
 */
export declare function isRegistrationClosedByPoolStart(competition: Record<string, unknown> | null, nowMs?: number): boolean;
/** Other users' squads stay hidden until the pool start time (when `starts_at` is set). */
export declare function shouldRedactSquadsBeforePoolStart(competitionStartsAt: string | null | undefined, nowMs?: number): boolean;
//# sourceMappingURL=competition-deadline.d.ts.map