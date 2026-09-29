// Requests from people about their data: to see it, correct it, delete it, limit its use, object
// to it, or receive a copy. Each must be answered within one calendar month of being received.
import type { DataRequestStatus, DataRequestType } from "@/generated/prisma/enums";
import { isoDay, londonParts, startOfLondonDay, addDays } from "@/lib/calendar-view";

export const requestTypeLabels: Record<DataRequestType, string> = {
  ACCESS: "See their data",
  RECTIFICATION: "Correct their data",
  ERASURE: "Delete their data",
  RESTRICTION: "Limit the use of their data",
  OBJECTION: "Object to the use of their data",
  PORTABILITY: "Receive a copy in a usable format",
};

export const requestTypeHelp: Record<DataRequestType, string> = {
  ACCESS: "Send them one file with everything we hold about them. Use Download their data below.",
  RECTIFICATION: "Correct the details on their contact record, then note what was changed.",
  ERASURE: "Delete their details. A minimal entry can stay on the do not contact list so they are never contacted again.",
  RESTRICTION: "Mark their details as limited. Nobody can contact them while this is on.",
  OBJECTION: "Stop using their details for marketing straight away. They are added to the do not contact list.",
  PORTABILITY: "Send them their data as a file other systems can read. Use Download their data below (it is in JSON format).",
};

export const requestStatusLabels: Record<DataRequestStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  REFUSED: "Refused",
};

/** Last day of a month, for a year and month number (1 to 12). */
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * The deadline for a request: the same date in the following month(s), or the last day of that
 * month if there is no such date (a request on 31 January is due on 28 or 29 February). If that
 * falls on a weekend, the deadline moves to the next working day. Bank holidays are not counted,
 * so check those by hand.
 */
export function requestDeadline(receivedAt: Date, months = 1): Date {
  const p = londonParts(receivedAt);
  let y = p.y;
  let m = p.m + months;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const day = Math.min(p.d, lastDay(y, m));
  let due = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  while ([5, 6].includes(londonParts(new Date(`${due}T12:00:00Z`)).weekday)) due = addDays(due, 1);
  // The end of that day in London.
  return new Date(startOfLondonDay(addDays(due, 1)).getTime() - 1000);
}

/** Whole days left until the deadline (negative when overdue), counting London calendar days. */
export function daysLeft(dueAt: Date, now = new Date()) {
  const a = new Date(`${isoDay(now)}T12:00:00Z`).getTime();
  const b = new Date(`${isoDay(dueAt)}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export const effectiveDue = (r: { dueAt: Date; extendedDueAt: Date | null }) => r.extendedDueAt ?? r.dueAt;
export const isOpenRequest = (status: DataRequestStatus) => status === "OPEN" || status === "IN_PROGRESS";
