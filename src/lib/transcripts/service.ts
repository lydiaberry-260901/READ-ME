// Saving call transcripts, reading them with the AI, and applying approved suggestions.
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { runAiTask, aiIsConfigured, AiNotConfiguredError, AiAnswerError } from "@/lib/ai";
import { fillPrompt, loadPrompt } from "@/lib/ai/prompts";
import { getBusinessContext } from "@/lib/knowledge/context";
import { normaliseEmail } from "@/lib/crypto";
import { redactPersonalDetails, truncate } from "@/lib/text";
import { canEdit, canView, type Actor } from "@/lib/permissions";
import { QUALIFICATION_FIELDS, type QualificationKey } from "@/lib/qualification";
import { addDays, isoDay, londonParts, startOfLondonDay } from "@/lib/calendar-view";
import { moveDeal, updateQualification, DealError } from "@/lib/deals/service";
import { recalculateDeal } from "@/lib/deals/recalculate";
import type { TranscriptSource } from "@/generated/prisma/enums";
import { makeTranscriptChecker, TRANSCRIPT_PROMPT, transcriptOutputSchema, type TranscriptReading } from "./ai";
import { canManageTranscript, canViewTranscript } from "./access";

export const MIN_TRANSCRIPT_CHARS = 80;
export const MAX_TRANSCRIPT_CHARS = 200_000;

export class TranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptError";
  }
}

export type Participant = { name?: string | null; email?: string | null };

export type NewTranscript = {
  organisationId: string;
  source: TranscriptSource;
  text: string;
  title?: string | null;
  externalId?: string | null;
  callAt?: Date | null;
  durationSeconds?: number | null;
  participants?: Participant[];
  uploadedById?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  recordingNoticeGiven?: boolean | null;
  recordingNoticeDetail?: string | null;
};

/** Finds a contact and a person from our team among the call's participants, by work email. */
export async function matchParticipants(organisationId: string, participants: Participant[]) {
  const emails = [...new Set(participants.map((p) => (p.email ? normaliseEmail(p.email) : "")).filter(Boolean))];
  if (!emails.length) return { contactId: null, userId: null };
  const [contacts, users] = await Promise.all([
    prisma.contact.findMany({ where: { organisationId, emailNormalised: { in: emails } }, select: { id: true } }),
    prisma.user.findMany({ where: { organisationId, email: { in: emails, mode: "insensitive" }, active: true }, select: { id: true } }),
  ]);
  return { contactId: contacts[0]?.id ?? null, userId: users[0]?.id ?? null };
}

/** Links to a contact's most recent open deal, if the contact is a stakeholder on one. */
async function openDealFor(contactId: string) {
  const link = await prisma.dealContact.findFirst({
    where: { contactId, deal: { closedAt: null } },
    orderBy: { deal: { updatedAt: "desc" } },
    select: { dealId: true },
  });
  return link?.dealId ?? null;
}

