const DEFAULT_DEADLINE_ISO = "2026-06-10T23:59:59+02:00";
function asRecord(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    return raw;
}
export function extractDeadlineFromConfigSpelers(spelers) {
    let cfg = null;
    if (typeof spelers === "string") {
        try {
            cfg = asRecord(JSON.parse(spelers));
        }
        catch {
            cfg = null;
        }
    }
    else {
        cfg = asRecord(spelers);
    }
    const raw = cfg?.deadline;
    if (raw !== undefined) {
        const d = new Date(String(raw));
        if (!Number.isNaN(d.getTime()))
            return d;
    }
    return new Date(DEFAULT_DEADLINE_ISO);
}
/** Pool `teams` __config__ row: prefer typed columns, then legacy `spelers` JSON on the same row if present. */
export function extractDeadlineFromConfigRow(configRow) {
    if (!configRow)
        return new Date(DEFAULT_DEADLINE_ISO);
    const at = configRow.registration_deadline_at;
    if (at !== undefined && at !== null && String(at).trim()) {
        const d = new Date(String(at));
        if (!Number.isNaN(d.getTime()))
            return d;
    }
    return extractDeadlineFromConfigSpelers(configRow.spelers);
}
export function isPastCompetitionDeadline(configRow, nowMs = Date.now()) {
    const deadline = extractDeadlineFromConfigRow(configRow);
    return nowMs > deadline.getTime();
}
/** Human label: `teams.registration_deadline_label`, then legacy JSON `deadlineLabel` in `spelers`. */
export function extractDeadlineLabelFromConfigRow(configRow) {
    if (!configRow)
        return null;
    const lbl = configRow.registration_deadline_label;
    if (lbl !== undefined && lbl !== null && String(lbl).trim())
        return String(lbl).trim();
    return extractDeadlineLabelFromConfigSpelers(configRow.spelers);
}
/** @deprecated Prefer extractDeadlineLabelFromConfigRow */
export function extractDeadlineLabelFromConfigSpelers(spelers) {
    let cfg = null;
    if (typeof spelers === "string") {
        try {
            cfg = asRecord(JSON.parse(spelers));
        }
        catch {
            cfg = null;
        }
    }
    else {
        cfg = asRecord(spelers);
    }
    const raw = cfg?.deadlineLabel;
    if (raw !== undefined && raw !== null && String(raw).trim())
        return String(raw).trim();
    return null;
}
/**
 * Registration closes when the pool's scheduled start (`competitions.starts_at`) is reached.
 * If `starts_at` is unset, registration stays open.
 */
export function isRegistrationClosedByPoolStart(competition, nowMs = Date.now()) {
    if (!competition)
        return false;
    const raw = competition.starts_at;
    if (raw === undefined || raw === null || String(raw).trim() === "")
        return false;
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime()))
        return false;
    return nowMs >= d.getTime();
}
/** Other users' squads stay hidden until the pool start time (when `starts_at` is set). */
export function shouldRedactSquadsBeforePoolStart(competitionStartsAt, nowMs = Date.now()) {
    if (competitionStartsAt === undefined || competitionStartsAt === null || String(competitionStartsAt).trim() === "") {
        return false;
    }
    const d = new Date(String(competitionStartsAt));
    if (Number.isNaN(d.getTime()))
        return false;
    return nowMs < d.getTime();
}
//# sourceMappingURL=competition-deadline.js.map