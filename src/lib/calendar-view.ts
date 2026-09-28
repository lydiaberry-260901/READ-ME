// Helpers for the calendar page: London dates, ranges for each view, and positions in the day.
import { TIME_ZONE } from "@/lib/format";

export type CalendarView = "day" | "week" | "month";

const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function londonParts(d: Date) {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAYS.indexOf(p.weekday) };
}

/** yyyy-mm-dd for a date in London. */
export function isoDay(d: Date) {
  const p = londonParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Adds whole days to a yyyy-mm-dd date. */
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(day: string) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** The first moment of a London day, as a real point in time (handles British Summer Time). */
export function startOfLondonDay(day: string) {
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const p = londonParts(noonUtc);
  const offsetHours = p.hour - 12; // 1 in summer, 0 in winter
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), -offsetHours, 0, 0));
}

export function rangeFor(view: CalendarView, day: string) {
  if (view === "day") return { days: [day], from: startOfLondonDay(day), to: startOfLondonDay(addDays(day, 1)) };
  if (view === "week") {
    const mon = mondayOf(day);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    return { days, from: startOfLondonDay(mon), to: startOfLondonDay(addDays(mon, 7)) };
  }
  const first = `${day.slice(0, 8)}01`;
  const gridStart = mondayOf(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return { days, from: startOfLondonDay(gridStart), to: startOfLondonDay(addDays(gridStart, 42)) };
}

export function shiftDay(view: CalendarView, day: string, direction: 1 | -1) {
  if (view === "day") return addDays(day, direction);
  if (view === "week") return addDays(day, 7 * direction);
  const d = new Date(`${day.slice(0, 8)}15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return d.toISOString().slice(0, 10);
}

/** Minutes after midnight in London. */
export function minutesOfDay(d: Date) {
  const p = londonParts(d);
  return p.hour * 60 + p.minute;
}
