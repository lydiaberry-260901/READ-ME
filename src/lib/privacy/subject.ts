// Everything held about one person, in one file; places their name appears in free text; and
// deleting their details. Used for requests from people about their data, and for deleting
// records that have been kept too long.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { maskEmail, normaliseEmail, normalisePhone, suppressionHash } from "@/lib/crypto";
import { lawfulBasisLabels, entityTypeLabels } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";

export type Mention = { where: string; label: string; snippet: string; href: string | null };

function snippetAround(text: string, needle: string) {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text.slice(0, 160);
  const start = Math.max(0, i - 60);
  return `${start > 0 ? "…" : ""}${text.slice(start, i + needle.length + 80).replace(/\s+/g, " ")}${i + needle.length + 80 < text.length ? "…" : ""}`;
}

/**
 * Free text elsewhere in the CRM that names the person: notes, tasks, transcripts, drafts and deal
 * fields. These are not linked to their record, so a person must check them by hand.
 */
export async function findMentions(organisationId: string, name: string, excludeContactId?: string): Promise<Mention[]> {
  const needle = name.trim();
  if (needle.length < 4) return [];
  const has = { contains: needle, mode: "insensitive" as const };
  const [notes, tasks, transcripts, drafts, deals, contacts] = await Promise.all([
    prisma.activity.findMany({ where: { organisationId, body: has, ...(excludeContactId ? { NOT: { contactId: excludeContactId } } : {}) }, select: { id: true, body: true, dealId: true, companyId: true, occurredAt: true }, take: 50 }),
    prisma.task.findMany({ where: { organisationId, OR: [{ title: has }, { description: has }, { draftMessage: has }], ...(excludeContactId ? { NOT: { contactId: excludeContactId } } : {}) }, select: { id: true, title: true, description: true, draftMessage: true }, take: 50 }),
    prisma.callTranscript.findMany({ where: { organisationId, OR: [{ text: has }, { summary: has }], ...(excludeContactId ? { NOT: { contactId: excludeContactId } } : {}) }, select: { id: true, title: true, text: true }, take: 50 }),
    prisma.outreachDraft.findMany({ where: { organisationId, OR: [{ body: has }, { subject: has }], ...(excludeContactId ? { NOT: { contactId: excludeContactId } } : {}) }, select: { id: true, subject: true, body: true }, take: 50 }),
    prisma.deal.findMany({
      where: { organisationId, OR: [{ nextStep: has }, { economicBuyer: has }, { champion: has }, { decisionProcess: has }, { identifiedPain: has }, { metric: has }, { decisionCriteria: has }, { paperProcess: has }, { competition: has }, { closeNote: has }] },
      select: { id: true, name: true, nextStep: true, economicBuyer: true, champion: true, decisionProcess: true, identifiedPain: true, metric: true, decisionCriteria: true, paperProcess: true, competition: true, closeNote: true },
      take: 50,
    }),
    prisma.contact.findMany({ where: { organisationId, notes: has, ...(excludeContactId ? { NOT: { id: excludeContactId } } : {}) }, select: { id: true, firstName: true, lastName: true, notes: true }, take: 50 }),
  ]);
  const out: Mention[] = [];
  for (const n of notes) out.push({ where: "Note or activity", label: formatDate(n.occurredAt), snippet: snippetAround(n.body ?? "", needle), href: n.dealId ? `/deals/${n.dealId}` : n.companyId ? `/companies/${n.companyId}` : null });
  for (const t of tasks) out.push({ where: "Task", label: t.title, snippet: snippetAround([t.title, t.description, t.draftMessage].filter(Boolean).join(" "), needle), href: "/tasks" });
  for (const t of transcripts) out.push({ where: "Call transcript", label: t.title ?? "Call transcript", snippet: snippetAround(t.text, needle), href: `/transcripts/${t.id}` });
  for (const d of drafts) out.push({ where: "Outreach draft", label: d.subject ?? "Draft", snippet: snippetAround(d.body ?? "", needle), href: `/outreach/drafts/${d.id}` });
  for (const d of deals) {
    const text = [d.nextStep, d.economicBuyer, d.champion, d.decisionProcess, d.identifiedPain, d.metric, d.decisionCriteria, d.paperProcess, d.competition, d.closeNote].filter(Boolean).join(" | ");
    out.push({ where: "Deal", label: d.name, snippet: snippetAround(text, needle), href: `/deals/${d.id}` });
  }
  for (const c of contacts) out.push({ where: "Another contact's notes", label: `${c.firstName} ${c.lastName ?? ""}`.trim(), snippet: snippetAround(c.notes ?? "", needle), href: `/contacts/${c.id}` });
  return out;
}

