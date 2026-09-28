"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError, type CurrentUser } from "@/lib/session";
import { canEdit, canView } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { normaliseEmail } from "@/lib/crypto";
import { EMAIL_RE, isPersonalEmail } from "@/lib/import/plan";
import { isSuppressed, recordOptOut } from "@/lib/contacts/opt-out";

const entityTypes = ["LIMITED_COMPANY", "PUBLIC_BODY", "LLP", "SOLE_TRADER", "PARTNERSHIP", "UNKNOWN"] as const;

const contactSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(100),
  lastName: optionalText(100),
  jobTitle: optionalText(150),
  email: optionalText(200),
  phone: optionalText(40),
  linkedinUrl: optionalText(300),
  companyId: optionalText(40),
  ownerId: optionalText(40),
  isShared: z.string().optional().transform((v) => v === "on"),
  notes: optionalText(4000),
  entityType: z.enum(entityTypes),
});

const newContactExtras = z.object({
  source: z.string().trim().min(2, "Say where these details came from, for example \"Company website\" or \"Met at MIPIM 2026\".").max(200),
  collectedAt: z.coerce.date({ message: "Enter the date the details were collected." }),
  lawfulBasis: z.enum(["LEGITIMATE_INTERESTS", "CONSENT", "CONTRACT"]),
});

function checkEmail(email: string | null) {
  if (!email) return null;
  if (!EMAIL_RE.test(email)) throw new z.ZodError([{ code: "custom", path: ["email"], message: "The email address does not look right.", input: email }]);
  if (isPersonalEmail(email)) {
    throw new z.ZodError([{ code: "custom", path: ["email"], message: "This looks like a personal email address. Only record work email addresses.", input: email }]);
  }
  return normaliseEmail(email);
}

function checkLink(url: string | null) {
  if (url && !/^https?:\/\//i.test(url)) {
    throw new z.ZodError([{ code: "custom", path: ["linkedinUrl"], message: "The profile link must start with https://", input: url }]);
  }
  return url;
}

async function checkOwner(me: CurrentUser, ownerId: string | null) {
  if (!ownerId) return;
  if (me.role === "REP" && ownerId !== me.id) throw new AccessDeniedError("Reps can only make themselves the owner.");
  const owner = await prisma.user.findFirst({ where: { id: ownerId, organisationId: me.organisationId, active: true } });
  if (!owner) throw new AccessDeniedError("That owner could not be found.");
}

async function checkCompany(me: CurrentUser, companyId: string | null) {
  if (!companyId) return;
  const company = await prisma.company.findFirst({ where: { id: companyId, organisationId: me.organisationId } });
  if (!company || !canView(me, company)) throw new AccessDeniedError("That company could not be found.");
}

