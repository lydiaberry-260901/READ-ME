import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { canView } from "@/lib/permissions";
import { isoDay, addDays } from "@/lib/calendar-view";
import { PageHeader } from "@/components/ui";
import { MeetingForm } from "./MeetingForm";

export const metadata = { title: "Book a meeting" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ contactId?: string; dealId?: string }> }) {
  const user = await requireUser();
  const { contactId, dealId } = await searchParams;
  const [contact, deal, connected] = await Promise.all([
    contactId ? prisma.contact.findFirst({ where: { id: contactId, organisationId: user.organisationId }, include: { company: { select: { name: true } } } }) : null,
    dealId ? prisma.deal.findFirst({ where: { id: dealId, organisationId: user.organisationId }, include: { company: { select: { name: true } } } }) : null,
    prisma.calendarAccount.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);
  const visibleContact = contact && canView(user, contact) ? contact : null;
  const visibleDeal = deal && canView(user, deal) ? deal : null;
  const who = visibleContact ? `${visibleContact.firstName} ${visibleContact.lastName ?? ""}`.trim() : null;
  const company = visibleContact?.company?.name ?? visibleDeal?.company.name ?? null;
  const title = who ? `Meeting with ${who}${company ? `, ${company}` : ""}` : visibleDeal ? `${visibleDeal.name} meeting` : "";

  return (
    <>
      <PageHeader title="Book a meeting" description={company ? `With ${company}.` : "Add a meeting to your calendar and the CRM."} />
      <MeetingForm
        defaults={{ title, date: addDays(isoDay(new Date()), 1), time: "10:00", contactId: visibleContact?.id ?? "", dealId: visibleDeal?.id ?? "" }}
        calendarConnected={connected > 0}
        canInvite={Boolean(visibleContact?.email && !visibleContact.optedOut && !visibleContact.restricted)}
        attendee={visibleContact?.email ?? null}
      />
    </>
  );
}
