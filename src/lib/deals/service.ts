// Changing deals. Every change checks access, records history where needed, and recalculates health.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { LossReason, type StageKind, type StakeholderRole } from "@/generated/prisma/enums";
import { canEdit, canView, type Actor } from "@/lib/permissions";
import { qualificationCompleteness, QUALIFICATION_FIELDS, type QualificationKey } from "@/lib/qualification";
import { createStageAlerts } from "@/lib/notifications/deal-alerts";
import { recalculateDeal } from "./recalculate";

export class DealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DealError";
  }
}

export type CloseDetails = { lossReason?: string | null; closeNote?: string | null; finalValue?: number | null };

/** Closing as Lost needs a reason from the fixed list and a note. Closing as Won needs the final value and a note. */
export function validateClose(kind: StageKind, d: CloseDetails): { lossReason: LossReason | null; closeNote: string | null; finalValue: number | null } {
  const note = (d.closeNote ?? "").trim();
  if (kind === "LOST") {
    if (!d.lossReason || !(Object.values(LossReason) as string[]).includes(d.lossReason)) {
      throw new DealError("Choose why the deal was lost from the list.");
    }
    if (note.length < 3) throw new DealError("Add a short note on why the deal was lost.");
    return { lossReason: d.lossReason as LossReason, closeNote: note.slice(0, 1000), finalValue: null };
  }
  if (kind === "WON") {
    if (d.finalValue === null || d.finalValue === undefined || !Number.isFinite(d.finalValue) || d.finalValue < 0) {
      throw new DealError("Enter the final value of the deal.");
    }
    if (note.length < 3) throw new DealError("Add a short note on why the deal was won.");
    return { lossReason: null, closeNote: note.slice(0, 1000), finalValue: Math.round(d.finalValue) };
  }
  return { lossReason: null, closeNote: null, finalValue: null };
}

async function editableDeal(actor: Actor, dealId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const deal = await db.deal.findFirst({ where: { id: dealId, organisationId: actor.organisationId }, include: { stage: true, company: { select: { name: true } } } });
  if (!deal || !canView(actor, deal)) throw new DealError("That deal could not be found.");
  // Deals can only be changed by their owner, the owner's manager, or an admin.
  if (!canEdit(actor, deal, { sharedIsEditable: false })) throw new DealError("Only the deal's owner, their manager or an admin can change this deal.");
  return deal;
}

export async function moveDeal(actor: Actor & { name?: string | null }, dealId: string, toStageId: string, close: CloseDetails = {}, now = new Date()) {
  const result = await prisma.$transaction(async (tx) => {
    const deal = await editableDeal(actor, dealId, tx);
    if (deal.stageId === toStageId) return { moved: false as const, alertIds: [] as string[] };
    const toStage = await tx.stage.findFirst({ where: { id: toStageId, pipelineId: deal.pipelineId, archived: false } });
    if (!toStage) throw new DealError("That stage could not be found.");
    const closing = validateClose(toStage.kind, close);

    const history = await tx.dealStageHistory.create({
      data: {
        dealId: deal.id,
        fromStageId: deal.stageId,
        toStageId: toStage.id,
        movedById: actor.id,
        movedAt: now,
        secondsInPreviousStage: Math.max(0, Math.round((now.getTime() - deal.stageEnteredAt.getTime()) / 1000)),
      },
    });
    const isClosed = toStage.kind !== "OPEN";
    await tx.deal.update({
      where: { id: deal.id },
      data: {
        stageId: toStage.id,
        stageEnteredAt: now,
        closedAt: isClosed ? now : null,
        lossReason: closing.lossReason,
        closeNote: closing.closeNote,
        finalValue: closing.finalValue,
        ...(toStage.kind === "WON" && closing.finalValue !== null ? { value: closing.finalValue } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        organisationId: actor.organisationId, userId: actor.id, action: "deal.stage_changed", entityType: "Deal", entityId: deal.id,
        details: { from: deal.stage.name, to: toStage.name, lossReason: closing.lossReason, finalValue: closing.finalValue },
      },
    });
    const alertIds = await createStageAlerts(
      {
        organisationId: actor.organisationId,
        historyId: history.id,
        deal: { id: deal.id, name: deal.name, value: closing.finalValue ?? deal.value, ownerId: deal.ownerId },
        companyName: deal.company.name,
        fromStage: deal.stage.name,
        toStage: toStage.name,
        toKind: toStage.kind,
        movedByName: actor.name ?? "A team member",
        movedAt: now,
        lossReason: closing.lossReason,
        closeNote: closing.closeNote,
        finalValue: closing.finalValue,
      },
      tx,
    );
    return { moved: true as const, alertIds };
  });
  if (result.moved) await recalculateDeal(dealId, { now });
  return result;
}

export async function updateQualification(actor: Actor, dealId: string, values: Partial<Record<QualificationKey, string | null>>) {
  const deal = await editableDeal(actor, dealId);
  const next: Record<string, string | null> = {};
  for (const f of QUALIFICATION_FIELDS) {
    const v = values[f.key];
    next[f.key] = v === undefined ? (deal[f.key] as string | null) : v && v.trim() ? v.trim().slice(0, 2000) : null;
  }
  await prisma.deal.update({
    where: { id: deal.id },
    data: { ...next, qualificationPct: qualificationCompleteness(next) },
  });
  await prisma.auditLog.create({ data: { organisationId: actor.organisationId, userId: actor.id, action: "deal.qualification_updated", entityType: "Deal", entityId: deal.id } });
  return recalculateDeal(deal.id);
}

export async function setStakeholder(actor: Actor, dealId: string, contactId: string, input: { role: StakeholderRole | null; engaged: boolean }) {
  const deal = await editableDeal(actor, dealId);
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organisationId: actor.organisationId } });
  if (!contact || !canView(actor, contact)) throw new DealError("That contact could not be found.");
  await prisma.dealContact.upsert({
    where: { dealId_contactId: { dealId: deal.id, contactId } },
    update: { role: input.role, engaged: input.engaged },
    create: { dealId: deal.id, contactId, role: input.role, engaged: input.engaged },
  });
  return recalculateDeal(deal.id);
}

export async function removeStakeholder(actor: Actor, dealId: string, contactId: string) {
  const deal = await editableDeal(actor, dealId);
  await prisma.dealContact.deleteMany({ where: { dealId: deal.id, contactId } });
  return recalculateDeal(deal.id);
}

export async function addDealNote(actor: Actor, dealId: string, body: string, now = new Date()) {
  const deal = await editableDeal(actor, dealId);
  const text = body.trim();
  if (text.length < 2) throw new DealError("Write a note first.");
  await prisma.activity.create({
    data: { organisationId: actor.organisationId, type: "NOTE", userId: actor.id, occurredAt: now, body: text.slice(0, 4000), dealId: deal.id, companyId: deal.companyId },
  });
  await prisma.deal.update({ where: { id: deal.id }, data: { lastActivityAt: now } });
  await prisma.company.update({ where: { id: deal.companyId }, data: { lastActivityAt: now } });
  return recalculateDeal(deal.id, { now });
}

export async function setFollowing(actor: Actor, dealId: string, follow: boolean) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, organisationId: actor.organisationId } });
  if (!deal || !canView(actor, deal)) throw new DealError("That deal could not be found.");
  if (follow) {
    await prisma.dealFollower.upsert({ where: { dealId_userId: { dealId, userId: actor.id } }, update: {}, create: { dealId, userId: actor.id } });
  } else {
    await prisma.dealFollower.deleteMany({ where: { dealId, userId: actor.id } });
  }
}
