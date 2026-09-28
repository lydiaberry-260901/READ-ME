// Keeps the CRM's copy of a person's calendar up to date, from 30 days ago to 90 days ahead.
// Events with a CRM contact among the attendees are linked to that contact, company and deal.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { calendarAdapter, type NormalEvent } from "./adapters";
import { ProviderError, friendlyProviderMessage } from "./http";
import { accessTokenFor, providerOf } from "./tokens";

const PAST_DAYS = 30;
const FUTURE_DAYS = 90;

export async function syncCalendarAccount(accountId: string, now = new Date()) {
  const account = await prisma.calendarAccount.findUnique({ where: { id: accountId }, include: { user: { select: { id: true, organisationId: true, active: true } } } });
  if (!account || account.status === "REVOKED" || !account.user.active || !account.user.organisationId) return { status: "skipped" as const, saved: 0 };
  const organisationId = account.user.organisationId;
  const own = account.emailAddress.toLowerCase();
  const from = new Date(now.getTime() - PAST_DAYS * 86_400_000);
  const to = new Date(now.getTime() + FUTURE_DAYS * 86_400_000);

  let events: NormalEvent[];
  try {
    const token = await accessTokenFor("calendar", account, now);
    events = await calendarAdapter(providerOf(account.provider)).list(token, from, to);
  } catch (error) {
    if (error instanceof ProviderError) {
      const expired = error.kind === "auth";
      await prisma.calendarAccount.update({ where: { id: account.id }, data: { status: expired ? "EXPIRED" : account.status, lastError: friendlyProviderMessage(error) } });
      if (expired) return { status: "expired" as const, saved: 0 };
    }
    throw error;
  }

  const addresses = [...new Set(events.flatMap((e) => e.attendees.map((a) => a.email)).filter((a) => a && a !== own))];
  const contacts = await prisma.contact.findMany({ where: { organisationId, emailNormalised: { in: addresses } }, select: { id: true, emailNormalised: true, companyId: true } });
  const byEmail = new Map(contacts.map((c) => [c.emailNormalised!, c]));
  const seen = new Set<string>();
  let saved = 0;

  for (const e of events) {
    seen.add(e.providerEventId);
    const contact = e.attendees.map((a) => byEmail.get(a.email)).find(Boolean) ?? null;
    let dealId: string | null = null;
    if (contact) {
      const link = await prisma.dealContact.findFirst({ where: { contactId: contact.id, deal: { stage: { kind: "OPEN" } } }, orderBy: { deal: { updatedAt: "desc" } }, select: { dealId: true } });
      dealId = link?.dealId ?? null;
    }
    const data = {
      title: e.title.slice(0, 300),
      description: e.description ? e.description.slice(0, 2000) : null,
      location: e.location,
      meetingUrl: e.meetingUrl,
      startAt: e.startAt,
      endAt: e.endAt,
      allDay: e.allDay,
      cancelled: e.cancelled,
      attendees: e.attendees as unknown as Prisma.InputJsonValue,
    };
    const existing = await prisma.calendarEvent.findUnique({ where: { calendarAccountId_providerEventId: { calendarAccountId: account.id, providerEventId: e.providerEventId } } });
    if (existing) {
      // Keep links a person made by hand; only fill them in if they are empty.
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: { ...data, contactId: existing.contactId ?? contact?.id ?? null, companyId: existing.companyId ?? contact?.companyId ?? null, dealId: existing.dealId ?? dealId },
      });
    } else {
      if (e.cancelled) continue;
      await prisma.calendarEvent.create({
        data: { ...data, organisationId, calendarAccountId: account.id, userId: account.userId, providerEventId: e.providerEventId, contactId: contact?.id ?? null, companyId: contact?.companyId ?? null, dealId },
      });
      saved++;
    }
    // A meeting that has happened counts as activity with that contact.
    if (contact && !e.cancelled && e.startAt <= now) {
      await prisma.contact.updateMany({ where: { id: contact.id, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: e.startAt } }] }, data: { lastActivityAt: e.startAt } });
      if (dealId) await prisma.deal.updateMany({ where: { id: dealId, OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: e.startAt } }] }, data: { lastActivityAt: e.startAt } });
    }
  }

  // Events deleted in the calendar no longer come back from Microsoft, so mark them cancelled here.
  await prisma.calendarEvent.updateMany({
    where: { calendarAccountId: account.id, providerEventId: { notIn: [...seen] }, startAt: { gte: from, lte: to }, cancelled: false },
    data: { cancelled: true },
  });
  await prisma.calendarAccount.update({ where: { id: account.id }, data: { lastSyncedAt: now, status: "ACTIVE", lastError: null } });
  return { status: "ok" as const, saved };
}
