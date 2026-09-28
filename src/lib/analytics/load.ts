// Loads everything the dashboards need, following the person's access rights, then runs the
// calculations in calc.ts. Filters: date range, person and customer group.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { CustomerGroup } from "@/generated/prisma/enums";
import { visibleWhere, type Actor } from "@/lib/permissions";
import * as calc from "./calc";

export type AnalyticsFilters = { from: Date; to: Date; person: string; group: CustomerGroup | "" ; range: string };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const RANGES = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
] as const;

export function parseAnalyticsFilters(p: Params, now = new Date()): AnalyticsFilters {
  const range = RANGES.some((r) => r.value === one(p.range)) ? one(p.range) : "90";
  const group = one(p.group);
  return {
    range,
    from: new Date(now.getTime() - Number(range) * 86_400_000),
    to: now,
    person: one(p.person).slice(0, 40),
    group: ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER"].includes(group) ? (group as CustomerGroup) : "",
  };
}

/** The people whose activity this person may see: themselves, their team if a manager, everyone if an admin. */
async function visiblePeople(actor: Actor) {
  const where: Prisma.UserWhereInput = actor.role === "ADMIN" ? { organisationId: actor.organisationId } : { organisationId: actor.organisationId, id: { in: actor.visibleOwnerIds } };
  return prisma.user.findMany({ where: { ...where, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
}

export async function loadAnalytics(actor: Actor, f: AnalyticsFilters) {
  const people = (await visiblePeople(actor)).map((p) => ({ id: p.id, name: p.name ?? p.email }));
  const personIds = f.person && people.some((p) => p.id === f.person) ? [f.person] : people.map((p) => p.id);
  const inPeriod = { gte: f.from, lte: f.to };

  const dealWhere: Prisma.DealWhereInput = {
    AND: [visibleWhere(actor), { ownerId: { in: personIds } }, ...(f.group ? [{ customerGroup: f.group }] : [])],
  };
  const groupFilter = f.group ? { company: { customerGroup: f.group } } : {};

  const [pipeline, deals, moves, activities, emails, meetings, templates, drafts, news] = await Promise.all([
    prisma.pipeline.findFirstOrThrow({ where: { organisationId: actor.organisationId, isDefault: true }, include: { stages: { where: { archived: false }, orderBy: { position: "asc" } } } }),
    prisma.deal.findMany({ where: dealWhere, include: { stage: { select: { kind: true } } } }),
    prisma.dealStageHistory.findMany({ where: { movedAt: inPeriod, deal: dealWhere }, select: { fromStageId: true, toStageId: true, movedAt: true, secondsInPreviousStage: true } }),
    prisma.activity.findMany({ where: { organisationId: actor.organisationId, userId: { in: personIds }, occurredAt: inPeriod, ...groupFilter }, select: { type: true, userId: true, occurredAt: true, callResult: true } }),
    prisma.email.findMany({ where: { organisationId: actor.organisationId, userId: { in: personIds }, sentAt: inPeriod, ...groupFilter }, select: { userId: true, direction: true, sentAt: true, repliedAt: true, emailTemplateId: true, contactId: true } }),
    prisma.calendarEvent.findMany({ where: { organisationId: actor.organisationId, userId: { in: personIds }, startAt: inPeriod, cancelled: false, ...groupFilter }, select: { userId: true, startAt: true, contactId: true, companyId: true } }),
    prisma.emailTemplate.findMany({ where: { organisationId: actor.organisationId, ...(f.group ? { customerGroup: f.group } : {}) }, select: { id: true, name: true } }),
    prisma.outreachDraft.findMany({ where: { organisationId: actor.organisationId, userId: { in: personIds }, createdAt: inPeriod, kind: "EMAIL" }, select: { emailTemplateId: true } }),
    prisma.newsItem.findMany({ where: { organisationId: actor.organisationId, createdAt: inPeriod, company: { AND: [visibleWhere(actor), ...(f.group ? [{ customerGroup: f.group }] : [])] } }, select: { companyId: true, newsType: true, createdAt: true } }),
  ]);

  const stages: calc.StageInfo[] = pipeline.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, probability: s.probability, position: s.position }));
  const dealRecords: calc.DealRecord[] = deals.map((d) => ({
    id: d.id, stageId: d.stageId, stageKind: d.stage.kind, value: d.value, finalValue: d.finalValue, customerGroup: d.customerGroup,
    lossReason: d.lossReason, closedAt: d.closedAt, qualificationPct: d.qualificationPct, healthFlag: d.healthFlag, ownerId: d.ownerId,
  }));
  const open = dealRecords.filter((d) => d.stageKind === "OPEN");
  const closedInPeriod = dealRecords.filter((d) => d.stageKind !== "OPEN" && d.closedAt && d.closedAt >= f.from && d.closedAt <= f.to);
  const weeks = calc.weeksBetween(f.from, f.to);
  const shownPeople = people.filter((p) => personIds.includes(p.id));
  const pipelineRows = calc.pipelineByStage(stages, open);

  return {
    people,
    weeks,
    rates: calc.connectAndReplyRates(activities, emails),
    activityByWeek: calc.activityByWeek(weeks, activities, emails, meetings),
    activityByPerson: calc.activityByPerson(shownPeople, activities, emails, meetings),
    stageFlow: calc.stageFlow(stages, moves),
    averageDaysInStage: calc.averageDaysInStage(stages, moves),
    pipelineByStage: pipelineRows,
    openValue: pipelineRows.reduce((a, r) => a + r.value, 0),
    expectedIncome: pipelineRows.reduce((a, r) => a + r.expected, 0),
    winRateByGroup: calc.winRateByGroup(closedInPeriod),
    lossReasons: calc.lossReasons(closedInPeriod),
    healthCounts: calc.healthCounts(open),
    averageQualification: calc.averageQualification(open),
    openDeals: open.length,
    wonInPeriod: closedInPeriod.filter((d) => d.stageKind === "WON").length,
    wonValue: closedInPeriod.filter((d) => d.stageKind === "WON").reduce((a, d) => a + (d.finalValue ?? d.value), 0),
    templatePerformance: calc.templatePerformance(templates, emails, meetings, drafts),
    newsToMeetings: calc.newsToMeetings(news, meetings),
  };
}

export type Analytics = Awaited<ReturnType<typeof loadAnalytics>>;
