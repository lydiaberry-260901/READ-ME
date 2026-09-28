import Link from "next/link";
import clsx from "clsx";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, formatTime } from "@/lib/format";
import { addDays, isoDay, startOfLondonDay } from "@/lib/calendar-view";
import { chartPalette, colours } from "@/design/tokens";
import { AnimatedNumber } from "@/components/motion";
import { Ring } from "@/components/visuals";
import { EmptyState } from "@/components/ui";
import { NewTaskForm } from "./NewTaskForm";
import { CheckSuggestions } from "./CheckSuggestions";
import { cancelTask, completeTask, setMorningSummary, snoozeTask } from "./actions";

export const metadata = { title: "Today" };

const typeLabels = { CALL: "Call", EMAIL: "Email", FOLLOW_UP: "Follow up", RESEARCH: "Research", MEETING: "Meeting", OTHER: "Other" } as const;
const originLabels = { MANUAL: "Added by you", RULE: "Daily list", NEWS: "From news", TRANSCRIPT: "From a call", SYSTEM: "Automatic" } as const;
const priorityStyles = {
  HIGH: { label: "High", className: "border-red/40 text-red-text" },
  MEDIUM: { label: "Medium", className: "border-amber/50 text-amber-text" },
  LOW: { label: "Low", className: "border-line-strong text-fg-muted" },
} as const;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const p = await searchParams;
  const requested = one(p.person);
  const person = requested && (user.role === "ADMIN" || user.visibleOwnerIds.includes(requested)) ? requested : user.id;
  const now = new Date();
  const today = isoDay(now);
  const startToday = startOfLondonDay(today);
  const startTomorrow = startOfLondonDay(addDays(today, 1));
  const inAWeek = startOfLondonDay(addDays(today, 8));

  const [tasks, doneToday, people, me] = await Promise.all([
    prisma.task.findMany({
      where: { organisationId: user.organisationId, assigneeId: person, status: { in: ["OPEN", "SNOOZED"] } },
      include: { contact: { select: { id: true, firstName: true, lastName: true } }, deal: { select: { id: true, name: true } }, company: { select: { id: true, name: true } } },
      orderBy: [{ dueAt: "asc" }],
      take: 300,
    }),
    prisma.task.count({ where: { organisationId: user.organisationId, assigneeId: person, status: "DONE", completedAt: { gte: startToday } } }),
    user.role === "REP" ? Promise.resolve([]) : prisma.user.findMany({ where: { organisationId: user.organisationId, active: true, ...(user.role === "ADMIN" ? {} : { id: { in: user.visibleOwnerIds } }) }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { morningSummary: true } }),
  ]);

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const open = tasks.filter((t) => t.status === "OPEN" || (t.snoozedUntil && t.snoozedUntil <= now));
  const byPriority = (a: (typeof tasks)[number], b: (typeof tasks)[number]) => rank[a.priority] - rank[b.priority] || (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
  const overdue = open.filter((t) => t.dueAt && t.dueAt < startToday).sort(byPriority);
  const dueToday = open.filter((t) => !t.dueAt || (t.dueAt >= startToday && t.dueAt < startTomorrow)).sort(byPriority);
  const upcoming = open.filter((t) => t.dueAt && t.dueAt >= startTomorrow && t.dueAt < inAWeek).sort(byPriority);
  const later = open.filter((t) => t.dueAt && t.dueAt >= inAWeek);
  const snoozed = tasks.filter((t) => t.status === "SNOOZED" && (!t.snoozedUntil || t.snoozedUntil > now));
  const mine = person === user.id;
  const todayTotal = overdue.length + dueToday.length + doneToday;

  function TaskRow({ t }: { t: (typeof tasks)[number] }) {
    const late = t.dueAt && t.dueAt < startToday;
    return (
      <li className="grid gap-3 px-5 py-4 lg:grid-cols-[auto_1fr_auto]">
        <form action={completeTask} className="pt-0.5">
          <input type="hidden" name="id" value={t.id} />
          <button type="submit" aria-label={`Mark "${t.title}" as done`} className="grid size-5 place-items-center rounded-full border-2 border-line-strong hover:border-green-text hover:bg-green-tint" />
        </form>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{t.title}</p>
            <span className={clsx("rounded border px-1.5 py-0.5 text-[11px]", priorityStyles[t.priority].className)}>{priorityStyles[t.priority].label}</span>
            <span className="text-xs text-fg-muted">{typeLabels[t.type]}, {originLabels[t.origin]}</span>
          </div>
          {t.reason ? <p className="mt-1 text-sm text-fg-muted"><span className="text-fg">Why: </span>{t.reason}</p> : null}
          {t.suggestedAction ? <p className="mt-1 text-sm text-fg-muted"><span className="text-fg">Suggested: </span>{t.suggestedAction}</p> : null}
          {t.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{t.description}</p> : null}
          {t.draftMessage ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-green-text">Show the draft message</summary>
              <p className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-canvas-deep p-3 text-fg-muted">{t.draftMessage}</p>
            </details>
          ) : null}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {t.deal ? <Link href={`/deals/${t.deal.id}`}>{t.deal.name}</Link> : null}
            {t.contact ? <Link href={`/contacts/${t.contact.id}`}>{t.contact.firstName} {t.contact.lastName}</Link> : null}
            {t.company && !t.deal ? <Link href={`/companies/${t.company.id}`}>{t.company.name}</Link> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-end">
          <span className={clsx("text-xs tabular-nums", late ? "text-red-text" : "text-fg-muted")}>
            {t.dueAt ? `${late ? "Was due" : "Due"} ${formatDate(t.dueAt)} ${formatTime(t.dueAt)}` : "No due date"}
          </span>
          <div className="flex gap-1">
            {[1, 3, 7].map((d) => (
              <form key={d} action={snoozeTask}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="days" value={d} />
                <button type="submit" className="rounded border border-line px-2 py-1 text-xs text-fg-muted hover:border-line-strong hover:text-fg" title={`Snooze until ${d === 1 ? "tomorrow" : `${d} days from now`} at 08:00`}>
                  {d === 1 ? "Tomorrow" : d === 3 ? "3 days" : "Next week"}
                </button>
              </form>
            ))}
            <form action={cancelTask}>
              <input type="hidden" name="id" value={t.id} />
              <button type="submit" className="rounded px-2 py-1 text-xs text-fg-muted hover:text-red-text" aria-label={`Remove "${t.title}"`}>Remove</button>
            </form>
          </div>
        </div>
      </li>
    );
  }

  function Section({ title, list, tone }: { title: string; list: typeof tasks; tone?: "red" }) {
    if (list.length === 0) return null;
    return (
      <section className="rounded-lg border border-line bg-panel" aria-label={title}>
        <h2 className={clsx("flex items-center justify-between border-b border-line px-5 py-3 text-sm font-semibold", tone === "red" && "text-red-text")}>
          {title}
          <span className="text-xs font-normal text-fg-muted">{list.length}</span>
        </h2>
        <ul className="divide-y divide-line">{list.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {mine ? "Your tasks." : `Tasks for ${people.find((x) => x.id === person)?.name ?? "this person"}.`} A new list is built at 07:00 every weekday, and nothing is ever added twice.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {people.length > 1 ? (
            <form method="get" className="flex gap-2">
              <label htmlFor="t-person" className="sr-only">Person</label>
              <select id="t-person" name="person" defaultValue={person} className="field w-auto py-1.5">
                {people.map((x) => <option key={x.id} value={x.id}>{x.id === user.id ? "Me" : x.name ?? x.email}</option>)}
              </select>
              <button type="submit" className="btn btn-secondary py-1.5">Show</button>
            </form>
          ) : null}
          <a href="/api/export/tasks" className="btn btn-secondary py-1.5 no-underline">Download CSV</a>
        </div>
      </header>

      <section aria-label="Today at a glance" className="grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="bg-panel px-5 py-4">
          <Ring
            size={112}
            thickness={12}
            centre={<><AnimatedNumber value={doneToday} /><span className="text-sm text-fg-muted">/{todayTotal}</span></>}
            centreLabel="done today"
            parts={[
              { label: "Done today", value: doneToday, colour: colours.greenText },
              { label: "Due today", value: dueToday.length, colour: chartPalette[0] },
              { label: "Overdue", value: overdue.length, colour: colours.redText },
            ]}
          />
        </div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Due today</p><p className="mt-1 text-3xl font-semibold"><AnimatedNumber value={dueToday.length} /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Overdue</p><p className={clsx("mt-1 text-3xl font-semibold", overdue.length && "text-red-text")}><AnimatedNumber value={overdue.length} /></p></div>
        <div className="bg-panel px-5 py-4">
          <p className="text-xs text-fg-muted">Morning summary email</p>
          <p className="mt-1 text-sm">{me.morningSummary ? "On: your list arrives by email at 07:00 on weekdays." : "Off."}</p>
          {mine ? (
            <form action={setMorningSummary} className="mt-2">
              <input type="hidden" name="on" value={String(!me.morningSummary)} />
              <button type="submit" className="btn btn-secondary px-3 py-1 text-xs">{me.morningSummary ? "Switch off" : "Switch on"}</button>
            </form>
          ) : null}
        </div>
      </section>

      {mine ? (
        <div className="flex flex-wrap items-start gap-3">
          <NewTaskForm today={today} />
          <CheckSuggestions />
        </div>
      ) : null}

      {open.length === 0 && snoozed.length === 0 ? (
        <EmptyState title="Nothing to do">New tasks appear here each weekday morning, and when you add your own.</EmptyState>
      ) : null}
      <Section title="Overdue" list={overdue} tone="red" />
      <Section title="Today" list={dueToday} />
      <Section title="Next 7 days" list={upcoming} />
      <Section title="Later" list={later} />
      <Section title="Snoozed" list={snoozed} />
    </div>
  );
}
