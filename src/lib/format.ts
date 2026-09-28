// Formatting for dates, times and money. Dates as day/month/year, 24 hour clock,
// pounds, and always in the Europe/London time zone whatever the server's own setting.

export const TIME_ZONE = "Europe/London";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const longDateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const poundsFmt = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

type DateLike = Date | string | number | null | undefined;

function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 28/09/2026 */
export function formatDate(value: DateLike, empty = "Not set"): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : empty;
}

/** 14:05 */
export function formatTime(value: DateLike, empty = ""): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : empty;
}

/** 28/09/2026 14:05 */
export function formatDateTime(value: DateLike, empty = "Not set"): string {
  const d = toDate(value);
  return d ? `${dateFmt.format(d)} ${timeFmt.format(d)}` : empty;
}

/** Monday 28 September 2026 */
export function formatLongDate(value: DateLike, empty = ""): string {
  const d = toDate(value);
  return d ? longDateFmt.format(d) : empty;
}

/** £12,500 */
export function formatPounds(value: number | null | undefined, empty = "£0"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return empty;
  return poundsFmt.format(value);
}

/** Whole days between two moments, never negative. */
export function daysBetween(from: DateLike, to: DateLike = new Date()): number {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}