/** Saves a transcript. The caller has checked access to any contact or deal given. Returns null for a call already saved. */
export async function saveTranscript(input: NewTranscript) {
  const text = input.text.replace(/\r\n?/g, "\n").trim();
  if (text.length < MIN_TRANSCRIPT_CHARS) throw new TranscriptError("The transcript is too short to be a call.");
  if (text.length > MAX_TRANSCRIPT_CHARS) throw new TranscriptError("The transcript is too long. Please keep it under 200,000 characters.");

  if (input.externalId) {
    const existing = await prisma.callTranscript.findUnique({ where: { organisationId_externalId: { organisationId: input.organisationId, externalId: input.externalId } }, select: { id: true } });
    if (existing) return { id: existing.id, duplicate: true as const };
  }

  let { contactId = null, dealId = null } = input;
  if (contactId && !dealId) dealId = await openDealFor(contactId);
  const [deal, contact] = await Promise.all([
    dealId ? prisma.deal.findFirst({ where: { id: dealId, organisationId: input.organisationId }, select: { id: true, companyId: true } }) : null,
    contactId ? prisma.contact.findFirst({ where: { id: contactId, organisationId: input.organisationId }, select: { id: true, companyId: true } }) : null,
  ]);
  try {
    const t = await prisma.callTranscript.create({
      data: {
        organisationId: input.organisationId,
        source: input.source,
        text,
        title: input.title?.trim().slice(0, 200) || null,
        externalId: input.externalId ?? null,
        callAt: input.callAt ?? null,
        durationSeconds: input.durationSeconds ?? null,
        participants: (input.participants ?? []).map((p) => ({ name: p.name ?? null, email: p.email ?? null })),
        uploadedById: input.uploadedById ?? null,
        contactId: contact?.id ?? null,
        dealId: deal?.id ?? null,
        companyId: deal?.companyId ?? contact?.companyId ?? null,
        matchStatus: contact || deal ? "MATCHED" : "NEEDS_MATCHING",
        recordingNoticeGiven: input.recordingNoticeGiven ?? null,
        recordingNoticeDetail: input.recordingNoticeDetail?.trim().slice(0, 500) || null,
      },
    });
    await prisma.auditLog.create({
      data: { organisationId: input.organisationId, userId: input.uploadedById ?? null, action: "transcript.added", entityType: "CallTranscript", entityId: t.id, details: { source: input.source, matched: t.matchStatus } },
    });
    return { id: t.id, duplicate: false as const };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" && input.externalId) {
      const existing = await prisma.callTranscript.findUniqueOrThrow({ where: { organisationId_externalId: { organisationId: input.organisationId, externalId: input.externalId } }, select: { id: true } });
      return { id: existing.id, duplicate: true as const };
    }
    throw error;
  }
}

/** 09:00 London time on a yyyy-mm-dd day. */
const nineAm = (day: string) => new Date(startOfLondonDay(day).getTime() + 9 * 3_600_000);

/** The next weekday after a day. */
function nextWorkingDay(day: string) {
  let d = addDays(day, 1);
  while ([5, 6].includes(londonParts(new Date(`${d}T12:00:00Z`)).weekday)) d = addDays(d, 1);
  return d;
}

