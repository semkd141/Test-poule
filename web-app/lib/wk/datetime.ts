import { LANGUAGES } from "./locale";

export function nlLocalToDate(dateStr: string, timeStr: string): Date {
  const [Y,M,D] = dateStr.split("-").map(Number);
  const [h,mi] = timeStr.split(":").map(Number);
  const guess = Date.UTC(Y, M-1, D, h, mi);
  const asNL = new Date(guess).toLocaleString("en-US", { timeZone: "Europe/Amsterdam" });
  const asUTC = new Date(guess).toLocaleString("en-US", { timeZone: "UTC" });
  const diff = new Date(asNL).getTime() - new Date(asUTC).getTime();
  return new Date(guess - diff);
}

export function formatDateLocalized(
  dateStr: string,
  timeStr: string,
  lang: string,
  tz: string | undefined,
): { dateLabel: string; timeLabel: string; dateObj: Date } {
  const d = nlLocalToDate(dateStr, timeStr);
  const useTz = tz || (LANGUAGES.find(function(l){ return l.code === lang; }) || LANGUAGES[0]).tz;
  const dateFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : lang, {
    timeZone: useTz, weekday: "short", day: "2-digit", month: "short"
  });
  const timeFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : lang, {
    timeZone: useTz, hour: "2-digit", minute: "2-digit", hour12: false
  });
  return { dateLabel: dateFmt.format(d), timeLabel: timeFmt.format(d), dateObj: d };
}
