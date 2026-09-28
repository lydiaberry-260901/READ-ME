// Contacts and open deals a person can link a call to.
import { prisma } from "@/lib/db";
import { visibleWhere, type Actor } from "@/lib/permissions";

export async function linkOptions(actor: Actor, keep: { contactId?: string | null; dealId?: string | null } = {}) {
  const [contacts, deals] = await Promise.all([
    prisma.contact.findMany({
      where: { AND: [visibleWhere(actor), { OR: [{ optedOut: false }, ...(keep.contactId ? [{ id: keep.contactId }] : [])] }] },
      select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } },
      orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { firstName: "asc" }],
      take: 500,
    }),
    prisma.deal.findMany({
      where: { AND: [visibleWhere(actor), { OR: [{ closedAt: null }, ...(keep.dealId ? [{ id: keep.dealId }] : [])] }] },
      select: { id: true, name: true, company: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
  ]);
  return {
    contacts: contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() + (c.company ? `, ${c.company.name}` : "") })),
    deals: deals.map((d) => ({ id: d.id, label: `${d.name}, ${d.company.name}` })),
  };
}
