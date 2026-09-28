// Sending an email draft from the CRM, through the person's own email account.
// Only ever called when a person clicks Send. The contact rules are checked again at that moment.
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { OutreachBlockedError } from "@/lib/outreach/context";
import { emailBlockReason, ownDraft } from "@/lib/outreach/drafts";
import { assembleEmail, marketingFooter } from "@/lib/outreach/footer";
import { hasUnfilledGaps } from "@/lib/outreach/merge";
import { createUnsubscribeToken, unsubscribeUrl } from "@/lib/outreach/unsubscribe";
import { recalculateDeal } from "@/lib/deals/recalculate";
import { mailAdapter } from "./adapters";
import { ProviderError, friendlyProviderMessage } from "./http";
import { newMessageId } from "./mime";
import { accessTokenFor, providerOf } from "./tokens";

export async function sendDraft(actor: Actor, draftId: string, now = new Date()) {
  const draft = await ownDraft(actor, draftId);
  if (draft.kind !== "EMAIL") throw new OutreachBlockedError("Only email drafts can be sent.");
  if (draft.status !== "DRAFT") throw new OutreachBlockedError("This draft has already been sent or discarded.");
  if (!draft.contact) throw new OutreachBlockedError("This draft is no longer linked to a contact.");

  // Check the rules again now: the person may have opted out since the draft was written.
  const blocked = emailBlockReason(draft.contact, draft.isMarketing);
  if (blocked) throw new OutreachBlockedError(blocked);
  const subject = (draft.subject ?? "").trim();
  const body = (draft.body ?? "").trim();
  if (!subject || !body) throw new OutreachBlockedError("Add a subject line and a message before sending.");
  if (hasUnfilledGaps(subject) || hasUnfilledGaps(body)) throw new OutreachBlockedError("Some details are still missing, shown as [[...]]. Fill them in first.");

  const account = await prisma.emailAccount.findFirst({ where: { userId: actor.id, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
  if (!account) throw new OutreachBlockedError("Connect your email account first, under Email and calendar in the account menu.");

  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: actor.organisationId } });
  const sender = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } });
  const token = createUnsubscribeToken(org.id, draft.contact.id);
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const text = draft.isMarketing ? assembleEmail(body, marketingFooter(org, unsubscribeUrl(org.id, draft.contact.id))) : assembleEmail(body, null);
  const domain = (() => {
    try {
      return new URL(base).hostname || "moca-crm.local";
    } catch {
      return "moca-crm.local";
    }
  })();
  const messageId = newMessageId(domain);

  let result: { providerMessageId: string | null; threadId: string | null };
  try {
    const accessToken = await accessTokenFor("email", account, now);
    result = await mailAdapter(providerOf(account.provider)).send(accessToken, {
      from: account.emailAddress,
      fromName: sender.name,
      to: [draft.contact.email!],
      subject,
      text,
      messageId,
      unsubscribeUrl: draft.isMarketing ? `${base}/unsubscribe/${token}` : null,
      oneClickUrl: draft.isMarketing ? `${base}/api/unsubscribe/${token}` : null,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.kind === "auth") await prisma.emailAccount.update({ where: { id: account.id }, data: { status: "EXPIRED", lastError: friendlyProviderMessage(error) } });
      throw new OutreachBlockedError(`The email was not sent. ${friendlyProviderMessage(error)}`);
    }
    throw error;
  }

  const earlier = await prisma.email.count({ where: { organisationId: actor.organisationId, contactId: draft.contact.id, direction: "SENT" } });
  const dealLink = await prisma.dealContact.findFirst({ where: { contactId: draft.contact.id, deal: { stage: { kind: "OPEN" } } }, orderBy: { deal: { updatedAt: "desc" } }, select: { dealId: true } });
  const dealId = draft.dealId ?? dealLink?.dealId ?? null;

  const email = await prisma.$transaction(async (tx) => {
    const saved = await tx.email.create({
      data: {
        organisationId: actor.organisationId,
        emailAccountId: account.id,
        userId: actor.id,
        providerMessageId: result.providerMessageId,
        internetMessageId: messageId,
        threadId: result.threadId,
        direction: "SENT",
        fromAddress: account.emailAddress,
        toAddresses: [draft.contact!.email!.toLowerCase()],
        subject,
        snippet: body.slice(0, 300),
        bodyText: text,
        sentAt: now,
        isFirstContact: earlier === 0,
        emailTemplateId: draft.emailTemplateId,
        contactId: draft.contact!.id,
        companyId: draft.companyId,
        dealId,
      },
    });
    await tx.outreachDraft.update({ where: { id: draft.id }, data: { status: "SENT" } });
    await tx.contact.update({
      where: { id: draft.contact!.id },
      data: {
        lastActivityAt: now,
        // The footer of a marketing email holds the privacy notice line and link, so the first one
        // counts as telling the person how we use their details (when a privacy notice link is set).
        ...(draft.isMarketing && org.privacyNoticeUrl && !draft.contact!.privacyNoticeSentAt ? { privacyNoticeSentAt: now } : {}),
      },
    });
    if (draft.companyId) await tx.company.update({ where: { id: draft.companyId }, data: { lastActivityAt: now } });
    if (dealId) await tx.deal.update({ where: { id: dealId }, data: { lastActivityAt: now } });
    await tx.auditLog.create({
      data: { organisationId: actor.organisationId, userId: actor.id, action: "email.sent", entityType: "Email", entityId: saved.id, details: { draftId: draft.id, templateId: draft.emailTemplateId, firstContact: earlier === 0 } },
    });
    return saved;
  });
  if (dealId) await recalculateDeal(dealId, { now });
  return email;
}
