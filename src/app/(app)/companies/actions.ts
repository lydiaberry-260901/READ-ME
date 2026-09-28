"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError, type CurrentUser } from "@/lib/session";
import { canEdit, canView } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { domainFromWebsite, normaliseWebsite } from "@/lib/enrichment/website";
import { normaliseCompanyNumber } from "@/lib/enrichment/companies-house";
import { generateCompanySummary } from "@/lib/companies/summary";
import { enrichCompany } from "@/lib/enrichment";
import { enqueue } from "@/jobs/boss";
import { QUEUES } from "@/jobs/queues";
import { removeDashPunctuation } from "@/lib/text";

const groupSchema = z
  .enum(["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", ""])
  .optional()
  .transform((v) => (v ? v : null));

const companySchema = z.object({
  name: z.string().trim().min(1, "Enter the company name.").max(200),
  website: optionalText(300),
  customerGroup: groupSchema,
  importance: z.coerce.number().int().min(1).max(3),
  description: optionalText(2000),
  portfolioSize: optionalText(200),
  headOffice: optionalText(200),
  companiesHouseNumber: optionalText(20),
  alternativeNames: optionalText(500),
  ownerId: optionalText(40),
  isShared: z.string().optional().transform((v) => v === "on"),
});

async function checkOwner(me: CurrentUser, ownerId: string | null) {
  if (!ownerId) return;
  if (me.role === "REP" && ownerId !== me.id) throw new AccessDeniedError("Reps can only make themselves the owner.");
  const owner = await prisma.user.findFirst({ where: { id: ownerId, organisationId: me.organisationId, active: true } });
  if (!owner) throw new AccessDeniedError("That owner could not be found.");
}

function cleanCompanyInput(input: z.infer<typeof companySchema>) {
  const website = input.website ? normaliseWebsite(input.website) : null;
  if (input.website && !website) throw new z.ZodError([{ code: "custom", path: ["website"], message: "The website address does not look right.", input: input.website }]);
  const ch = input.companiesHouseNumber ? normaliseCompanyNumber(input.companiesHouseNumber) : null;
  if (input.companiesHouseNumber && !ch) throw new z.ZodError([{ code: "custom", path: ["companiesHouseNumber"], message: "The Companies House number does not look right.", input: input.companiesHouseNumber }]);
  return {
    name: input.name,
    website,
    domain: domainFromWebsite(website),
    customerGroup: input.customerGroup,
    importance: input.importance,
    description: input.description,
    portfolioSize: input.portfolioSize,
    headOffice: input.headOffice,
    companiesHouseNumber: ch,
    alternativeNames: input.alternativeNames ? input.alternativeNames.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) : [],
    ownerId: input.ownerId,
    isShared: input.isShared,
  };
}