export async function createContact(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const me = await actionUser();
    const raw = Object.fromEntries(formData);
    const input = contactSchema.parse(raw);
    const extras = newContactExtras.parse(raw);
    const email = checkEmail(input.email);
    const ownerId = input.ownerId ?? me.id;
    await checkOwner(me, ownerId);
    await checkCompany(me, input.companyId);
    if (!email && !input.phone) return { ok: false, message: "Add a work email or a work phone number." };

    if (await isSuppressed(me.organisationId, email, input.phone)) {
      return { ok: false, message: "This person has asked us not to contact them, so they cannot be added again." };
    }
    if (email) {
      const dup = await prisma.contact.findFirst({ where: { organisationId: me.organisationId, emailNormalised: email }, select: { id: true } });
      if (dup) return { ok: false, message: "A contact with this email address already exists.", link: `/contacts/${dup.id}` };
    }

    const contact = await prisma.contact.create({
      data: {
        organisationId: me.organisationId,
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle,
        email,
        emailNormalised: email,
        phone: input.phone,
        linkedinUrl: checkLink(input.linkedinUrl),
        companyId: input.companyId,
        ownerId,
        isShared: input.isShared,
        notes: input.notes,
        entityType: input.entityType,
        source: extras.source,
        collectedAt: extras.collectedAt,
        lawfulBasis: extras.lawfulBasis,
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "contact.created", entityType: "Contact", entityId: contact.id, details: { source: extras.source } });
    id = contact.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/contacts/${id}`);
}

async function editableContact(me: CurrentUser, id: string) {
  const contact = await prisma.contact.findFirst({ where: { id, organisationId: me.organisationId } });
  if (!contact || !canEdit(me, contact, { sharedIsEditable: true })) throw new AccessDeniedError("You cannot change this contact.");
  return contact;
}

export async function updateContact(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    const before = await editableContact(me, id);
    const input = contactSchema.parse(Object.fromEntries(formData));
    const email = checkEmail(input.email);
    if (input.ownerId !== before.ownerId) await checkOwner(me, input.ownerId);
    if (input.companyId !== before.companyId) await checkCompany(me, input.companyId);
    if (email && email !== before.emailNormalised) {
      const dup = await prisma.contact.findFirst({ where: { organisationId: me.organisationId, emailNormalised: email, id: { not: id } }, select: { id: true } });
      if (dup) return { ok: false, message: "Another contact already uses this email address.", link: `/contacts/${dup.id}` };
    }
    await prisma.contact.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle,
        email,
        emailNormalised: email,
        phone: input.phone,
        linkedinUrl: checkLink(input.linkedinUrl),
        companyId: input.companyId,
        ownerId: input.ownerId,
        isShared: input.isShared,
        notes: input.notes,
        entityType: input.entityType,
        // A changed phone number needs a fresh TPS and CTPS check.
        ...(input.phone !== before.phone ? { phoneCheckedAt: null, phoneCheckResult: null } : {}),
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "contact.updated", entityType: "Contact", entityId: id });
    revalidatePath(`/contacts/${id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function recordPhoneCheck(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string(), result: z.enum(["CLEAR", "LISTED"]) }).parse(Object.fromEntries(formData));
    const contact = await editableContact(me, input.id);
    if (!contact.phone) return { ok: false, message: "There is no phone number to check." };
    await prisma.contact.update({ where: { id: input.id }, data: { phoneCheckedAt: new Date(), phoneCheckResult: input.result } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "contact.phone_checked", entityType: "Contact", entityId: input.id, details: { result: input.result } });
    revalidatePath(`/contacts/${input.id}`);
    return { ok: true, message: input.result === "CLEAR" ? "Recorded: the number is not on the do not call lists." : "Recorded: the number is on a do not call list. Do not cold call it." };
  } catch (error) {
    return failure(error);
  }
}

export async function recordPrivacyNotice(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string(), sentAt: z.coerce.date({ message: "Enter the date they were told." }) }).parse(Object.fromEntries(formData));
    if (input.sentAt > new Date()) return { ok: false, message: "The date cannot be in the future." };
    await editableContact(me, input.id);
    await prisma.contact.update({ where: { id: input.id }, data: { privacyNoticeSentAt: input.sentAt } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "contact.privacy_notice_recorded", entityType: "Contact", entityId: input.id });
    revalidatePath(`/contacts/${input.id}`);
    return { ok: true, message: "Recorded." };
  } catch (error) {
    return failure(error);
  }
}

export async function recordConsent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string(), consentAt: z.coerce.date({ message: "Enter the date they gave consent." }) }).parse(Object.fromEntries(formData));
    if (input.consentAt > new Date()) return { ok: false, message: "The date cannot be in the future." };
    await editableContact(me, input.id);
    await prisma.contact.update({ where: { id: input.id }, data: { consentAt: input.consentAt } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "contact.consent_recorded", entityType: "Contact", entityId: input.id });
    revalidatePath(`/contacts/${input.id}`);
    return { ok: true, message: "Consent recorded." };
  } catch (error) {
    return failure(error);
  }
}

export async function optOutContact(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z
      .object({ id: z.string(), reason: z.string().trim().min(2, "Say briefly how they asked, for example \"Replied to email asking us to stop\".").max(300) })
      .parse(Object.fromEntries(formData));
    // Anyone who can see a contact may record an opt out. Stopping contact must never be blocked.
    const contact = await prisma.contact.findFirst({ where: { id: input.id, organisationId: me.organisationId } });
    if (!contact || !canView(me, contact)) throw new AccessDeniedError("That contact could not be found.");
    await recordOptOut({ organisationId: me.organisationId, contactId: input.id, userId: me.id, reason: input.reason });
    revalidatePath(`/contacts/${input.id}`);
    return { ok: true, message: "Opted out. Nobody in the team can contact this person now." };
  } catch (error) {
    return failure(error);
  }
}

