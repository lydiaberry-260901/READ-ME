// Data for the home page command centre. Follows the person's access rights.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { visibleWhere, type Actor } from "@/lib/permissions";
import { weekStart } from "@/lib/analytics/calc";
import { wholeDays } from "@/lib/deals/health";

const DAY = 86_400_000;

function lastWeeks(now: Date, n: number) {
  const weeks: string[] = [];
  for (let i = n - 1; i >= 0; i--) weeks.push(weekStart(new Date(now.getTime() - i * 7 * DAY)));
  return [...new Set(weeks)];
}

function londonDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

export async function loadHome(actor: Actor, now = new Date()) {
  const weeks = lastWeeks(now, 12);
  const from = new Date(`${weeks[0]}T00:00:00Z`);
  const dealVisible = visibleWhere(actor);
  const people: Prisma.ActivityWhereInput = actor.role === "ADMIN" ? {} : { userId: { in: actor.visibleOwnerIds } };

  const [pipeline, openDeals, createdDeals, wonDeals, activities, sentEmails, meetings, companies, openTasks] = await Promise.all([
    prisma.pipeline.findFirstOrThrow({ where: { organisationId: actor.organisationId, isDefault: true }, include: { stages: { where: { archived: false, kind: "OPEN" }, orderBy: { position: "asc" } } } }),
    prisma.deal.findMany({
      where: { AND: [dealVisible, { stage: { kind: "OPEN" } }] },
      include: { company: { select: { name: true } }, owner: { select: { name: true } }, stage: { select: { name: true, noActivityDays: true } } },
    }),
    prisma.deal.findMany({ where: { AND: [dealVisible, { createdAt: { gte: from } }] }, select: { createdAt: true, value: true } }),
    prisma.deal.findMany({ where: { AND: [dealVisible, { stage: { kind: "WON" } }, { closedAt: { gte: from } }] }, select: { closedAt: true, value: true, finalValue: true } }),
    prisma.activity.findMany({ where: { organisationId: actor.organisationId, occurredAt: { gte: from }, type: { in: ["CALL", "EMAIL", "MEETING"] }, ...people }, select: { occurredAt: true, type: true } }),
    prisma.email.findMany({ where: { organisationId: actor.organisationId, direction: "SENT", sentAt: { gte: from }, ...(actor.role === "ADMIN" ? {} : { userId: { in: actor.visibleOwnerIds } }) }, select: { sentAt: true } }),
    prisma.calendarEvent.findMany({ where: { organisationId: actor.organisationId, startAt: { gte: from, lte: now }, cancelled: false, ...(actor.role === "ADMIN" ? {} : { userId: { in: actor.visibleOwnerIds } }) }, select: { startAt: true } }),
    prisma.company.findMany({ where: { AND: [dealVisible, { createdAt: { gte: from } }] }, select: { createdAt: true } }),
    prisma.task.count({ where: { organisationId: actor.organisationId, assigneeId: actor.id, status: "OPEN" } }),
  ]);

  const byWeek = (dates: Date[], values?: number[]) =>
    weeks.map((w) => dates.reduce((sum, d, i) => (weekStart(d) === w ? sum + (values ? values[i] : 1) : sum), 0));

  const touchDates = [...activities.map((a) => a.occurredAt), ...sentEmails.map((e) => e.sentAt), ...meetings.map((m) => m.startAt)];

  // The last 30 days of activity, one point per day.
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) days.push(londonDay(new Date(now.getTime() - i * DAY)));
  const counts = new Map(days.map((d) => [d, 0]));
  for (const d of touchDates) {
    const key = londonDay(d);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }

  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];
  const touchesThisWeek = touchDates.filter((d) => weekStart(d) === thisWeek).length;
  const touchesLastWeek = touchDates.filter((d) => weekStart(d) === lastWeek).length;

  const funnel = pipeline.stages.map((s) => {
    const inStage = openDeals.filter((d) => d.stageId === s.id);
    return { stage: s.name, colour: s.colour, deals: inStage.length, value: inStage.reduce((a, d) => a + d.value, 0) };
  });

  const attention = openDeals
    .map((d) => ({
      id: d.id,
      name: d.name,
      company: d.company.name,
      owner: d.owner.name,
      value: d.value,
      flag: d.healthFlag,
      score: d.healthScore,
      stage: d.stage.name,
      quietDays: wholeDays(d.lastActivityAt, now),
      mine: d.ownerId === actor.id,
    }))
    .filter((d) => d.flag === "AT_RISK" || d.flag === "STALLED")
    .sort((a, b) => Number(b.mine) - Number(a.mine) || (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 6);

  return {
    weeks,
    openValue: openDeals.reduce((a, d) => a + d.value, 0),
    openCount: openDeals.length,
    health: {
      onTrack: openDeals.filter((d) => d.healthFlag === "ON_TRACK").length,
      atRisk: openDeals.filter((d) => d.healthFlag === "AT_RISK").length,
      stalled: openDeals.filter((d) => d.healthFlag === "STALLED").length,
    },
    wonValue12w: wonDeals.reduce((a, d) => a + (d.finalValue ?? d.value), 0),
    touchesThisWeek,
    touchesLastWeek,
    newCompanies12w: companies.length,
    openTasks,
    trends: {
      newPipeline: byWeek(createdDeals.map((d) => d.createdAt), createdDeals.map((d) => d.value)),
      won: byWeek(wonDeals.map((d) => d.closedAt!), wonDeals.map((d) => d.finalValue ?? d.value)),
      touches: byWeek(touchDates),
      companies: byWeek(companies.map((c) => c.createdAt)),
    },
    pulse: days.map((d) => ({ day: d, total: counts.get(d) ?? 0 })),
    funnel,
    attention,
  };
}