/** Asks the AI to read a transcript, then saves its reading, suggestions and follow up tasks. Never changes the deal. */
export async function processTranscript(transcriptId: string, now = new Date()) {
  const t = await prisma.callTranscript.findUnique({
    where: { id: transcriptId },
    include: {
      deal: { include: { stage: true, pipeline: { include: { stages: { where: { archived: false, kind: "OPEN" }, orderBy: { position: "asc" } } } } } },
      contact: { select: { id: true, ownerId: true, firstName: true } },
    },
  });
  if (!t) return { status: "missing" as const };
  if (!aiIsConfigured()) {
    await prisma.callTranscript.update({ where: { id: t.id }, data: { processingStatus: "PENDING", processingError: "The AI is not set up yet, so this call has not been read." } });
    return { status: "waiting" as const };
  }

  await prisma.callTranscript.update({ where: { id: t.id }, data: { processingStatus: "PROCESSING", processingError: null } });
  const callDay = isoDay(t.callAt ?? t.createdAt);
  const redacted = redactPersonalDetails(truncate(t.text, 60_000));
  const openDeal = t.deal && !t.deal.closedAt ? t.deal : null;
  const openStageNames = openDeal ? openDeal.pipeline.stages.map((s) => s.name) : [];

  const context = await getBusinessContext(t.organisationId, 12_000);
  const system = fillPrompt(loadPrompt(TRANSCRIPT_PROMPT.name, TRANSCRIPT_PROMPT.version), {
    businessContext: context.text ? `Background from Moca's knowledge library:\n${context.text}` : "",
  });
  const dealLines = openDeal
    ? [
        `The call is linked to an open deal, currently at the stage "${openDeal.stage.name}".`,
        `Open stages, in order: ${openStageNames.join(", ")}.`,
        "What is already recorded for the deal's qualification:",
        ...QUALIFICATION_FIELDS.map((f) => `* ${f.key}: ${(openDeal[f.key] as string | null) ?? "not recorded"}`),
      ]
    : ["The call is not linked to an open deal, so do not suggest a stage change or qualification details (return an empty list and null)."];
  const user = [
    `The call took place on ${callDay}. Today is ${isoDay(now)}.`,
    ...dealLines,
    "",
    "Email addresses and phone numbers have been removed from the transcript.",
    "<transcript>",
    redacted,
    "</transcript>",
  ].join("\n");

  let reading: TranscriptReading;
  let model: string;
  try {
    ({ result: reading, model } = await runAiTask({
      feature: "call_transcript",
      promptVersion: `call-transcript.v${TRANSCRIPT_PROMPT.version}`,
      organisationId: t.organisationId,
      userId: t.uploadedById,
      system,
      user,
      outputSchema: transcriptOutputSchema,
      check: makeTranscriptChecker({ transcript: redacted, callDay, openStageNames }),
      maxTokens: 6000,
    }));
  } catch (error) {
    const notSetUp = error instanceof AiNotConfiguredError;
    await prisma.callTranscript.update({
      where: { id: t.id },
      data: { processingStatus: notSetUp ? "PENDING" : "FAILED", processingError: notSetUp ? "The AI is not set up yet, so this call has not been read." : error instanceof Error ? error.message : String(error) },
    });
    // Retrying will not fix a missing key or an answer that broke the rules twice.
    if (notSetUp || error instanceof AiAnswerError) return { status: "failed" as const };
    throw error;
  }

  const assigneeId = t.deal?.ownerId ?? t.uploadedById ?? t.contact?.ownerId ?? null;
  const occurredAt = t.callAt ?? t.createdAt;

  await prisma.$transaction(async (tx) => {
    await tx.callTranscript.update({
      where: { id: t.id },
      data: {
        processingStatus: "DONE",
        processingError: null,
        outcome: reading.outcome,
        summary: reading.summary,
        promises: reading.promises,
        objections: reading.objections,
        nextStep: reading.nextStep,
        aiResult: { followUps: reading.followUps, qualification: reading.qualification, suggestedStage: reading.suggestedStage, recordingNotice: reading.recordingNotice, dropped: reading.dropped, promptVersion: `call-transcript.v${TRANSCRIPT_PROMPT.version}` },
        aiModel: model,
        processedAt: now,
      },
    });

    // Suggestions replace any earlier ones not yet decided, so reading again does not pile up duplicates.
    await tx.transcriptSuggestion.deleteMany({ where: { transcriptId: t.id, status: "PENDING" } });
    if (openDeal) {
      const decided = await tx.transcriptSuggestion.findMany({ where: { transcriptId: t.id }, select: { kind: true, field: true, proposedValue: true } });
      const alreadyDecided = (field: string | null, value: string) => decided.some((d) => d.field === field && d.proposedValue === value);
      const rows = [];
      for (const q of reading.qualification) {
        const current = (openDeal[q.field] as string | null) ?? null;
        if ((current ?? "").trim().toLowerCase() === q.value.toLowerCase() || alreadyDecided(q.field, q.value)) continue;
        rows.push({ transcriptId: t.id, dealId: openDeal.id, kind: "QUALIFICATION_FIELD" as const, field: q.field, proposedValue: q.value, currentValue: current, evidence: q.evidence });
      }
      const stage = reading.suggestedStage ? openDeal.pipeline.stages.find((s) => s.name === reading.suggestedStage!.stageName) : null;
      if (stage && stage.id !== openDeal.stageId && !alreadyDecided(null, stage.id)) {
        rows.push({ transcriptId: t.id, dealId: openDeal.id, kind: "STAGE_CHANGE" as const, field: null, proposedValue: stage.id, currentValue: openDeal.stageId, evidence: `${reading.suggestedStage!.reason} "${reading.suggestedStage!.evidence}"` });
      }
      if (rows.length) await tx.transcriptSuggestion.createMany({ data: rows });
    }

    if (assigneeId) {
      const firstDue = nextWorkingDay(isoDay(now));
      await tx.task.createMany({
        skipDuplicates: true,
        data: reading.followUps.map((f, i) => ({
          organisationId: t.organisationId,
          assigneeId,
          title: f.title,
          type: f.type,
          priority: reading.outcome === "MEETING_BOOKED" || reading.outcome === "INTERESTED" ? ("HIGH" as const) : ("MEDIUM" as const),
          dueAt: nineAm(f.dueDate && f.dueDate >= isoDay(now) ? f.dueDate : firstDue),
          reason: `${f.reason} (from the call on ${callDay.split("-").reverse().join("/")})`,
          origin: "TRANSCRIPT" as const,
          dedupeKey: `transcript:${t.id}:${i}`,
          suggestedAction: "Check this against the call before acting. It was suggested by the AI.",
          draftMessage: f.draftMessage,
          companyId: t.companyId,
          contactId: t.contactId,
          dealId: t.dealId,
          transcriptId: t.id,
        })),
      });
    }

    // Record the call as an activity, once, so it counts in dashboards and resets the quiet deal clock.
    await tx.activity.upsert({
      where: { transcriptId: t.id },
      update: { contactId: t.contactId, dealId: t.dealId, companyId: t.companyId },
      create: {
        organisationId: t.organisationId, type: "CALL", userId: t.uploadedById, occurredAt, subject: t.title ?? "Call with transcript", callResult: "CONNECTED",
        durationSeconds: t.durationSeconds, companyId: t.companyId, contactId: t.contactId, dealId: t.dealId, transcriptId: t.id,
      },
    });
    if (t.dealId) await tx.deal.updateMany({ where: { id: t.dealId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: occurredAt } }] }, data: { lastActivityAt: occurredAt } });
    if (t.companyId) await tx.company.updateMany({ where: { id: t.companyId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: occurredAt } }] }, data: { lastActivityAt: occurredAt } });
    if (t.contactId) await tx.contact.updateMany({ where: { id: t.contactId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: occurredAt } }] }, data: { lastActivityAt: occurredAt } });
  });
  if (t.dealId) await recalculateDeal(t.dealId, { now });
  logger.info("Transcript read", { transcriptId: t.id, outcome: reading.outcome, dropped: reading.dropped.length });
  return { status: "done" as const, reading };
}

