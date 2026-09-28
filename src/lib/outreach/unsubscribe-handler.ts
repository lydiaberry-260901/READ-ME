// Handles an unsubscribe from an email link. Blocks all contact straight away, for every user.
import { prisma } from "@/lib/db";
import { recordOptOut } from "@/lib/contacts/opt-out";
import { readUnsubscribeToken } from "./unsubscribe";

export type UnsubscribeResult = "done" | "already" | "invalid";

export async function unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
  const parsed = readUnsubscribeToken(token);
  if (!parsed) return "invalid";
  const contact = await prisma.contact.findFirst({ where: { id: parsed.contactId, organisationId: parsed.organisationId } });
  // If the record has since been deleted, the opt out list already covers them or there is nobody left to contact.
  if (!contact) return "already";
  if (contact.optedOut) return "already";
  await recordOptOut({ organisationId: parsed.organisationId, contactId: contact.id, userId: null, reason: "Unsubscribed using the link in an email" });
  return "done";
}
