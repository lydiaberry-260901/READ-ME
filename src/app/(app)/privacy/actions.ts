"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { startOfLondonDay } from "@/lib/calendar-view";
import { recordOptOut } from "@/lib/contacts/opt-out";
import { requestDeadline } from "@/lib/privacy/requests";
import { eraseContact } from "@/lib/privacy/subject";
import { applyRetentionReview } from "@/lib/privacy/retention";
import type { ChecklistState } from "@/lib/privacy/setup";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const optionalDay = day.optional().or(z.literal("")).transform((v) => (v ? v : null));
const noonOf = (d: string) => new Date(startOfLondonDay(d).getTime() + 12 * 3_600_000);

function refresh(...paths: string[]) {
  revalidatePath("/privacy");
  for (const p of paths) revalidatePath(p);
}

// ---------------------------------------------------------------------------
// Requests from people about their data
// ---------------------------------------------------------------------------

export async function createRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const me = await actionUser("privacy.access");
    const input = z
      .object({
        type: z.enum(["ACCESS", "RECTIFICATION", "ERASURE", "RESTRICTION", "OBJECTION", "PORTABILITY"]),
        requesterName: z.string().trim().min(2, "Enter the person's name.").max(200),
        requesterEmail: optionalText(320),
        details: optionalText(4000),
        receivedDate: day,
        contactId: optionalText(40),
        assignedToId: optionalText(40),
      })
      .parse(Object.fromEntries(formData));
    if (input.contactId && !(await prisma.contact.findFirst({ where: { id: input.contactId, organisationId: me.organisationId } }))) {
      return { ok: false, message: "That contact could not be found." };
    }
    const receivedAt = noonOf(input.receivedDate);
    const r = await prisma.dataRequest.create({
      data: {
        organisationId: me.organisationId, type: input.type, requesterName: input.requesterName, requesterEmail: input.requesterEmail,
        details: input.details, contactId: input.contactId, assignedToId: input.assignedToId ?? me.id,
        receivedAt, dueAt: requestDeadline(receivedAt), createdById: me.id,
      },
    });
    id = r.id;
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.request_created", entityType: "DataRequest", entityId: r.id, details: { type: input.type } });
  } catch (error) {
    return failure(error);
  }
  refresh("/privacy/requests");
  redirect(`/privacy/requests/${id}`);
}

async function ownRequest(organisationId: string, id: string) {
  const r = await prisma.dataRequest.findFirst({ where: { id, organisationId } });
  if (!r) throw new AccessDeniedError("That request could not be found.");
  return r;
}

