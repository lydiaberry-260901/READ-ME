// Opting someone out: blocks all contact straight away, for every user, and adds a minimal
// record to the opt out list that survives even if the rest of their details are deleted.
import { prisma } from "@/lib/db";
import { maskEmail, normaliseEmail, normalisePhone, suppressionHash } from "@/lib/crypto";

export async function isSuppressed(organisationId: string, email: string | null, phone?: string | null): Promise<boolean> {
  const hashes = [];
  if (email) hashes.push({ emailHash: suppressionHash(normaliseEmail(email)) });
  if (phone) hashes.push({ phoneHash: suppressionHash(normalisePhone(phone)) });
  if (hashes.length === 0) return false;
  return (await prisma.suppression.count({ where: { organisationId, OR: hashes } })) > 0;
}

export async function recordOptOut(input: { organisationId: string; contactId: string; userId: string | null; reason: string }) {
  const contact = await prisma.contact.findFirstOrThrow({ where: { id: input.contactId, organisationId: input.organisationId } });
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: contact.id },
      data: { optedOut: true, optedOutAt: contact.optedOutAt ?? now, doNotContactReason: input.reason },
    });
    if (contact.email) {
      const emailHash = suppressionHash(normaliseEmail(contact.email));
      await tx.suppression.upsert({
        where: { organisationId_emailHash: { organisationId: input.organisationId, emailHash } },
        update: {},
        create: { organisationId: input.organisationId, emailHash, hint: maskEmail(contact.email), reason: input.reason },
      });
    }
    if (contact.phone) {
      const phoneHash = suppressionHash(normalisePhone(contact.phone));
      await tx.suppression.upsert({
        where: { organisationId_phoneHash: { organisationId: input.organisationId, phoneHash } },
        update: {},
        create: { organisationId: input.organisationId, phoneHash, hint: "Phone number", reason: input.reason },
      });
    }
    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        userId: input.userId,
        action: "contact.opted_out",
        entityType: "Contact",
        entityId: contact.id,
        details: { reason: input.reason },
      },
    });
  });
}
