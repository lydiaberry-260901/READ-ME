// Loading deals for the board and the list, with filters from the page address.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { CustomerGroup } from "@/generated/prisma/enums";
import { canEdit, visibleWhere, type Actor } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { wholeDays } from "./health";

export type DealFilters = { owner: string; group: CustomerGroup | ""; health: "" | "ON_TRACK" | "AT_RISK" | "STALLED"; view: "board" | "list"; q: string };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseDealFilters(p: Params): DealFilters {
  const group = one(p.group);
  const health = one(p.health);
  return {
    owner: one(p.owner).slice(0, 40),
    group: ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER"].includes(group) ? (group as CustomerGroup) : "",
    health: ["ON_TRACK", "AT_RISK", "STALLED"].includes(health) ? (health as DealFilters["health"]) : "",
    view: one(p.view) === "list" ? "list" : "board",
    q: one(p.q).trim().slice(0, 80),
  };
}

// Closed deals stay on the board for 90 days, then only appear in the list and reports.
const CLOSED_ON_BOARD_DAYS = 90;

export function dealWhere(actor: Actor, f: DealFilters, now = new Date()): Prisma.DealWhereInput {
  const and: Prisma.DealWhereInput[] = [visibleWhere(actor)];
  if (f.owner === "me") and.push({ ownerId: actor.id });
  else if (f.owner) and.push({ ownerId: f.owner });
  if (f.group) and.push({ customerGroup: f.group });
  if (f.health) and.push({ healthFlag: f.health });
  if (f.q) and.push({ OR: [{ name: { contains: f.q, mode: "insensitive" } }, { company: { name: { contains: f.q, mode: "insensitive" } } }] });
  if (f.view === "board") {
    and.push({ OR: [{ closedAt: null }, { closedAt: { gte: new Date(now.getTime() - CLOSED_ON_BOARD_DAYS * 86_400_000) } }] });
  }
  return { AND: and };
}

export async function loadDeals(actor: Actor, f: DealFilters, now = new Date()) {
  const [pipeline, deals] = await Promise.all([
    prisma.pipeline.findFirstOrThrow({
      where: { organisationId: actor.organisationId, isDefault: true },
      include: { stages: { where: { archived: false }, orderBy: { position: "asc" } } },
    }),
    prisma.deal.findMany({
      where: dealWhere(actor, f, now),
      include: { company: { select: { name: true } }, owner: { select: { name: true } }, stage: { select: { name: true, kind: true } } },
      orderBy: [{ value: "desc" }],
      take: 1000,
    }),
  ]);
  return {
    stages: pipeline.stages.map((s) => ({ id: s.id, name: s.name, colour: s.colour, kind: s.kind })),
    deals: deals.map((d) => ({
      id: d.id,
      name: d.name,
      companyName: d.company.name,
      value: d.value,
      ownerName: d.owner.name,
      stageId: d.stageId,
      stageName: d.stage.name,
      stageKind: d.stage.kind,
      expectedClose: d.expectedCloseDate ? formatDate(d.expectedCloseDate) : null,
      daysInStage: wholeDays(d.stageEnteredAt, now) ?? 0,
      nextStep: d.nextStep,
      healthFlag: d.healthFlag,
      healthScore: d.healthScore,
      qualificationPct: d.qualificationPct,
      canMove: canEdit(actor, d, { sharedIsEditable: false }),
      daysSinceActivity: wholeDays(d.lastActivityAt, now),
      singleThreaded: Boolean(d.singleThreadedSince),
    })),
  };
}
