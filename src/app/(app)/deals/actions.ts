"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError, type CurrentUser } from "@/lib/session";
import { canEdit, canView } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { QUALIFICATION_FIELDS } from "@/lib/qualification";
import { addDealNote, DealError, moveDeal, removeStakeholder, setFollowing, setStakeholder, updateQualification } from "@/lib/deals/service";
import { recalculateDeal } from "@/lib/deals/recalculate";
import { enqueue } from "@/jobs/boss";
import { QUEUES } from "@/jobs/queues";
import { logger } from "@/lib/logger";

function dealFailure(error: unknown): ActionResult {
  if (error instanceof DealError) return { ok: false, message: error.message };
  return failure(error);
}

async function queueAlerts(ids: string[]) {
  for (const notificationId of ids) {
    try {
      await enqueue(QUEUES.sendNotification, { notificationId });
    } catch (error) {
      // The alert is saved; the worker's regular sweep will send it.
      logger.warn("Could not queue alert, the regular sweep will send it", { notificationId, error: String(error) });
    }
  }
}

export type MoveInput = { dealId: string; stageId: string; lossReason?: string | null; closeNote?: string | null; finalValue?: number | null };

export async function moveDealAction(input: MoveInput): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const data = z
      .object({
        dealId: z.string(),
        stageId: z.string(),
        lossReason: z.string().nullish(),
        closeNote: z.string().max(1000).nullish(),
        finalValue: z.number().nullish(),
      })
      .parse(input);
    const result = await moveDeal(me, data.dealId, data.stageId, data);
    await queueAlerts(result.alertIds);
    revalidatePath("/deals");
    revalidatePath(`/deals/${data.dealId}`);
    return { ok: true, message: result.moved ? "Deal moved." : "No change." };
  } catch (error) {
    return dealFailure(error);
  }
}

const groupSchema = z.enum(["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", ""]).transform((v) => (v ? v : null));

export async function createDeal(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const me = await actionUser();
    const input = z
      .object({
        name: z.string().trim().min(2, "Give the deal a name.").max(200),
        companyId: z.string().min(1, "Choose the company."),
        value: z.coerce.number().int().min(0, "The value cannot be negative.").max(100_000_000),
        expectedCloseDate: z.string().optional().transform((v) => (v ? new Date(v) : null)),
        customerGroup: groupSchema,
        nextStep: optionalText(300),
        ownerId: z.string().min(1),
        isShared: z.string().optional().transform((v) => v === "on"),
      })
      .parse(Object.fromEntries(formData));
    const company = await prisma.company.findFirst({ where: { id: input.companyId, organisationId: me.organisationId } });
    if (!company || !canView(me, company)) return { ok: false, message: "That company could not be found." };
    if (me.role === "REP" && input.ownerId !== me.id) throw new AccessDeniedError("Reps can only create deals they own.");
    const owner = await prisma.user.findFirst({ where: { id: input.ownerId, organisationId: me.organisationId, active: true } });
    if (!owner) return { ok: false, message: "That owner could not be found." };
    const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { organisationId: me.organisationId, isDefault: true }, include: { stages: { where: { archived: false }, orderBy: { position: "asc" } } } });
    const first = pipeline.stages.find((s) => s.kind === "OPEN");
    if (!first) return { ok: false, message: "The pipeline has no open stages. An admin needs to add one." };

    const deal = await prisma.deal.create({
      data: {
        organisationId: me.organisationId,
        pipelineId: pipeline.id,
        stageId: first.id,
        companyId: company.id,
        ownerId: owner.id,
        name: input.name,
        value: input.value,
        expectedCloseDate: input.expectedCloseDate,
        customerGroup: input.customerGroup ?? company.customerGroup,
        nextStep: input.nextStep,
        isShared: input.isShared,
      },
    });
    await prisma.dealStageHistory.create({ data: { dealId: deal.id, toStageId: first.id, movedById: me.id } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "deal.created", entityType: "Deal", entityId: deal.id });
    await recalculateDeal(deal.id);
    id = deal.id;
  } catch (error) {
    return dealFailure(error);
  }
  redirect(`/deals/${id}`);
}

async function editable(me: CurrentUser, dealId: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, organisationId: me.organisationId } });
  if (!deal || !canEdit(me, deal, { sharedIsEditable: false })) throw new DealError("Only the deal's owner, their manager or an admin can change this deal.");
  return deal;
}

export async function updateDealBasics(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z
      .object({
        id: z.string(),
        name: z.string().trim().min(2, "Give the deal a name.").max(200),
        value: z.coerce.number().int().min(0).max(100_000_000),
        expectedCloseDate: z.string().optional().transform((v) => (v ? new Date(v) : null)),
        customerGroup: groupSchema,
        nextStep: optionalText(300),
        competitor: optionalText(120),
        ownerId: z.string().min(1),
        isShared: z.string().optional().transform((v) => v === "on"),
      })
      .parse(Object.fromEntries(formData));
    const deal = await editable(me, input.id);
    if (input.ownerId !== deal.ownerId) {
      if (me.role === "REP") throw new AccessDeniedError("Reps cannot hand deals to someone else. Ask your manager.");
      const owner = await prisma.user.findFirst({ where: { id: input.ownerId, organisationId: me.organisationId, active: true } });
      if (!owner) return { ok: false, message: "That owner could not be found." };
    }
    const { id, ...data } = input;
    await prisma.deal.update({ where: { id }, data });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "deal.updated", entityType: "Deal", entityId: id, details: { competitor: input.competitor, value: input.value } });
    revalidatePath(`/deals/${id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return dealFailure(error);
  }
}

export async function saveQualification(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    const values = Object.fromEntries(QUALIFICATION_FIELDS.map((f) => [f.key, String(formData.get(f.key) ?? "")]));
    await updateQualification(me, id, values);
    revalidatePath(`/deals/${id}`);
    return { ok: true, message: "Qualification saved." };
  } catch (error) {
    return dealFailure(error);
  }
}

export async function saveStakeholder(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z
      .object({
        dealId: z.string(),
        contactId: z.string().min(1, "Choose a contact."),
        role: z.enum(["CHAMPION", "ECONOMIC_BUYER", "BLOCKER", "INFLUENCER", "USER", ""]).transform((v) => (v ? v : null)),
        engaged: z.enum(["true", "false"]).transform((v) => v === "true"),
      })
      .parse(Object.fromEntries(formData));
    await setStakeholder(me, input.dealId, input.contactId, { role: input.role, engaged: input.engaged });
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return dealFailure(error);
  }
}

export async function dropStakeholder(formData: FormData): Promise<void> {
  const me = await actionUser();
  const input = z.object({ dealId: z.string(), contactId: z.string() }).parse(Object.fromEntries(formData));
  await removeStakeholder(me, input.dealId, input.contactId);
  revalidatePath(`/deals/${input.dealId}`);
}

export async function addNote(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ dealId: z.string(), body: z.string().max(4000) }).parse(Object.fromEntries(formData));
    await addDealNote(me, input.dealId, input.body);
    revalidatePath(`/deals/${input.dealId}`);
    return { ok: true, message: "Note added." };
  } catch (error) {
    return dealFailure(error);
  }
}

export async function toggleFollow(formData: FormData): Promise<void> {
  const me = await actionUser();
  const input = z.object({ dealId: z.string(), follow: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  await setFollowing(me, input.dealId, input.follow === "true");
  revalidatePath(`/deals/${input.dealId}`);
}