export async function addContactTag(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string(), name: z.string().trim().min(1, "Type a tag.").max(40) }).parse(Object.fromEntries(formData));
    await editableContact(me, input.id);
    const tag = await prisma.tag.upsert({
      where: { organisationId_name: { organisationId: me.organisationId, name: input.name } },
      update: {},
      create: { organisationId: me.organisationId, name: input.name },
    });
    await prisma.contactTag.upsert({ where: { contactId_tagId: { contactId: input.id, tagId: tag.id } }, update: {}, create: { contactId: input.id, tagId: tag.id } });
    revalidatePath(`/contacts/${input.id}`);
    return { ok: true, message: `Tagged "${tag.name}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function removeContactTag(formData: FormData): Promise<void> {
  const me = await actionUser();
  const input = z.object({ id: z.string(), tagId: z.string() }).parse(Object.fromEntries(formData));
  await editableContact(me, input.id);
  await prisma.contactTag.deleteMany({ where: { contactId: input.id, tagId: input.tagId } });
  revalidatePath(`/contacts/${input.id}`);
}

export async function bulkContacts(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const ids = z.array(z.string()).min(1, "Tick at least one contact.").max(500, "Please choose at most 500 at a time.").parse(formData.getAll("ids"));
    const bulkAction = z.enum(["owner", "addTag", "removeTag", "addToList", "removeFromList", "share", "unshare"]).parse(formData.get("bulkAction"));
    const value = String(formData.get("value") ?? "").trim();

    const contacts = await prisma.contact.findMany({ where: { id: { in: ids }, organisationId: me.organisationId } });
    const editableIds = contacts.filter((c) => canEdit(me, c, { sharedIsEditable: true })).map((c) => c.id);
    let done = editableIds.length;

    switch (bulkAction) {
      case "owner": {
        const ownerId = value === "none" ? null : value;
        await checkOwner(me, ownerId);
        await prisma.contact.updateMany({ where: { id: { in: editableIds } }, data: { ownerId } });
        break;
      }
      case "addTag": {
        if (!value) return { ok: false, message: "Type a tag." };
        const tag = await prisma.tag.upsert({
          where: { organisationId_name: { organisationId: me.organisationId, name: value.slice(0, 40) } },
          update: {},
          create: { organisationId: me.organisationId, name: value.slice(0, 40) },
        });
        await prisma.contactTag.createMany({ data: editableIds.map((contactId) => ({ contactId, tagId: tag.id })), skipDuplicates: true });
        break;
      }
      case "removeTag":
        await prisma.contactTag.deleteMany({ where: { contactId: { in: editableIds }, tagId: value } });
        break;
      case "addToList":
      case "removeFromList": {
        const list = await prisma.prospectList.findFirst({
          where: { organisationId: me.organisationId, OR: [{ id: value }, { name: value }], AND: [{ OR: [{ isShared: true }, { ownerId: me.id }] }] },
        }) ?? (bulkAction === "addToList" && value ? await prisma.prospectList.create({ data: { organisationId: me.organisationId, ownerId: me.id, name: value.slice(0, 60) } }) : null);
        if (!list) return { ok: false, message: "That list could not be found." };
        const visibleIds = contacts.filter((c) => canView(me, c)).map((c) => c.id);
        done = visibleIds.length;
        if (bulkAction === "addToList") {
          await prisma.prospectListMember.createMany({ data: visibleIds.map((contactId) => ({ listId: list.id, contactId })), skipDuplicates: true });
        } else {
          await prisma.prospectListMember.deleteMany({ where: { listId: list.id, contactId: { in: visibleIds } } });
        }
        break;
      }
      case "share":
      case "unshare":
        await prisma.contact.updateMany({ where: { id: { in: editableIds } }, data: { isShared: bulkAction === "share" } });
        break;
    }

    await audit({ organisationId: me.organisationId, userId: me.id, action: `contact.bulk_${bulkAction}`, entityType: "Contact", details: { count: done, value: value || null } });
    revalidatePath("/contacts");
    const skipped = ids.length - done;
    return { ok: true, message: `Updated ${done} ${done === 1 ? "contact" : "contacts"}.${skipped > 0 ? ` ${skipped} skipped because you cannot change them.` : ""}` };
  } catch (error) {
    return failure(error);
  }
}