export async function updateRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("privacy.access");
    const input = z
      .object({
        id: z.string().min(1),
        status: z.enum(["OPEN", "IN_PROGRESS"]),
        contactId: optionalText(40),
        assignedToId: optionalText(40),
        identityChecked: z.enum(["yes", "no"]).optional(),
        details: optionalText(4000),
        extendMonths: z.enum(["0", "1", "2"]).optional().default("0"),
        extensionReason: optionalText(1000),
      })
      .parse(Object.fromEntries(formData));
    const r = await ownRequest(me.organisationId, input.id);
    if (r.status === "COMPLETED" || r.status === "REFUSED") return { ok: false, message: "This request is closed." };
    if (input.contactId && !(await prisma.contact.findFirst({ where: { id: input.contactId, organisationId: me.organisationId } }))) {
      return { ok: false, message: "That contact could not be found." };
    }
    const extend = Number(input.extendMonths);
    if (extend && !input.extensionReason) return { ok: false, message: "Say why more time is needed. The person must be told within the first month." };
    await prisma.dataRequest.update({
      where: { id: r.id },
      data: {
        status: input.status,
        contactId: input.contactId,
        assignedToId: input.assignedToId,
        details: input.details,
        identityCheckedAt: input.identityChecked === "yes" ? (r.identityCheckedAt ?? new Date()) : null,
        extendedDueAt: extend ? requestDeadline(r.receivedAt, 1 + extend) : null,
        extensionReason: extend ? input.extensionReason : null,
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.request_updated", entityType: "DataRequest", entityId: r.id, details: { status: input.status, extendMonths: extend } });
    refresh("/privacy/requests", `/privacy/requests/${r.id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Closes a request. For a deletion, limit or objection request linked to a contact, the matching
 * change is made at the same time, so the record and the request always agree.
 */
export async function completeRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("privacy.access");
    const input = z
      .object({
        id: z.string().min(1),
        decision: z.enum(["COMPLETED", "REFUSED"]),
        outcome: z.string().trim().min(5, "Record what was done, or why the request was refused.").max(4000),
        keepOnDoNotContactList: z.enum(["yes", "no"]).optional(),
        confirm: z.literal("yes", { message: "Tick the box to confirm." }),
      })
      .parse(Object.fromEntries(formData));
    const r = await ownRequest(me.organisationId, input.id);
    if (r.status === "COMPLETED" || r.status === "REFUSED") return { ok: false, message: "This request is already closed." };
    if (input.decision === "COMPLETED" && ["ERASURE", "RESTRICTION", "OBJECTION"].includes(r.type) && !r.contactId) {
      return { ok: false, message: "Link the request to their contact record first, or refuse it with a reason (for example, we hold no data about them)." };
    }
    const reason = `Request from the person (${r.type.toLowerCase()}), received ${r.receivedAt.toISOString().slice(0, 10)}`;
    let done = "";
    if (input.decision === "COMPLETED" && r.contactId) {
      if (r.type === "ERASURE") {
        const counts = await eraseContact({ organisationId: me.organisationId, contactId: r.contactId, userId: me.id, keepOnDoNotContactList: input.keepOnDoNotContactList === "yes", reason });
        done = ` Their details were deleted (${counts.emails} emails, ${counts.transcripts} transcripts, ${counts.tasks} tasks).`;
      } else if (r.type === "RESTRICTION") {
        await prisma.contact.update({ where: { id: r.contactId }, data: { restricted: true } });
        await audit({ organisationId: me.organisationId, userId: me.id, action: "contact.restricted", entityType: "Contact", entityId: r.contactId, details: { requestId: r.id } });
        done = " Their details are now marked as limited, so nobody can contact them.";
      } else if (r.type === "OBJECTION") {
        await recordOptOut({ organisationId: me.organisationId, contactId: r.contactId, userId: me.id, reason });
        done = " They have been opted out and added to the do not contact list.";
      }
    }
    await prisma.dataRequest.update({
      where: { id: r.id },
      data: { status: input.decision, outcome: input.outcome, completedAt: new Date() },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: input.decision === "COMPLETED" ? "privacy.request_completed" : "privacy.request_refused", entityType: "DataRequest", entityId: r.id });
    refresh("/privacy/requests", `/privacy/requests/${r.id}`);
    return { ok: true, message: `The request is closed.${done}` };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Breaches
// ---------------------------------------------------------------------------

const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter the date and time.");
/** A date and time typed in London time, as a real moment. */
const londonMoment = (v: string) => new Date(startOfLondonDay(v.slice(0, 10)).getTime() + (Number(v.slice(11, 13)) * 60 + Number(v.slice(14, 16))) * 60_000);

export async function createBreach(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const me = await actionUser("privacy.access");
    const input = z
      .object({
        title: z.string().trim().min(3, "Give it a short title.").max(200),
        description: z.string().trim().min(5, "Describe what happened.").max(8000),
        discoveredAt: dateTime,
        dataInvolved: optionalText(2000),
      })
      .parse(Object.fromEntries(formData));
    const discoveredAt = londonMoment(input.discoveredAt);
    if (discoveredAt.getTime() > Date.now() + 60_000) return { ok: false, message: "The time found cannot be in the future." };
    const b = await prisma.breach.create({
      data: { organisationId: me.organisationId, title: input.title, description: input.description, discoveredAt, dataInvolved: input.dataInvolved, reportedById: me.id },
    });
    id = b.id;
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.breach_recorded", entityType: "Breach", entityId: b.id });
  } catch (error) {
    return failure(error);
  }
  refresh("/privacy/breaches");
  redirect(`/privacy/breaches/${id}`);
}

export async function updateBreach(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("privacy.access");
    const input = z
      .object({
        id: z.string().min(1),
        description: z.string().trim().min(5).max(8000),
        occurredAt: z.string().optional().or(z.literal("")),
        dataInvolved: optionalText(2000),
        peopleAffected: z.string().optional().transform((v) => (v && v.trim() ? Number(v) : null)).pipe(z.number().int().min(0).nullable()),
        risk: z.enum(["UNKNOWN", "UNLIKELY", "RISK", "HIGH_RISK"]),
        riskReason: optionalText(2000),
        icoDecision: z.enum(["NOT_DECIDED", "REPORTED", "NOT_REQUIRED"]),
        icoDecisionReason: optionalText(2000),
        icoReference: optionalText(200),
        peopleTold: z.enum(["yes", "no"]).optional(),
        actionsTaken: optionalText(8000),
        lessons: optionalText(4000),
      })
      .parse(Object.fromEntries(formData));
    const b = await prisma.breach.findFirst({ where: { id: input.id, organisationId: me.organisationId } });
    if (!b) throw new AccessDeniedError("That breach could not be found.");
    if (input.icoDecision === "NOT_REQUIRED" && !input.icoDecisionReason) return { ok: false, message: "Record why the ICO does not need to be told. This must be kept even when it is not reported." };
    if (input.icoDecision === "NOT_REQUIRED" && (input.risk === "RISK" || input.risk === "HIGH_RISK")) return { ok: false, message: "A breach that is a risk to people must be reported to the ICO." };
    await prisma.breach.update({
      where: { id: b.id },
      data: {
        description: input.description,
        occurredAt: input.occurredAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.occurredAt) ? londonMoment(input.occurredAt) : null,
        dataInvolved: input.dataInvolved,
        peopleAffected: input.peopleAffected,
        risk: input.risk,
        riskReason: input.riskReason,
        icoDecision: input.icoDecision,
        icoDecisionReason: input.icoDecisionReason,
        icoReference: input.icoReference,
        icoReportedAt: input.icoDecision === "REPORTED" ? (b.icoReportedAt ?? new Date()) : null,
        peopleToldAt: input.peopleTold === "yes" ? (b.peopleToldAt ?? new Date()) : null,
        actionsTaken: input.actionsTaken,
        lessons: input.lessons,
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.breach_updated", entityType: "Breach", entityId: b.id, details: { risk: input.risk, icoDecision: input.icoDecision } });
    refresh("/privacy/breaches", `/privacy/breaches/${b.id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleBreachCheck(formData: FormData) {
  const me = await actionUser("privacy.access");
  const { id, key, done } = z.object({ id: z.string(), key: z.string().max(40), done: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  const b = await prisma.breach.findFirst({ where: { id, organisationId: me.organisationId } });
  if (!b) throw new AccessDeniedError("That breach could not be found.");
  const checklist = { ...((b.checklist ?? {}) as ChecklistState) };
  checklist[key] = done === "true" ? { done: true, doneAt: new Date().toISOString(), doneById: me.id } : { done: false };
  await prisma.breach.update({ where: { id }, data: { checklist } });
  refresh(`/privacy/breaches/${id}`);
}

export async function closeBreach(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("privacy.access");
    const id = z.string().min(1).parse(formData.get("id"));
    const b = await prisma.breach.findFirst({ where: { id, organisationId: me.organisationId } });
    if (!b) throw new AccessDeniedError("That breach could not be found.");
    if (b.icoDecision === "NOT_DECIDED") return { ok: false, message: "Record the decision on telling the ICO before closing." };
    if (!b.actionsTaken) return { ok: false, message: "Record what was done before closing." };
    await prisma.breach.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.breach_closed", entityType: "Breach", entityId: id });
    refresh("/privacy/breaches", `/privacy/breaches/${id}`);
    return { ok: true, message: "Closed. The record is kept." };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function saveSupplier(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("privacy.access");
    const tri = z.enum(["yes", "no", "unknown"]).transform((v) => (v === "yes" ? true : v === "no" ? false : null));
    const input = z
      .object({
        id: optionalText(40),
        name: z.string().trim().min(2, "Enter the supplier's name.").max(120),
        purpose: z.string().trim().min(3, "Say what they do for us.").max(1000),
        dataShared: z.string().trim().min(3, "Say what data they receive.").max(2000),
        location: optionalText(300),
        outsideUk: tri,
        safeguards: optionalText(1000),
        dpaInPlace: z.enum(["yes", "no"]).transform((v) => v === "yes"),
        dpaDate: optionalDay,
        noTraining: tri,
        notes: optionalText(2000),
      })
      .parse({ outsideUk: "unknown", noTraining: "unknown", dpaInPlace: "no", ...Object.fromEntries(formData) });
    if (input.outsideUk === true && !input.safeguards) return { ok: false, message: "Data stored outside the UK needs a safeguard recorded, for example UK adequacy or the international data transfer addendum." };
    const data = { ...input, id: undefined, dpaDate: input.dpaDate ? new Date(`${input.dpaDate}T00:00:00Z`) : null, reviewedAt: new Date() };
    if (input.id) {
      const s = await prisma.supplier.findFirst({ where: { id: input.id, organisationId: me.organisationId } });
      if (!s) throw new AccessDeniedError("That supplier could not be found.");
      await prisma.supplier.update({ where: { id: s.id }, data });
    } else {
      await prisma.supplier.create({ data: { ...data, organisationId: me.organisationId } });
    }
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.supplier_saved", entityType: "Supplier", details: { name: input.name } });
    refresh("/privacy/suppliers", "/privacy/records");
    return { ok: true, message: "Saved." };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, message: "A supplier with that name is already listed." };
    return failure(error);
  }
}

export async function deleteSupplier(formData: FormData) {
  const me = await actionUser("privacy.access");
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.supplier.deleteMany({ where: { id, organisationId: me.organisationId } });
  await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.supplier_removed", entityType: "Supplier", entityId: id });
  refresh("/privacy/suppliers", "/privacy/records");
}

// ---------------------------------------------------------------------------
// Records, assessment, checklist and settings
// ---------------------------------------------------------------------------

export async function saveAssessment(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("privacy.access");
    const input = z
      .object({
        purpose: z.string().trim().max(6000),
        necessity: z.string().trim().max(6000),
        balance: z.string().trim().max(6000),
        safeguards: z.string().trim().max(6000),
        outcome: z.string().trim().max(3000),
      })
      .parse(Object.fromEntries(formData));
    await prisma.organisation.update({ where: { id: me.organisationId }, data: { legitimateInterestsAssessment: { ...input, reviewedAt: new Date().toISOString(), reviewedById: me.id } } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.lia_saved", entityType: "Organisation", entityId: me.organisationId });
    refresh("/privacy/records");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleChecklist(formData: FormData) {
  const me = await actionUser("privacy.access");
  const { key, done } = z.object({ key: z.string().max(40), done: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: me.organisationId }, select: { privacyChecklist: true } });
  const checklist = { ...((org.privacyChecklist ?? {}) as ChecklistState) };
  checklist[key] = done === "true" ? { done: true, doneAt: new Date().toISOString(), doneById: me.id } : { done: false };
  await prisma.organisation.update({ where: { id: me.organisationId }, data: { privacyChecklist: checklist } });
  await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.checklist_updated", details: { key, done: done === "true" } });
  refresh("/privacy/records");
}

export async function savePrivacySettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const months = (label: string) => z.coerce.number().int().min(1, `${label}: at least 1 month.`).max(120, `${label}: at most 120 months.`);
    const input = z
      .object({
        dataProtectionLeadId: optionalText(40),
        retainContactsMonths: months("Contacts"),
        retainTranscriptsMonths: months("Transcripts"),
        retainNewsMonths: months("News"),
        icoFeeRenewalDate: optionalDay,
        dpiaReviewDate: optionalDay,
      })
      .parse(Object.fromEntries(formData));
    if (input.dataProtectionLeadId && !(await prisma.user.findFirst({ where: { id: input.dataProtectionLeadId, organisationId: me.organisationId, active: true } }))) {
      return { ok: false, message: "That person could not be found." };
    }
    await prisma.organisation.update({
      where: { id: me.organisationId },
      data: {
        ...input,
        icoFeeRenewalDate: input.icoFeeRenewalDate ? new Date(`${input.icoFeeRenewalDate}T00:00:00Z`) : null,
        dpiaReviewDate: input.dpiaReviewDate ? new Date(`${input.dpiaReviewDate}T00:00:00Z`) : null,
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "privacy.settings_updated", entityType: "Organisation", entityId: me.organisationId, details: input });
    refresh("/privacy/retention", "/privacy/records");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export async function approveRetention(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const id = z.string().min(1).parse(formData.get("id"));
    if (formData.get("confirm") !== "yes") return { ok: false, message: "Tick the box to confirm." };
    const keepIds = formData.getAll("keep").map(String);
    const r = await applyRetentionReview({ organisationId: me.organisationId, reviewId: id, userId: me.id, keepIds });
    refresh("/privacy/retention");
    return { ok: true, message: `Done. Deleted ${r.deleted.contacts} contacts, ${r.deleted.transcripts} transcripts and ${r.deleted.news} news items. Kept ${r.keptByChoice} you chose and ${r.keptBecauseUsedSince} used since the list was made.` };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("That list")) return { ok: false, message: error.message };
    return failure(error);
  }
}

export async function dismissRetention(formData: FormData) {
  const me = await actionUser("settings.manage");
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.retentionReview.updateMany({ where: { id, organisationId: me.organisationId, status: "PENDING" }, data: { status: "DISMISSED", decidedById: me.id, decidedAt: new Date(), result: { note: "Dismissed without deleting anything." } } });
  await audit({ organisationId: me.organisationId, userId: me.id, action: "retention.dismissed", entityType: "RetentionReview", entityId: id });
  refresh("/privacy/retention");
}

/** Contacts the privacy team can link a request to. Everyone in the organisation, as requests can be about anyone. */
export async function findContactsForRequest(query: string) {
  const me = await actionUser("privacy.access");
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const rows = await prisma.contact.findMany({
    where: { organisationId: me.organisationId, OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
    select: { id: true, firstName: true, lastName: true, email: true, company: { select: { name: true } } },
    take: 20,
  });
  // The privacy team handles requests about anyone, so access here is by capability, not ownership.
  return rows.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() + (c.email ? ` (${c.email})` : "") + (c.company ? `, ${c.company.name}` : "") }));
}
