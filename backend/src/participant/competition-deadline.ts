const DEFAULT_DEADLINE_ISO = "2026-06-10T23:59:59+02:00";

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export function extractDeadlineFromConfigSpelers(spelers: unknown): Date {
  let cfg: Record<string, unknown> | null = null;
  if (typeof spelers === "string") {
    try {
      cfg = asRecord(JSON.parse(spelers));
    } catch {
      cfg = null;
    }
  } else {
    cfg = asRecord(spelers);
  }
  const raw = cfg?.deadline;
  if (raw !== undefined) {
    const d = new Date(String(raw));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(DEFAULT_DEADLINE_ISO);
}

export function isPastCompetitionDeadline(configRow: Record<string, unknown> | null, nowMs = Date.now()): boolean {
  const deadline = extractDeadlineFromConfigSpelers(configRow?.spelers);
  return nowMs > deadline.getTime();
}

/** Human label from the `__config__` row `spelers` JSON (`deadlineLabel`), if set. */
export function extractDeadlineLabelFromConfigSpelers(spelers: unknown): string | null {
  let cfg: Record<string, unknown> | null = null;
  if (typeof spelers === "string") {
    try {
      cfg = asRecord(JSON.parse(spelers));
    } catch {
      cfg = null;
    }
  } else {
    cfg = asRecord(spelers);
  }
  const raw = cfg?.deadlineLabel;
  if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim();
  return null;
}

/**
 * Registration closes when the pool's scheduled start (`competitions.starts_at`) is reached.
 * If `starts_at` is unset, registration stays open.
 */
export function isRegistrationClosedByPoolStart(
  competition: Record<string, unknown> | null,
  nowMs = Date.now(),
): boolean {
  if (!competition) return false;
  const raw = competition.starts_at;
  if (raw === undefined || raw === null || String(raw).trim() === "") return false;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return false;
  return nowMs >= d.getTime();
}

/** Other users' squads stay hidden until the pool start time (when `starts_at` is set). */
export function shouldRedactSquadsBeforePoolStart(
  competitionStartsAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (competitionStartsAt === undefined || competitionStartsAt === null || String(competitionStartsAt).trim() === "") {
    return false;
  }
  const d = new Date(String(competitionStartsAt));
  if (Number.isNaN(d.getTime())) return false;
  return nowMs < d.getTime();
}
