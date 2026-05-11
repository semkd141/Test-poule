import { TIMEZONES } from "./locale";

export const WC2026_SCHEDULE_IANA = "Europe/Amsterdam";

function isValidIanaTimeZone(id: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

type CompetitionTzInput = {
  slug?: string;
  metadata?: Record<string, unknown>;
} | null | undefined;

/**
 * When non-null, kickoffs for this competition should be shown in this IANA zone
 * (not the user's profile timezone).
 */
export function getCompetitionScheduleTimezoneOverride(competition: CompetitionTzInput): string | null {
  if (!competition) return null;
  const raw = competition.metadata && competition.metadata.display_timezone;
  if (typeof raw === "string") {
    const id = raw.trim();
    if (id && isValidIanaTimeZone(id)) return id;
  }
  const slug = String(competition.slug || "").toLowerCase();
  if (slug === "wc2026" || slug.startsWith("wc2026-")) return WC2026_SCHEDULE_IANA;
  return null;
}

export function resolveScheduleTimezone(competition: CompetitionTzInput, userTz: string | undefined): string {
  return getCompetitionScheduleTimezoneOverride(competition) || userTz || "Europe/London";
}

export function getTimezoneBannerInfo(tz: string): {
  tz: string;
  label: string;
  short: string;
  flag: string;
} {
  const found = TIMEZONES.find(function (z) {
    return z.tz === tz;
  });
  if (found) return found;
  const tail = tz.includes("/") ? tz.split("/").pop() || tz : tz;
  return { tz, label: tail.replace(/_/g, " "), short: "", flag: "🌍" };
}