async function loadForActor(actor: Actor, id: string) {
  const t = await prisma.callTranscript.findFirst({
    where: { id, organisationId: actor.organisationId },
    include: { deal: { select: { organisationId: true, ownerId: true, isShared: true } }, contact: { select: { organisationId: true, ownerId: true, isShared: true } } },
  });
  if (!t || !canViewTranscript(actor, t)) throw new TranscriptError("That call could not be found.");
  return t;
}

export async function viewableTranscript(actor: Actor, id: string) {
  return loadForActor(actor, id);
}

export async function manageableTranscript(actor: Actor, id: string) {
  const t = await loadForActor(actor, id);
  if (!canManageTranscript(actor, t)) throw new TranscriptError("Only the person who added this call, the deal's owner, their manager or an admin can change it.");
  return t;
}

/** Links a transcript to a contact and deal the person can see. Earlier undecided suggestions are removed, as they were for another deal. */
export async function linkTranscript(actor: Actor, id: string, input: { contactId: string | null; dealId: string | null }) {
  const t = await manageableTranscript(actor, id);
  const [contact, deal] = await Promise.all([
    input.contactId ? prisma.contact.findFirst({ where: { id: input.contactId, organisationId: actor.organisationId } }) : null,
    input.dealId ? prisma.deal.findFirst({ where: { id: input.dealId, organisationId: actor.organisationId } }) : null,
  ]);
  if (input.contactId && (!contact || !canView(actor, contact))) throw new TranscriptError("That contact could not be found.");
  if (input.dealId && (!deal || !canView(actor, deal))) throw new TranscriptError("That deal could not be found.");
  const dealChanged = (deal?.id ?? null) !== t.dealId;
  await prisma.callTranscript.update({
    where: { id: t.id },
    data: { contactId: contact?.id ?? null, dealId: deal?.id ?? null, companyId: deal?.companyId ?? contact?.companyId ?? null, matchStatus: contact || deal ? "MATCHED" : "NEEDS_MATCHING" },
  });
  if (dealChanged) await prisma.transcriptSuggestion.deleteMany({ where: { transcriptId: t.id, status: "PENDING" } });
  await prisma.activity.updateMany({ where: { transcriptId: t.id }, data: { contactId: contact?.id ?? null, dealId: deal?.id ?? null, companyId: deal?.companyId ?? contact?.companyId ?? null } });
  await prisma.auditLog.create({ data: { organisationId: actor.organisationId, userId: actor.id, action: "transcript.linked", entityType: "CallTranscript", entityId: t.id, details: { contactId: contact?.id ?? null, dealId: deal?.id ?? null } } });
  return { dealChanged };
}

