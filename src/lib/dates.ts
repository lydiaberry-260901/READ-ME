// Date helpers that work in the Europe/London time zone.
import { TIME_ZONE } from "@/lib/format";

/** Today's date in London as yyyy-mm-dd, for date inputs. */
export function londonTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
