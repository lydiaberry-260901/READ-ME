// Creating and managing outreach drafts. Every draft is for a person to review.
// Nothing here sends anything.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/permissions";
import { canColdCall, canEmailForMarketing, type ContactForChecks } from "@/lib/contacts/compliance";
import { getBusinessContext } from "@/lib/knowledge/context";
import { renderTemplate, type MergeValues } from "./merge";
import { loadOutreachContext, OutreachBlockedError, type OutreachContext } from "./context";
import { draftEmailWithAi, draftScriptWithAi, type OutreachFacts } from "./ai";
import { assembleEmail, marketingFooter } from "./footer";
import { unsubscribeUrl } from "./unsubscribe";

type Objection = { objection: string; response: string };

type CheckableContact = ContactForChecks & { email: string | null };

/** Contacts who opted out, or who do not meet the marketing rules, cannot be emailed. */
export function emailBlockReason(contact: CheckableContact, isMarketing: boolean): string | null {
  if (!contact.email) return "This contact has no work email address.";
  if (isMarketing) {
    const check = canEmailForMarketing(contact);
    return check.ok ? null : check.reason ?? "Marketing emails are not allowed for this contact.";
  }
  if (contact.optedOut) return "This person has opted out. Do not contact them.";
  if (contact.restricted) return "Use of this person's details is limited after a request from them.";
  return null;
}

export function callBlockReason(contact: CheckableContact): string | null {
  if (contact.optedOut) return "This person has opted out. Do not contact them.";
  if (contact.restricted) return "Use of this person's details is limited after a request from them.";
  if (!contact.phone) return "This contact has no work phone number.";
  return null;
}

function factsFrom(ctx: OutreachContext, reason: OutreachFacts["reason"]): OutreachFacts {
  const c = ctx.company;
  const keyFacts = ((c?.aiKeyFacts ?? {}) as { keyFacts?: string[] }).keyFacts ?? [];
  return {
    reason,
    jobTitle: ctx.contact.jobTitle,
    company: c
      ? {
          name: c.name, customerGroup: c.customerGroup, whyMatters: c.whyMatters, scoreReason: c.scoreReason,
          description: c.description, portfolioSize: c.portfolioSize, headOffice: c.headOffice, keyFacts,
        }
      : null,
    news: ctx.news ? { headline: ctx.news.headline, summary: ctx.news.summary, publishedAt: ctx.news.publishedAt } : null,
  };
}

function mergeAll(values: MergeValues, parts: string[]) {
  const missing = new Set<string>();
  const out = parts.map((p) => {
    const r = renderTemplate(p, values);
    r.missing.forEach((m) => missing.add(m));
    return r.text;
  });
  return { out, missing: [...missing] };
}

