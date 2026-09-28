import Link from "next/link";
import clsx from "clsx";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatLongDate, formatTime } from "@/lib/format";
import { addDays, isoDay, minutesOfDay, rangeFor, shiftDay, type CalendarView } from "@/lib/calendar-view";
import { chartPalette, colours } from "@/design/tokens";

export const metadata = { title: "Calendar" };

const DAY_START = 7 * 60; // 07:00
const DAY_END = 20 * 60; // 20:00
const HOUR_PX = 52;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Item = { id: string; kind: "meeting" | "task" | "follow_up"; title: string; start: Date; end: Date | null; allDay: boolean; href: string | null; detail: string | null };

const kindColour = { meeting: chartPalette[0], task: colours.fgMuted, follow_up: colours.amber };
const kindLabel = { meeting: "Meeting", task: "Task due", follow_up: "Follow up" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const p = await searchParams;
  const view: CalendarView = (["day", "week", "month"] as const).includes(one(p.view) as never) ? (one(p.view) as CalendarView) : "week";
  const today = isoDay(new Date());
  const day = /^\d{4}-\d{2}-\d{2}$/.test(one(p.date)) ? one(p.date) : today;
  const { days, from, to } = rangeFor(view, day);

  const [events, tasks, connected] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { organisationId: user.organisationId, userId: user.id, cancelled: false, startAt: { lt: to }, endAt: { gt: from } },
      include: { contact: { select: { firstName: true, lastName: true } }, deal: { select: { id: true, name: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.task.findMany({ where: { organisationId: user.organisationId, assigneeId: user.id, status: { in: ["OPEN", "SNOOZED"] }, dueAt: { gte: from, lt: to } }, orderBy: { dueAt: "asc" } }),
    prisma.calendarAccount.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);

  const items: Item[] = [
    ...events.map((e) => ({
      id: e.id,
      kind: "meeting" as const,
      title: e.title,
      start: e.startAt,
      end: e.endAt,
      allDay: e.allDay,
      href: e.deal ? `/deals/${e.deal.id}` : e.meetingUrl,
      detail: [e.contact ? `${e.contact.firstName} ${e.contact.lastName ?? ""}`.trim() : null, e.location].filter(Boolean).join(", ") || null,
    })),
    ...tasks.map((t) => ({ id: t.id, kind: t.type === "FOLLOW_UP" ? ("follow_up" as const) : ("task" as const), title: t.title, start: t.dueAt!, end: null, allDay: true, href: null, detail: t.reason })),
  ];
  const byDay = new Map(days.map((d) => [d, items.filter((i) => isoDay(i.start) === d)]));

  const title =
    view === "month" ? `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
      : view === "week" ? `Week starting ${formatLongDate(new Date(`${days[0]}T12:00:00Z`))}`
        : formatLongDate(new Date(`${day}T12:00:00Z`));
  const link = (v: CalendarView, d: string) => `/calendar?view=${v}&date=${d}`;
  const nowMinutes = minutesOfDay(new Date());

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="mt-1 text-sm text-fg-muted">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Calendar view" className="inline-flex rounded-md border border-line p-0.5 text-sm">
            {(["day", "week", "month"] as const).map((v) => (
              <Link key={v} href={link(v, day)} aria-current={view === v ? "page" : undefined} className={clsx("rounded px-3 py-1.5 font-medium no-underline", view === v ? "bg-fg text-canvas" : "text-fg hover:bg-panel-raised")}>
                {v === "day" ? "Day" : v === "week" ? "Week" : "Month"}
              </Link>
            ))}
          </nav>
          <Link href={link(view, shiftDay(view, day, -1))} className="btn btn-secondary py-1.5 no-underline" aria-label="Previous">Previous</Link>
          <Link href={link(view, today)} className="btn btn-secondary py-1.5 no-underline">Today</Link>
          <Link href={link(view, shiftDay(view, day, 1))} className="btn btn-secondary py-1.5 no-underline" aria-label="Next">Next</Link>
          <Link href="/calendar/new" className="btn btn-primary py-1.5 no-underline">Book a meeting</Link>
        </div>
      </header>

      {!connected ? (
        <p className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-fg-muted">
          Your calendar is not connected, so only meetings booked in the CRM and your tasks are shown. <Link href="/settings/connections">Connect your calendar</Link>.
        </p>
      ) : null}

      <ul className="flex flex-wrap gap-4 text-xs text-fg-muted" aria-label="Key">
        {(Object.keys(kindLabel) as Item["kind"][]).map((k) => (
          <li key={k} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: kindColour[k] }} />{kindLabel[k]}</li>
        ))}
      </ul>

      {view === "month" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {WEEKDAY_NAMES.map((w) => <div key={w} className="bg-panel-sunk px-3 py-2 text-xs font-medium text-fg-muted">{w}</div>)}
            {days.map((d) => {
              const inMonth = d.slice(0, 7) === day.slice(0, 7);
              const list = byDay.get(d) ?? [];
              return (
                <div key={d} className={clsx("min-h-28 bg-panel p-2", !inMonth && "bg-panel-sunk opacity-60")}>
                  <Link href={link("day", d)} className={clsx("inline-grid size-6 place-items-center rounded-full text-xs no-underline", d === today ? "bg-green text-white" : "text-fg")}>
                    {Number(d.slice(8, 10))}
                  </Link>
                  <ul className="mt-1 grid gap-1">
                    {list.slice(0, 3).map((i) => (
                      <li key={i.id} className="flex items-center gap-1.5 truncate text-xs">
                        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: kindColour[i.kind] }} />
                        <span className="truncate">{i.allDay ? "" : `${formatTime(i.start)} `}{i.title}</span>
                      </li>
                    ))}
                    {list.length > 3 ? <li className="text-xs text-fg-muted">{list.length - 3} more</li> : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <div className={clsx("grid", view === "week" ? "min-w-[900px] grid-cols-[4rem_repeat(7,1fr)]" : "grid-cols-[4rem_1fr]")}>
            <div className="border-b border-line" />
            {days.map((d) => (
              <div key={d} className="border-b border-l border-line px-3 py-2">
                <Link href={link("day", d)} className="text-sm font-medium text-fg no-underline">
                  {WEEKDAY_NAMES[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]}{" "}
                  <span className={clsx("ml-1 inline-grid size-6 place-items-center rounded-full", d === today && "bg-green text-white")}>{Number(d.slice(8, 10))}</span>
                </Link>
                <ul className="mt-1 grid gap-1">
                  {(byDay.get(d) ?? []).filter((i) => i.allDay).map((i) => (
                    <li key={i.id} className="truncate rounded px-1.5 py-0.5 text-xs" style={{ background: `${kindColour[i.kind]}33`, borderLeft: `3px solid ${kindColour[i.kind]}` }} title={i.detail ?? undefined}>
                      {i.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="relative" style={{ height: ((DAY_END - DAY_START) / 60) * HOUR_PX }}>
              {Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-fg-muted" style={{ top: h * HOUR_PX }}>
                  {h === 0 ? "" : `${String(7 + h).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            {days.map((d) => (
              <div key={d} className="relative border-l border-line" style={{ height: ((DAY_END - DAY_START) / 60) * HOUR_PX }}>
                {Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/60" style={{ top: h * HOUR_PX }} />
                ))}
                {d === today && nowMinutes >= DAY_START && nowMinutes <= DAY_END ? (
                  <div className="absolute inset-x-0 z-10 border-t-2 border-green-text" style={{ top: ((nowMinutes - DAY_START) / 60) * HOUR_PX }} aria-label="Now">
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-green-text" />
                  </div>
                ) : null}
                {(byDay.get(d) ?? []).filter((i) => !i.allDay).map((i) => {
                  const start = Math.max(DAY_START, minutesOfDay(i.start));
                  const end = Math.min(DAY_END, i.end ? minutesOfDay(i.end) : start + 30);
                  const top = ((start - DAY_START) / 60) * HOUR_PX;
                  const height = Math.max(22, ((end - start) / 60) * HOUR_PX - 2);
                  const body = (
                    <>
                      <p className="truncate font-medium">{i.title}</p>
                      <p className="truncate text-fg-muted">{formatTime(i.start)}{i.end ? ` to ${formatTime(i.end)}` : ""}{i.detail ? `, ${i.detail}` : ""}</p>
                    </>
                  );
                  return (
                    <div
                      key={i.id}
                      className="absolute inset-x-1 overflow-hidden rounded px-2 py-1 text-xs"
                      style={{ top, height, background: `${kindColour[i.kind]}2e`, borderLeft: `3px solid ${kindColour[i.kind]}` }}
                    >
                      {i.href ? <a href={i.href} className="block text-fg no-underline hover:underline">{body}</a> : body}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-fg-muted">Times are London time. The day view shows 07:00 to 20:00. <Link href={link(view === "month" ? "week" : view, addDays(today, 0))}>Back to today</Link></p>
    </div>
  );
}