/** One file with everything held about a contact, for a request to see their data or receive a copy. */
export async function subjectAccessExport(organisationId: string, contactId: string, now = new Date()) {
  const c = await prisma.contact.findFirstOrThrow({
    where: { id: contactId, organisationId },
    include: {
      company: { select: { name: true } },
      owner: { select: { name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      dealRoles: { include: { deal: { select: { name: true, stage: { select: { name: true } } } } } },
      listMembers: { include: { list: { select: { name: true } } } },
    },
  });
  const [activities, emails, events, tasks, transcripts, drafts, org] = await Promise.all([
    prisma.activity.findMany({ where: { organisationId, contactId }, select: { type: true, occurredAt: true, subject: true, body: true, callResult: true, durationSeconds: true }, orderBy: { occurredAt: "asc" } }),
    prisma.email.findMany({ where: { organisationId, contactId }, select: { direction: true, sentAt: true, fromAddress: true, toAddresses: true, ccAddresses: true, subject: true, snippet: true, bodyText: true }, orderBy: { sentAt: "asc" } }),
    prisma.calendarEvent.findMany({ where: { organisationId, contactId }, select: { title: true, startAt: true, endAt: true, location: true, cancelled: true }, orderBy: { startAt: "asc" } }),
    prisma.task.findMany({ where: { organisationId, contactId }, select: { title: true, description: true, dueAt: true, status: true, draftMessage: true }, orderBy: { createdAt: "asc" } }),
    prisma.callTranscript.findMany({ where: { organisationId, contactId }, select: { title: true, callAt: true, createdAt: true, text: true, summary: true, outcome: true, recordingNoticeGiven: true, recordingNoticeDetail: true }, orderBy: { createdAt: "asc" } }),
    prisma.outreachDraft.findMany({ where: { organisationId, contactId }, select: { kind: true, status: true, subject: true, body: true, opening: true, ask: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true, legalName: true, privacyNoticeUrl: true, retainContactsMonths: true, retainTranscriptsMonths: true } }),
  ]);
  const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
  const mentions = await findMentions(organisationId, name, c.id);
  const suppressed = c.email ? (await prisma.suppression.count({ where: { organisationId, emailHash: suppressionHash(normaliseEmail(c.email)) } })) > 0 : false;

  return {
    about: {
      title: `Personal data held about ${name}`,
      heldBy: org.legalName ?? org.name,
      preparedOn: formatDateTime(now),
      whyWeHoldIt: "To contact people at businesses that may benefit from Moca's energy software, and to manage our business relationships.",
      lawfulBasis: lawfulBasisLabels[c.lawfulBasis],
      howLongWeKeepIt: `Contact details are deleted after ${org.retainContactsMonths} months with no activity. Call transcripts are kept for ${org.retainTranscriptsMonths} months.`,
      whoWeShareItWith: "Our suppliers that store or process data for us, such as our hosting, email and AI services. We do not sell personal data.",
      automatedDecisions: "None. Scores are about companies, not people, and a person reviews everything the AI writes.",
      yourRights: "You can ask us to correct, delete or limit the use of your details, object to their use, or receive a copy.",
      privacyNotice: org.privacyNoticeUrl,
    },
    details: {
      name,
      jobTitle: c.jobTitle,
      workEmail: c.email,
      workPhone: c.phone,
      professionalProfile: c.linkedinUrl,
      company: c.company?.name ?? null,
      notes: c.notes,
      tags: c.tags.map((t) => t.tag.name),
      lists: c.listMembers.map((m) => m.list.name),
      ownerInOurTeam: c.owner?.name ?? null,
    },
    whereTheDetailsCameFrom: { source: c.source, collectedOn: formatDate(c.collectedAt), privacyNoticeSentOn: c.privacyNoticeSentAt ? formatDate(c.privacyNoticeSentAt) : null },
    marketingRules: {
      organisationType: entityTypeLabels[c.entityType],
      consentGivenOn: c.consentAt ? formatDate(c.consentAt) : null,
      phoneCheckedAgainstDoNotCallListsOn: c.phoneCheckedAt ? formatDate(c.phoneCheckedAt) : null,
      optedOut: c.optedOut,
      optedOutOn: c.optedOutAt ? formatDate(c.optedOutAt) : null,
      onDoNotContactList: suppressed,
      useLimited: c.restricted,
    },
    deals: c.dealRoles.map((r) => ({ deal: r.deal.name, stage: r.deal.stage.name, role: r.role, engaged: r.engaged })),
    activities: activities.map((a) => ({ type: a.type, when: formatDateTime(a.occurredAt), subject: a.subject, note: a.body, callResult: a.callResult, durationSeconds: a.durationSeconds })),
    emails: emails.map((e) => ({ direction: e.direction, when: formatDateTime(e.sentAt), from: e.fromAddress, to: e.toAddresses, cc: e.ccAddresses, subject: e.subject, extract: e.snippet, body: e.bodyText })),
    meetings: events.map((e) => ({ title: e.title, start: formatDateTime(e.startAt), end: formatDateTime(e.endAt), location: e.location, cancelled: e.cancelled })),
    tasks: tasks.map((t) => ({ title: t.title, description: t.description, due: t.dueAt ? formatDateTime(t.dueAt) : null, status: t.status, draftMessage: t.draftMessage })),
    callTranscripts: transcripts.map((t) => ({ title: t.title, when: formatDateTime(t.callAt ?? t.createdAt), outcome: t.outcome, summary: t.summary, toldCallWasRecorded: t.recordingNoticeGiven, howTold: t.recordingNoticeDetail, transcript: t.text })),
    outreachDrafts: drafts.map((d) => ({ kind: d.kind, status: d.status, subject: d.subject, body: d.body, opening: d.opening, ask: d.ask, created: formatDateTime(d.createdAt) })),
    otherMentions: mentions.map((m) => ({ where: m.where, record: m.label, text: m.snippet })),
  };
}

/** Adds a person's email and phone to the do not contact list, as keyed hashes only. */
export async function suppress(tx: Prisma.TransactionClient, organisationId: string, email: string | null, phone: string | null, reason: string) {
  if (email) {
    const emailHash = suppressionHash(normaliseEmail(email));
    await tx.suppression.upsert({ where: { organisationId_emailHash: { organisationId, emailHash } }, update: {}, create: { organisationId, emailHash, hint: maskEmail(email), reason } });
  }
  if (phone) {
    const phoneHash = suppressionHash(normalisePhone(phone));
    await tx.suppression.upsert({ where: { organisationId_phoneHash: { organisationId, phoneHash } }, update: {}, create: { organisationId, phoneHash, hint: "Phone number", reason } });
  }
}

/**
 * Deletes a contact and the personal data linked to them: emails, call transcripts, drafts and
 * tasks about them. Calls, emails and meetings stay counted in the dashboards as anonymous
 * activity. Optionally keeps a minimal entry on the do not contact list.
 */
export async function eraseContact(input: { organisationId: string; contactId: string; userId: string | null; keepOnDoNotContactList: boolean; reason: string }) {
  const c = await prisma.contact.findFirstOrThrow({ where: { id: input.contactId, organisationId: input.organisationId } });
  const address = c.email ? normaliseEmail(c.email) : null;
  const summary = await prisma.$transaction(async (tx) => {
    if (input.keepOnDoNotContactList) await suppress(tx, input.organisationId, c.email, c.phone, input.reason);
    const where = { organisationId: input.organisationId, contactId: c.id };
    const emails = await tx.email.deleteMany({ where });
    const transcripts = await tx.callTranscript.deleteMany({ where });
    const drafts = await tx.outreachDraft.deleteMany({ where });
    const tasks = await tx.task.deleteMany({ where });
    // Keep activity counts for the dashboards, without anything that identifies the person.
    const activities = await tx.activity.updateMany({ where, data: { contactId: null, subject: null, body: null } });
    // Meetings stay in the owner's calendar view, without the link or the person's address.
    const events = await tx.calendarEvent.findMany({ where, select: { id: true, attendees: true } });
    for (const e of events) {
      const attendees = ((e.attendees ?? []) as { email?: string }[]).filter((a) => !address || a.email?.toLowerCase() !== address);
      await tx.calendarEvent.update({ where: { id: e.id }, data: { contactId: null, attendees: attendees as Prisma.InputJsonValue } });
    }
    await tx.contact.delete({ where: { id: c.id } });
    const counts = { emails: emails.count, transcripts: transcripts.count, drafts: drafts.count, tasks: tasks.count, activitiesAnonymised: activities.count, meetingsUnlinked: events.length };
    await tx.auditLog.create({
      data: { organisationId: input.organisationId, userId: input.userId, action: "contact.erased", entityType: "Contact", entityId: c.id, details: { reason: input.reason, keptOnDoNotContactList: input.keepOnDoNotContactList, ...counts } },
    });
    return counts;
  });
  return summary;
}