export async function createEmailDraft(actor: Actor, input: { contactId: string; templateId: string; useAi: boolean }) {
  const ctx = await loadOutreachContext(actor, input.contactId);
  const template = await prisma.emailTemplate.findFirst({ where: { id: input.templateId, organisationId: actor.organisationId, active: true } });
  if (!template) throw new OutreachBlockedError("That template could not be found.");
  const blocked = emailBlockReason(ctx.contact, template.isMarketing);
  if (blocked) throw new OutreachBlockedError(blocked);

  let subject = template.subject;
  let body = template.body;
  let aiModel: string | null = null;
  let aiNotes: { personalisationNotes?: string[]; missingInformation?: string[] } = {};

  if (input.useAi) {
    const context = await getBusinessContext(actor.organisationId);
    const { result, model } = await draftEmailWithAi({
      organisationId: actor.organisationId,
      userId: actor.id,
      facts: factsFrom(ctx, template.reason),
      template: { subject, body },
      businessContext: context.text,
    });
    subject = result.subject;
    body = result.body;
    aiModel = model;
    aiNotes = { personalisationNotes: result.personalisationNotes, missingInformation: result.missingInformation };
  }

  // Names and other personal details are filled in here, never by the AI.
  const { out: [mergedSubject, mergedBody], missing } = mergeAll(ctx.values, [subject, body]);

  const draft = await prisma.outreachDraft.create({
    data: {
      organisationId: actor.organisationId,
      userId: actor.id,
      kind: "EMAIL",
      contactId: ctx.contact.id,
      companyId: ctx.contact.companyId,
      emailTemplateId: template.id,
      isMarketing: template.isMarketing,
      subject: mergedSubject,
      body: mergedBody,
      aiGenerated: input.useAi,
      aiModel,
      aiNotes: { ...aiNotes, missingMergeFields: missing } as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: {
      organisationId: actor.organisationId, userId: actor.id, action: input.useAi ? "outreach.ai_email_drafted" : "outreach.email_drafted",
      entityType: "OutreachDraft", entityId: draft.id, details: { templateId: template.id, contactId: ctx.contact.id },
    },
  });
  return draft;
}

export async function createScriptDraft(actor: Actor, input: { contactId: string; scriptId: string; useAi: boolean }) {
  const ctx = await loadOutreachContext(actor, input.contactId);
  const script = await prisma.callScript.findFirst({ where: { id: input.scriptId, organisationId: actor.organisationId, active: true } });
  if (!script) throw new OutreachBlockedError("That call script could not be found.");
  const blocked = callBlockReason(ctx.contact);
  if (blocked) throw new OutreachBlockedError(blocked);

  let parts = {
    opening: script.opening,
    questions: (script.questions as string[]) ?? [],
    objections: (script.objections as Objection[]) ?? [],
    ask: script.ask,
  };
  let aiModel: string | null = null;
  let aiNotes: { missingInformation?: string[] } = {};

  if (input.useAi) {
    const context = await getBusinessContext(actor.organisationId);
    const { result, model } = await draftScriptWithAi({
      organisationId: actor.organisationId,
      userId: actor.id,
      facts: factsFrom(ctx, script.reason),
      script: parts,
      businessContext: context.text,
    });
    parts = { opening: result.opening, questions: result.questions, objections: result.objections, ask: result.ask };
    aiModel = model;
    aiNotes = { missingInformation: result.missingInformation };
  }

  const texts = [parts.opening, ...parts.questions, ...parts.objections.flatMap((o) => [o.objection, o.response]), parts.ask];
  const { out, missing } = mergeAll(ctx.values, texts);
  let i = 0;
  const opening = out[i++];
  const questions = parts.questions.map(() => out[i++]);
  const objections = parts.objections.map(() => ({ objection: out[i++], response: out[i++] }));
  const ask = out[i++];

  const draft = await prisma.outreachDraft.create({
    data: {
      organisationId: actor.organisationId,
      userId: actor.id,
      kind: "CALL_SCRIPT",
      contactId: ctx.contact.id,
      companyId: ctx.contact.companyId,
      callScriptId: script.id,
      isMarketing: true,
      opening,
      questions,
      objections,
      ask,
      aiGenerated: input.useAi,
      aiModel,
      aiNotes: { ...aiNotes, missingMergeFields: missing } as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: {
      organisationId: actor.organisationId, userId: actor.id, action: input.useAi ? "outreach.ai_script_drafted" : "outreach.script_drafted",
      entityType: "OutreachDraft", entityId: draft.id, details: { callScriptId: script.id, contactId: ctx.contact.id },
    },
  });
  return draft;
}

/** Drafts can only be seen and changed by the person who wrote them, and admins. */
export async function ownDraft(actor: Actor, draftId: string) {
  const draft = await prisma.outreachDraft.findFirst({
    where: { id: draftId, organisationId: actor.organisationId },
    include: { contact: true, company: { select: { id: true, name: true } }, emailTemplate: { select: { name: true } }, callScript: { select: { name: true } } },
  });
  if (!draft || (draft.userId !== actor.id && actor.role !== "ADMIN")) throw new OutreachBlockedError("That draft could not be found.");
  return draft;
}

/** A call script can only be marked ready when the number has a recent TPS and CTPS check. */
export async function markScriptReady(actor: Actor, draftId: string) {
  const draft = await ownDraft(actor, draftId);
  if (draft.kind !== "CALL_SCRIPT") throw new OutreachBlockedError("Only call scripts can be marked ready.");
  if (!draft.contact) throw new OutreachBlockedError("This script is no longer linked to a contact.");
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: actor.organisationId }, select: { phoneCheckMaxAgeDays: true } });
  const check = canColdCall(draft.contact, org.phoneCheckMaxAgeDays);
  if (!check.ok) throw new OutreachBlockedError(`Not ready to call: ${check.reason}`);
  return prisma.outreachDraft.update({ where: { id: draft.id }, data: { status: "READY", readyAt: new Date() } });
}

/** The email exactly as it would be sent, with the fixed footer for marketing emails. */
export async function emailAsSent(actor: Actor, draft: { body: string | null; isMarketing: boolean; contactId: string | null }) {
  if (!draft.isMarketing || !draft.contactId) return assembleEmail(draft.body ?? "", null);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: actor.organisationId } });
  return assembleEmail(draft.body ?? "", marketingFooter(org, unsubscribeUrl(actor.organisationId, draft.contactId)));
}
