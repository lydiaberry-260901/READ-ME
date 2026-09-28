// Everything needed to write outreach to one contact: the contact, their company, the latest
// relevant news, the sender and the organisation's footer details. Access is checked here.
import { prisma } from "@/lib/db";
import { canView, type Actor } from "@/lib/permissions";
import type { MergeValues } from "./merge";

export class OutreachBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutreachBlockedError";
  }
}

export async function loadOutreachContext(actor: Actor, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organisationId: actor.organisationId },
    include: { company: true },
  });
  if (!contact || !canView(actor, contact)) throw new OutreachBlockedError("That contact could not be found.");

  const [sender, org, news] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true, email: true, jobTitle: true } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: actor.organisationId } }),
    contact.companyId
      ? prisma.newsItem.findFirst({
          where: { organisationId: actor.organisationId, companyId: contact.companyId },
          orderBy: [{ relevance: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }],
        })
      : null,
  ]);

  const values: MergeValues = {
    "contact.firstName": contact.firstName,
    "contact.lastName": contact.lastName,
    "contact.jobTitle": contact.jobTitle,
    "company.name": contact.company?.name,
    "company.summary": contact.company?.whyMatters,
    "news.headline": news?.headline,
    "sender.name": sender.name,
    "sender.jobTitle": sender.jobTitle,
    "sender.email": sender.email,
  };

  return { contact, company: contact.company, news, sender, org, values };
}

export type OutreachContext = Awaited<ReturnType<typeof loadOutreachContext>>;