export async function createCompany(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const me = await actionUser();
    const data = cleanCompanyInput(companySchema.parse(Object.fromEntries(formData)));
    data.ownerId ??= me.id;
    await checkOwner(me, data.ownerId);

    if (data.domain) {
      const dup = await prisma.company.findFirst({ where: { organisationId: me.organisationId, domain: data.domain }, select: { id: true, name: true } });
      if (dup) return { ok: false, message: `A company with this website already exists: ${dup.name}.`, link: `/companies/${dup.id}` };
    }
    const company = await prisma.company.create({ data: { ...data, organisationId: me.organisationId } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "company.created", entityType: "Company", entityId: company.id });
    id = company.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/companies/${id}`);
}

async function editableCompany(me: CurrentUser, id: string) {
  const company = await prisma.company.findFirst({ where: { id, organisationId: me.organisationId } });
  if (!company || !canEdit(me, company, { sharedIsEditable: true })) throw new AccessDeniedError("You cannot change this company.");
  return company;
}

export async function updateCompany(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    const before = await editableCompany(me, id);
    const data = cleanCompanyInput(companySchema.parse(Object.fromEntries(formData)));
    if (data.ownerId !== before.ownerId) await checkOwner(me, data.ownerId);
    if (data.domain && data.domain !== before.domain) {
      const dup = await prisma.company.findFirst({ where: { organisationId: me.organisationId, domain: data.domain, id: { not: id } }, select: { id: true, name: true } });
      if (dup) return { ok: false, message: `Another company already uses this website: ${dup.name}.`, link: `/companies/${dup.id}` };
    }
    await prisma.company.update({ where: { id }, data });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "company.updated", entityType: "Company", entityId: id });
    revalidatePath(`/companies/${id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function generateSummaryNow(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    await editableCompany(me, id);
    await generateCompanySummary(id, me.organisationId, me.id);
    revalidatePath(`/companies/${id}`);
    return { ok: true, message: "Summary and score updated. Please read them and edit anything that is not right." };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSummaryEdit(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z
      .object({
        id: z.string(),
        whyMatters: z.string().trim().min(1, "The summary cannot be empty.").max(700, "Please keep the summary to 2 or 3 sentences."),
        score: z.coerce.number().int().min(1, "Choose a score from 1 to 5.").max(5),
        scoreReason: z.string().trim().min(1, "Give a one line reason.").max(220, "Please keep the reason to one line."),
      })
      .parse(Object.fromEntries(formData));
    await editableCompany(me, input.id);
    await prisma.company.update({
      where: { id: input.id },
      data: {
        whyMatters: removeDashPunctuation(input.whyMatters),
        score: input.score,
        scoreReason: removeDashPunctuation(input.scoreReason.replace(/\s+/g, " ")),
        aiEditedAt: new Date(),
        aiEditedById: me.id,
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "company.summary_edited", entityType: "Company", entityId: input.id, details: { score: input.score } });
    revalidatePath(`/companies/${input.id}`);
    return { ok: true, message: "Saved your changes." };
  } catch (error) {
    return failure(error);
  }
}

export async function enrichNow(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    const company = await editableCompany(me, id);
    if (!company.website && !company.companiesHouseNumber) {
      return { ok: false, message: "Add a website or a Companies House number first." };
    }
    await enrichCompany(id, me.organisationId, me.id);
    revalidatePath(`/companies/${id}`);
    return { ok: true, message: "Details fetched. Any problems are shown below." };
  } catch (error) {
    return failure(error);
  }
}

export async function addCompanyTag(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string(), name: z.string().trim().min(1, "Type a tag.").max(40) }).parse(Object.fromEntries(formData));
    await editableCompany(me, input.id);
    const tag = await prisma.tag.upsert({
      where: { organisationId_name: { organisationId: me.organisationId, name: input.name } },
      update: {},
      create: { organisationId: me.organisationId, name: input.name },
    });
    await prisma.companyTag.upsert({ where: { companyId_tagId: { companyId: input.id, tagId: tag.id } }, update: {}, create: { companyId: input.id, tagId: tag.id } });
    revalidatePath(`/companies/${input.id}`);
    return { ok: true, message: `Tagged "${tag.name}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCompanyTag(formData: FormData): Promise<void> {
  const me = await actionUser();
  const input = z.object({ id: z.string(), tagId: z.string() }).parse(Object.fromEntries(formData));
  await editableCompany(me, input.id);
  await prisma.companyTag.deleteMany({ where: { companyId: input.id, tagId: input.tagId } });
  revalidatePath(`/companies/${input.id}`);
}

// ---------------------------------------------------------------------------
// Bulk actions on the company list
// ---------------------------------------------------------------------------

export async function bulkCompanies(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const ids = z.array(z.string()).min(1, "Tick at least one company.").max(500, "Please choose at most 500 at a time.").parse(formData.getAll("ids"));
    const bulkAction = z
      .enum(["owner", "addTag", "removeTag", "group", "importance", "addToList", "removeFromList", "share", "unshare", "aiSummary", "enrich"])
      .parse(formData.get("bulkAction"));
    const value = String(formData.get("value") ?? "").trim();

    const companies = await prisma.company.findMany({ where: { id: { in: ids }, organisationId: me.organisationId } });
    const editable = companies.filter((c) => canEdit(me, c, { sharedIsEditable: true }));
    const skipped = ids.length - editable.length;
    const editableIds = editable.map((c) => c.id);
    let done = editableIds.length;

    switch (bulkAction) {
      case "owner": {
        const ownerId = value === "none" ? null : value;
        await checkOwner(me, ownerId);
        await prisma.company.updateMany({ where: { id: { in: editableIds } }, data: { ownerId } });
        break;
      }
      case "addTag": {
        if (!value) return { ok: false, message: "Type a tag." };
        const tag = await prisma.tag.upsert({
          where: { organisationId_name: { organisationId: me.organisationId, name: value.slice(0, 40) } },
          update: {},
          create: { organisationId: me.organisationId, name: value.slice(0, 40) },
        });
        await prisma.companyTag.createMany({ data: editableIds.map((companyId) => ({ companyId, tagId: tag.id })), skipDuplicates: true });
        break;
      }
      case "removeTag":
        await prisma.companyTag.deleteMany({ where: { companyId: { in: editableIds }, tagId: value } });
        break;
      case "group":
        await prisma.company.updateMany({
          where: { id: { in: editableIds } },
          data: { customerGroup: value === "none" ? null : z.enum(["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER"]).parse(value) },
        });
        break;
      case "importance":
        await prisma.company.updateMany({ where: { id: { in: editableIds } }, data: { importance: z.coerce.number().int().min(1).max(3).parse(value) } });
        break;
      case "addToList":
      case "removeFromList": {
        const list = await findOrCreateList(me, value, bulkAction === "addToList");
        if (!list) return { ok: false, message: "That list could not be found." };
        // Lists only group records; anyone who can see a company may add it to a list they can use.
        const visibleIds = companies.filter((c) => canView(me, c)).map((c) => c.id);
        done = visibleIds.length;
        if (bulkAction === "addToList") {
          await prisma.prospectListMember.createMany({ data: visibleIds.map((companyId) => ({ listId: list.id, companyId })), skipDuplicates: true });
        } else {
          await prisma.prospectListMember.deleteMany({ where: { listId: list.id, companyId: { in: visibleIds } } });
        }
        break;
      }
      case "share":
      case "unshare":
        await prisma.company.updateMany({ where: { id: { in: editableIds } }, data: { isShared: bulkAction === "share" } });
        break;
      case "aiSummary":
        for (const companyId of editableIds) {
          await enqueue(QUEUES.companySummary, { companyId, userId: me.id }, { singletonKey: `summary:${companyId}` });
        }
        break;
      case "enrich":
        for (const companyId of editableIds) {
          await enqueue(QUEUES.companyEnrich, { companyId, userId: me.id }, { singletonKey: `enrich:${companyId}` });
        }
        break;
    }

    await audit({
      organisationId: me.organisationId,
      userId: me.id,
      action: `company.bulk_${bulkAction}`,
      entityType: "Company",
      details: { count: done, skipped, value: value || null },
    });
    revalidatePath("/companies");

    const queued = bulkAction === "aiSummary" || bulkAction === "enrich";
    const main = queued
      ? `${done} ${done === 1 ? "company" : "companies"} added to the background queue. Results appear on each company page within a few minutes.`
      : `Updated ${done} ${done === 1 ? "company" : "companies"}.`;
    const note = skipped > 0 && !["addToList", "removeFromList"].includes(bulkAction) ? ` ${skipped} skipped because you cannot change them.` : "";
    return { ok: true, message: main + note };
  } catch (error) {
    return failure(error);
  }
}

/** Finds a list by id, or creates one when a new name is typed (for "Add to list"). */
async function findOrCreateList(me: CurrentUser, value: string, allowCreate: boolean) {
  if (!value) return null;
  const existing = await prisma.prospectList.findFirst({
    where: { organisationId: me.organisationId, OR: [{ id: value }, { name: value }], AND: [{ OR: [{ isShared: true }, { ownerId: me.id }] }] },
  });
  if (existing || !allowCreate) return existing;
  return prisma.prospectList.create({ data: { organisationId: me.organisationId, ownerId: me.id, name: value.slice(0, 60) } });
}
