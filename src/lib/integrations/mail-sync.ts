// Collects a person's sent and received emails and saves those involving a CRM contact against
// the contact, company and open deal. Only addresses, subject and a short snippet are kept,
// never attachments. Emails with nobody from the CRM (for example personal emails) are ignored.
import { prisma } from "@/lib/db";
import { recalculateDeal } from "@/lib/deals/recalculate";
import { truncate } from "@/lib/text";
import { mailAdapter, type NormalMessage } from "./adapters";
import { ProviderError, friendlyProviderMessage } from "./http";
import { accessTokenFor, providerOf } from "./tokens";

const FIRST_SYNC_DAYS = 30;
const OVERLAP_MS = 60 * 60_000; // look back an hour further than last time, in case of delays

export type SyncOutcome = { status: "ok" | "expired" | "skipped"; saved: number; ignored: number };

/** Chooses the deal an email belongs to: the most recently changed open deal the contact is on, if any. */
async function dealFor(contactId: string) {
  const link = await prisma.dealContact.findFirst({
    where: { contactId, deal: { stage: { kind: "OPEN" } } },
    orderBy: { deal: { updatedAt: "desc" } },
    select: { dealId: true },
  });
  return link?.dealId ?? null;
}

export async function syncMailAccount(accountId: string, now = new Date()): Promise<SyncOutcome> {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId }, include: { user: { select: { id: true, organisationId: true, active: true } } } });
  if (!account || account.status === "REVOKED" || !account.user.active || !account.user.organisationId) return { status: "skipped", saved: 0, ignored: 0 };
  const organisationId = account.user.organisationId;
  const own = account.emailAddress.toLowerCase();

  let messages: NormalMessage[];
  try {
    const token = await accessTokenFor("email", account, now);
    const since = account.lastSyncedAt ? new Date(account.lastSyncedAt.getTime() - OVERLAP_MS) : new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000);
    messages = await mailAdapter(providerOf(account.provider)).listSince(token, since);
  } catch (error) {
    if (error instanceof ProviderError) {
      const expired = error.kind === "auth";
      await prisma.emailAccount.update({ where: { id: account.id }, data: { status: expired ? "EXPIRED" : account.status, lastError: friendlyProviderMessage(error) } });
      if (expired) return { status: "expired", saved: 0, ignored: 0 };
    }
    throw error; // rate limits and temporary faults are retried by the job list
  }

  // Oldest first, so replies are seen after the emails they answer.
  messages.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const addresses = new Set<string>();
  for (const m of messages) [m.from, ...m.to, ...m.cc].forEach((a) => a && a !== own && addresses.add(a));
  const contacts = await prisma.contact.findMany({
    where: { organisationId, emailNormalised: { in: [...addresses] } },
    select: { id: true, emailNormalised: true, companyId: true },
  });
  const byEmail = new Map(contacts.map((c) => [c.emailNormalised!, c]));

  let saved = 0;
  let ignored = 0;
  const touchedDeals = new Set<string>();

  for (const m of messages) {
    const direction = m.from === own ? "SENT" : "RECEIVED";
    const others = direction === "SENT" ? [...m.to, ...m.cc] : [m.from];
    const contact = others.map((a) => byEmail.get(a)).find(Boolean);
    if (!contact) {
      ignored++;
      continue;
    }

    // An email sent from the CRM syncing back: fill in the provider's ids rather than saving it twice.
    if (m.internetMessageId) {
      const existing = await prisma.email.findUnique({ where: { organisationId_internetMessageId: { organisationId, internetMessageId: m.internetMessageId } } });
      if (existing) {
        if (!existing.providerMessageId) {
          await prisma.email.update({ where: { id: existing.id }, data: { providerMessageId: m.providerMessageId, threadId: m.threadId, emailAccountId: account.id } });
        }
        continue;
      }
    }
    const already = await prisma.email.findUnique({ where: { emailAccountId_providerMessageId: { emailAccountId: account.id, providerMessageId: m.providerMessageId } } });
    if (already) continue;

    const dealId = await dealFor(contact.id);
    const earlierSent = direction === "SENT" ? await prisma.email.count({ where: { organisationId, contactId: contact.id, direction: "SENT" } }) : 1;
    await prisma.email.create({
      data: {
        organisationId,
        emailAccountId: account.id,
        userId: account.userId,
        providerMessageId: m.providerMessageId,
        internetMessageId: m.internetMessageId,
        threadId: m.threadId,
        direction,
        fromAddress: m.from,
        toAddresses: m.to,
        ccAddresses: m.cc,
        subject: m.subject ? truncate(m.subject, 300) : null,
        snippet: m.snippet ? truncate(m.snippet, 300) : null,
        sentAt: m.sentAt,
        isFirstContact: direction === "SENT" && earlierSent === 0,
        contactId: contact.id,
        companyId: contact.companyId,
        dealId,
      },
    });
    saved++;

    // A reply: mark our latest unanswered email in the same conversation as replied to.
    if (direction === "RECEIVED" && m.threadId) {
      const answered = await prisma.email.findFirst({
        where: { organisationId, threadId: m.threadId, direction: "SENT", repliedAt: null, sentAt: { lt: m.sentAt } },
        orderBy: { sentAt: "desc" },
      });
      if (answered) await prisma.email.update({ where: { id: answered.id }, data: { repliedAt: m.sentAt } });
    }

    await prisma.contact.update({ where: { id: contact.id }, data: { lastActivityAt: m.sentAt } });
    if (contact.companyId) await prisma.company.update({ where: { id: contact.companyId }, data: { lastActivityAt: m.sentAt } });
    if (dealId) {
      await prisma.deal.updateMany({ where: { id: dealId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: m.sentAt } }] }, data: { lastActivityAt: m.sentAt } });
      touchedDeals.add(dealId);
    }
  }

  for (const id of touchedDeals) await recalculateDeal(id, { now });
  await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncedAt: now, status: "ACTIVE", lastError: null } });
  return { status: "ok", saved, ignored };
}
