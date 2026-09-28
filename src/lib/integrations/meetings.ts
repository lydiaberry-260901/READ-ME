// Booking a meeting from a contact or deal. If the person has connected their calendar, the
// meeting is created there too (and invitations sent only if they ask); otherwise it is kept in
// the CRM calendar only.
import { prisma } from "@/lib/db";
import { canView, type Actor } from "@/lib/permissions";
import { OutreachBlockedError } from "@/lib/outreach/context";
import { calendarAdapter } from "./adapters";
import { ProviderError, friendlyProviderMessage } from "./http";
import { accessTokenFor, providerOf } from "./tokens";

export type MeetingInput = {
  title: string;
  startAt: Date;
  durationMinutes: number;
  location: string | null;
  description: string | null;
  contactId: string | null;
  dealId: string | null;
  sendInvites: boolean;
};

export async function createMeeting(actor: Actor, input: MeetingInput) {
  let contact = null;
  if (input.contactId) {
    contact = await prisma.contact.findFirst({ where: { id: input.contactId, organisationId: actor.organisationId } });
    if (!contact || !canView(actor, contact)) throw new OutreachBlockedError("That contact could not be found.");
    if (input.sendInvites && (contact.optedOut || contact.restricted)) throw new OutreachBlockedError("This person has opted out, so no invitation can be sent.");
    if (input.sendInvites && !contact.email) throw new OutreachBlockedError("This contact has no email address for an invitation.");
  }
  let deal = null;
  if (input.dealId) {
    deal = await prisma.deal.findFirst({ where: { id: input.dealId, organisationId: actor.organisationId } });
    if (!deal || !canView(actor, deal)) throw new OutreachBlockedError("That deal could not be found.");
  }
  const endAt = new Date(input.startAt.getTime() + input.durationMinutes * 60_000);
  const attendees = contact?.email ? [contact.email.toLowerCase()] : [];

  const account = await prisma.calendarAccount.findFirst({ where: { userId: actor.id, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
  let providerEventId: string | null = null;
  let meetingUrl: string | null = null;
  if (account) {
    try {
      const token = await accessTokenFor("calendar", account);
      const created = await calendarAdapter(providerOf(account.provider)).create(token, {
        title: input.title, description: input.description, location: input.location, startAt: input.startAt, endAt, attendees, sendInvites: input.sendInvites,
      });
      providerEventId = created.providerEventId;
      meetingUrl = created.meetingUrl;
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.kind === "auth") await prisma.calendarAccount.update({ where: { id: account.id }, data: { status: "EXPIRED", lastError: friendlyProviderMessage(error) } });
        throw new OutreachBlockedError(`The meeting was not added to your calendar. ${friendlyProviderMessage(error)}`);
      }
      throw error;
    }
  } else if (input.sendInvites) {
    throw new OutreachBlockedError("Connect your calendar to send invitations. You can still add the meeting to the CRM calendar without them.");
  }

  const event = await prisma.calendarEvent.create({
    data: {
      organisationId: actor.organisationId,
      calendarAccountId: account?.id ?? null,
      userId: actor.id,
      providerEventId,
      title: input.title,
      description: input.description,
      location: input.location,
      meetingUrl,
      startAt: input.startAt,
      endAt,
      attendees: attendees.map((email) => ({ email, name: null, response: null })),
      contactId: contact?.id ?? null,
      companyId: contact?.companyId ?? deal?.companyId ?? null,
      dealId: deal?.id ?? null,
    },
  });
  await prisma.auditLog.create({
    data: { organisationId: actor.organisationId, userId: actor.id, action: "meeting.created", entityType: "CalendarEvent", entityId: event.id, details: { invitesSent: input.sendInvites, inCalendar: Boolean(account) } },
  });
  return event;
}