/** Deletes a transcript and its suggestions. Tasks made from it stay, without the link. */
export async function deleteTranscript(actor: Actor, id: string) {
  const t = await manageableTranscript(actor, id);
  await prisma.callTranscript.delete({ where: { id: t.id } });
  await prisma.auditLog.create({ data: { organisationId: actor.organisationId, userId: actor.id, action: "transcript.deleted", entityType: "CallTranscript", entityId: t.id } });
}

/**
 * Approves one suggestion, applying it through the normal deal rules (so access, history, alerts
 * and health all work as usual). A qualification value may be edited before approving.
 */
export async function approveSuggestion(actor: Actor & { name?: string | null }, suggestionId: string, editedValue?: string | null) {
  const s = await prisma.transcriptSuggestion.findFirst({ where: { id: suggestionId, deal: { organisationId: actor.organisationId } }, include: { deal: { include: { stage: true } } } });
  if (!s || !canView(actor, s.deal)) throw new TranscriptError("That suggestion could not be found.");
  if (s.status !== "PENDING") throw new TranscriptError("That suggestion has already been decided.");
  if (!canEdit(actor, s.deal, { sharedIsEditable: false })) throw new DealError("Only the deal's owner, their manager or an admin can change this deal.");

  let alertIds: string[] = [];
  let applied = s.proposedValue;
  if (s.kind === "QUALIFICATION_FIELD") {
    const key = s.field as QualificationKey;
    if (!QUALIFICATION_FIELDS.some((f) => f.key === key)) throw new TranscriptError("That suggestion is for an unknown field.");
    applied = (editedValue ?? s.proposedValue).trim();
    if (!applied) throw new TranscriptError("The value cannot be empty.");
    await updateQualification(actor, s.dealId, { [key]: applied });
  } else {
    const stage = await prisma.stage.findFirst({ where: { id: s.proposedValue, pipelineId: s.deal.pipelineId, archived: false, kind: "OPEN" } });
    if (!stage) throw new TranscriptError("That stage no longer exists or is not an open stage.");
    if (s.deal.closedAt) throw new TranscriptError("The deal has been closed since this was suggested.");
    alertIds = (await moveDeal(actor, s.dealId, stage.id)).alertIds;
  }
  await prisma.transcriptSuggestion.update({ where: { id: s.id }, data: { status: "APPROVED", decidedById: actor.id, decidedAt: new Date(), proposedValue: applied } });
  await prisma.auditLog.create({ data: { organisationId: actor.organisationId, userId: actor.id, action: "transcript.suggestion_approved", entityType: "Deal", entityId: s.dealId, details: { suggestionId: s.id, kind: s.kind, field: s.field } } });
  return { alertIds, dealId: s.dealId, transcriptId: s.transcriptId };
}

export async function rejectSuggestion(actor: Actor, suggestionId: string) {
  const s = await prisma.transcriptSuggestion.findFirst({ where: { id: suggestionId, deal: { organisationId: actor.organisationId } }, include: { deal: true } });
  if (!s || !canView(actor, s.deal)) throw new TranscriptError("That suggestion could not be found.");
  if (s.status !== "PENDING") throw new TranscriptError("That suggestion has already been decided.");
  if (!canEdit(actor, s.deal, { sharedIsEditable: false })) throw new DealError("Only the deal's owner, their manager or an admin can change this deal.");
  await prisma.transcriptSuggestion.update({ where: { id: s.id }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date() } });
  return { dealId: s.dealId, transcriptId: s.transcriptId };
}
