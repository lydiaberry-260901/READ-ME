// Loads a person with everything needed to check their access.
// Used by the web app (for the signed in person) and the worker (for the person who started a job).
import { prisma } from "@/lib/db";
import { computeVisibleOwnerIds, type Actor } from "@/lib/permissions";

export type LoadedActor = Actor & {
  name: string | null;
  email: string;
  image: string | null;
  teamId: string | null;
  organisationName: string;
};

export async function loadActor(userId: string): Promise<LoadedActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      organisation: true,
      team: { include: { members: { select: { id: true } } } },
      managedTeams: { include: { members: { select: { id: true } } } },
    },
  });
  if (!user || !user.active || !user.organisationId || !user.organisation) return null;

  return {
    id: user.id,
    organisationId: user.organisationId,
    organisationName: user.organisation.name,
    role: user.role,
    name: user.name,
    email: user.email,
    image: user.image,
    teamId: user.teamId,
    isDataProtectionLead: user.organisation.dataProtectionLeadId === user.id,
    visibleOwnerIds: computeVisibleOwnerIds({
      userId: user.id,
      role: user.role,
      teamMemberIdsOfManagedTeams: user.managedTeams.flatMap((t) => t.members.map((m) => m.id)),
      teamMemberIdsOfOwnTeam: user.team?.members.map((m) => m.id) ?? [],
    }),
  };
}
