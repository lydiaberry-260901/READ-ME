// Choices used by filters and forms: people, tags and lists the signed in person can use.
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";

export async function loadPickerOptions(user: CurrentUser) {
  const [people, tags, lists] = await Promise.all([
    prisma.user.findMany({
      where: { organisationId: user.organisationId, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({ where: { organisationId: user.organisationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.prospectList.findMany({
      where: { organisationId: user.organisationId, OR: [{ isShared: true }, { ownerId: user.id }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    people: people.map((p) => ({ id: p.id, name: p.name ?? p.email })),
    tags,
    lists,
    // Reps may only make themselves the owner.
    assignableOwners: user.role === "REP" ? people.filter((p) => p.id === user.id).map((p) => ({ id: p.id, name: p.name ?? p.email })) : people.map((p) => ({ id: p.id, name: p.name ?? p.email })),
  };
}
