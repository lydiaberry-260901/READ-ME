// Recalculates deal health and single threaded warnings. Runs whenever a deal changes,
// and every morning for every open deal.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { calculateHealth, singleThreadedState, wholeDays } from "./health";

type Db = Prisma.TransactionClient | typeof prisma;

/** Average days deals spend in each stage, from the last year of stage moves. */
export async function averageDaysByStage(organisationId: string, db: Db = prisma): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ stage_id: string; avg_seconds: number }[]>`
    SELECT h."fromStageId" AS stage_id, avg(h."secondsInPreviousStage")::float AS avg_seconds
    FROM "DealStageHistory" h
    JOIN "Deal" d ON d.id = h."dealId"
    WHERE d."organisationId" = ${organisationId}
      AND h."fromStageId" IS NOT NULL
      AND h."secondsInPreviousStage" IS NOT NULL
      AND h."movedAt" > now() - interval '365 days'
    GROUP BY h."fromStageId"
    HAVING count(*) >= 3`;
  return new Map(rows.map((r) => [r.stage_id, r.avg_seconds / 86_400]));
}

export async function recalculateDeal(dealId: string, opts: { now?: Date; averages?: Map<string, number>; db?: Db } = {}) {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: {
      stage: true,
      organisation: { select: { singleThreadedDays: true } },
      contacts: { where: { engaged: true }, select: { id: true } },
      company: { select: { name: true } },
    },
  });
  if (!deal) return null;
  const averages = opts.averages ?? (await averageDaysByStage(deal.organisationId, db));
  const isOpen = deal.stage.kind === "OPEN";
  const engaged = deal.contacts.length;

  const health = calculateHealth({
    qualificationPct: deal.qualificationPct,
    engagedStakeholders: engaged,
    daysInStage: wholeDays(deal.stageEnteredAt, now) ?? 0,
    averageDaysInStage: averages.get(deal.stageId) ?? null,
    daysSinceActivity: wholeDays(deal.lastActivityAt, now),
    noActivityDays: deal.stage.noActivityDays,
  });

  const single = singleThreadedState({
    engagedStakeholders: engaged,
    isOpen,
    singleThreadedSince: deal.singleThreadedSince,
    thresholdDays: deal.organisation.singleThreadedDays,
    now,
  });

  const data: Prisma.DealUpdateInput = {
    // Closed deals keep no health flag: the result is known.
    healthScore: isOpen ? health.score : null,
    healthFlag: isOpen ? health.flag : null,
    healthCalculatedAt: now,
    singleThreadedSince: single.since,
  };
  const newFlag = isOpen ? health.flag : null;
  if (newFlag !== deal.healthFlag) data.healthFlagChangedAt = now;
  if (!single.since) data.singleThreadedWarnedAt = null;

  // Warn once per single threaded spell, with a task for the owner. The stable key means
  // running this again never creates a second task.
  if (single.warn && single.since && !deal.singleThreadedWarnedAt) {
    const key = `single-threaded:${deal.id}:${single.since.toISOString().slice(0, 10)}`;
    await db.task.upsert({
      where: { organisationId_dedupeKey: { organisationId: deal.organisationId, dedupeKey: key } },
      update: {},
      create: {
        organisationId: deal.organisationId,
        assigneeId: deal.ownerId,
        title: `Bring another contact into ${deal.name}`,
        description: `Only one person at ${deal.company.name} is engaged on this deal.`,
        type: "RESEARCH",
        priority: "HIGH",
        dueAt: new Date(now.getTime() + 3 * 86_400_000),
        reason: `The deal has had only one engaged contact for more than ${deal.organisation.singleThreadedDays} days.`,
        origin: "RULE",
        dedupeKey: key,
        suggestedAction: "Ask your contact who else is involved in the decision, such as whoever signs off the spend, and add them to the deal.",
        dealId: deal.id,
        companyId: deal.companyId,
      },
    });
    data.singleThreadedWarnedAt = now;
  }

  await db.deal.update({ where: { id: deal.id }, data });
  return { health, singleThreaded: single };
}

export async function recalculateOrganisation(organisationId: string, now = new Date()) {
  const averages = await averageDaysByStage(organisationId);
  const deals = await prisma.deal.findMany({ where: { organisationId }, select: { id: true } });
  for (const d of deals) await recalculateDeal(d.id, { now, averages });
  return deals.length;
}
