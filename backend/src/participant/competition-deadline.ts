const DEFAULT_DEADLINE_ISO = "2026-06-10T23:59:59+02:00";
export const WC2026_POOL_START_ISO = "2026-06-11T18:00:00+02:00";

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

/** Pool `teams` __config__ row: prefer typed columns, then legacy `spelers` JSON on the same row if present. */
export function extractDeadlineFromConfigRow(configRow: Record<string, unknown> | null): Date {
  if (!configRow) return new Date(DEFAULT_DEADLINE_ISO);
  const at = configRow.registration_deadline_at;
  if (at !== undefined && at !== null && String(at).trim()) {
    const d = new Date(String(at));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return extractDeadlineFromConfigSpelers(configRow.spelers);
}

export function isPastCompetitionDeadline(configRow: Record<string, unknown> | null, nowMs = Date.now()): boolean {
  const deadline = extractDeadlineFromConfigRow(configRow);
  return nowMs > deadline.getTime();
}

/** Human label: `teams.registration_deadline_label`, then legacy JSON `deadlineLabel` in `spelers`. */
export function extractDeadlineLabelFromConfigRow(configRow: Record<string, unknown> | null): string | null {
  if (!configRow) return null;
  const lbl = configRow.registration_deadline_label;
  if (lbl !== undefined && lbl !== null && String(lbl).trim()) return String(lbl).trim();
  return extractDeadlineLabelFromConfigSpelers(configRow.spelers);
}

/** @deprecated Prefer extractDeadlineLabelFromConfigRow */
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
 * If `starts_at` is unset, registration stays open; writes should prevent that state.
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

/** Other users' squads stay hidden until the pool start time; missing/invalid config fails closed. */
export function shouldRedactSquadsBeforePoolStart(
  competitionStartsAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (competitionStartsAt === undefined || competitionStartsAt === null || String(competitionStartsAt).trim() === "") {
    return true;
  }
  const d = new Date(String(competitionStartsAt));
  if (Number.isNaN(d.getTime())) return true;
  return nowMs < d.getTime();
}

export function defaultPoolStartsAtForCompetition(input: {
  slug?: unknown;
  league_type?: unknown;
  season_label?: unknown;
  apiFootballSeason?: unknown;
}): string | null {
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const leagueType = typeof input.league_type === "string" ? input.league_type.trim().toLowerCase() : "";
  const label = input.season_label != null ? String(input.season_label) : "";
  const season = Number(input.apiFootballSeason);
  const isWc2026 =
    slug === "wc2026" ||
    ((leagueType === "world_cup" || leagueType.startsWith("world_cup")) &&
      (label.includes("2026") || season === 2026 || !label.trim()));
  return isWc2026 ? WC2026_POOL_START_ISO : null;
}
