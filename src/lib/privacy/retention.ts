// Keeping data for a limited time. Each month a list is made of records past their keeping period.
// Nothing is deleted until an admin approves the list, and each record is checked again at that
// moment, so anything used in the meantime is kept.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { eraseContact } from "./subject";

export type RetentionKind = "CONTACT" | "TRANSCRIPT" | "NEWS";
export type RetentionItem = { kind: RetentionKind; id: string; label: string; reason: string };

const MAX_ITEMS_PER_KIND = 2000;

export function monthsBefore(now: Date, months: number) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

type Settings = { retainContactsMonths: number; retainTranscriptsMonths: number; retainNewsMonths: number };

/** The rules for each kind of record, shared by building the list and applying it. */
function rules(organisationId: string, s: Settings, now: Date) {
  const contactCutoff = monthsBefore(now, s.retainContactsMonths);
  return {
    contactCutoff,
    contacts: {
      organisationId,
      OR: [{ lastActivityAt: { lt: contactCutoff } }, { lastActivityAt: null, createdAt: { lt: contactCutoff } }],
      // People on open deals, or with a request in progress, are kept.
      dealRoles: { none: { deal: { closedAt: null } } },
      dataRequests: { none: { status: { in: ["OPEN", "IN_PROGRESS"] } } },
    } satisfies Prisma.ContactWhereInput,
    transcripts: { organisationId, createdAt: { lt: monthsBefore(now, s.retainTranscriptsMonths) } } satisfies Prisma.CallTranscriptWhereInput,
    news: { organisationId, createdAt: { lt: monthsBefore(now, s.retainNewsMonths) } } satisfies Prisma.NewsItemWhereInput,
  };
}

/** Builds this month's list. Replaces a list still waiting for approval, so there is only ever one. */
export async function buildRetentionReview(organisationId: string, now = new Date()) {
  const s = await prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { retainContactsMonths: true, retainTranscriptsMonths: true, retainNewsMonths: true } });
  const r = rules(organisationId, s, now);
  const [contacts, transcripts, news, counts] = await Promise.all([
    prisma.contact.findMany({ where: r.contacts, select: { id: true, firstName: true, lastName: true, lastActivityAt: true, company: { select: { name: true } } }, take: MAX_ITEMS_PER_KIND, orderBy: { createdAt: "asc" } }),
    prisma.callTranscript.findMany({ where: r.transcripts, select: { id: true, title: true, createdAt: true }, take: MAX_ITEMS_PER_KIND, orderBy: { createdAt: "asc" } }),
    prisma.newsItem.findMany({ where: r.news, select: { id: true, headline: true }, take: MAX_ITEMS_PER_KIND, orderBy: { createdAt: "asc" } }),
    Promise.all([prisma.contact.count({ where: r.contacts }), prisma.callTranscript.count({ where: r.transcripts }), prisma.newsItem.count({ where: r.news })]),
  ]);
  const items: RetentionItem[] = [
    ...contacts.map((c) => ({ kind: "CONTACT" as const, id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() + (c.company ? `, ${c.company.name}` : ""), reason: c.lastActivityAt ? `No activity for more than ${s.retainContactsMonths} months` : `Added more than ${s.retainContactsMonths} months ago with no activity` })),
    ...transcripts.map((t) => ({ kind: "TRANSCRIPT" as const, id: t.id, label: t.title ?? "Call transcript", reason: `Older than ${s.retainTranscriptsMonths} months` })),
    ...news.map((n) => ({ kind: "NEWS" as const, id: n.id, label: n.headline, reason: `Older than ${s.retainNewsMonths} months` })),
  ];
  const countsJson = { contacts: counts[0], transcripts: counts[1], news: counts[2] };
  const pending = await prisma.retentionReview.findFirst({ where: { organisationId, status: "PENDING" } });
  if (items.length === 0) {
    if (pending) await prisma.retentionReview.update({ where: { id: pending.id }, data: { status: "DISMISSED", decidedAt: now, result: { note: "Nothing was due any more." } } });
    return null;
  }
  if (pending) return prisma.retentionReview.update({ where: { id: pending.id }, data: { items, counts: countsJson, createdAt: now } });
  return prisma.retentionReview.create({ data: { organisationId, items, counts: countsJson, createdAt: now } });
}

/** Deletes the approved records, except any the admin chose to keep, after checking each is still due. */
export async function applyRetentionReview(input: { organisationId: string; reviewId: string; userId: string; keepIds: string[]; now?: Date }) {
  const now = input.now ?? new Date();
  const review = await prisma.retentionReview.findFirst({ where: { id: input.reviewId, organisationId: input.organisationId, status: "PENDING" } });
  if (!review) throw new Error("That list has already been decided.");
  const s = await prisma.organisation.findUniqueOrThrow({ where: { id: input.organisationId }, select: { retainContactsMonths: true, retainTranscriptsMonths: true, retainNewsMonths: true } });
  const r = rules(input.organisationId, s, now);
  const keep = new Set(input.keepIds);
  const items = (review.items as RetentionItem[]).filter((i) => !keep.has(i.id));
  const ids = (kind: RetentionKind) => items.filter((i) => i.kind === kind).map((i) => i.id);

  // Check again: anything used since the list was made is no longer due.
  const [contactsStillDue, transcriptsStillDue, newsStillDue] = await Promise.all([
    prisma.contact.findMany({ where: { AND: [r.contacts, { id: { in: ids("CONTACT") } }] }, select: { id: true, optedOut: true } }),
    prisma.callTranscript.findMany({ where: { AND: [r.transcripts, { id: { in: ids("TRANSCRIPT") } }] }, select: { id: true } }),
    prisma.newsItem.findMany({ where: { AND: [r.news, { id: { in: ids("NEWS") } }] }, select: { id: true } }),
  ]);
  for (const c of contactsStillDue) {
    // People who opted out stay on the do not contact list, so they are never contacted again.
    await eraseContact({ organisationId: input.organisationId, contactId: c.id, userId: input.userId, keepOnDoNotContactList: c.optedOut, reason: "Kept longer than the retention period" });
  }
  const transcripts = await prisma.callTranscript.deleteMany({ where: { id: { in: transcriptsStillDue.map((t) => t.id) } } });
  const news = await prisma.newsItem.deleteMany({ where: { id: { in: newsStillDue.map((n) => n.id) } } });
  const result = {
    deleted: { contacts: contactsStillDue.length, transcripts: transcripts.count, news: news.count },
    keptByChoice: input.keepIds.length,
    keptBecauseUsedSince: items.length - contactsStillDue.length - transcripts.count - news.count,
  };
  await prisma.retentionReview.update({ where: { id: review.id }, data: { status: "APPROVED", decidedById: input.userId, decidedAt: now, result } });
  await prisma.auditLog.create({ data: { organisationId: input.organisationId, userId: input.userId, action: "retention.approved", entityType: "RetentionReview", entityId: review.id, details: result } });
  return result;
}
