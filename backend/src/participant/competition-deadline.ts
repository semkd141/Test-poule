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
