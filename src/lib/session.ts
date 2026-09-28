// Who is signed in, and what they may do. Used by every page and every action.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { can, computeVisibleOwnerIds, type Actor, type Capability } from "@/lib/permissions";

export type CurrentUser = Actor & {
  name: string | null;
  email: string;
  image: string | null;
  teamId: string | null;
  organisationName: string;
};

/** The signed in person, read fresh from the database once per request. Null if not signed in. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

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
});

/** Use at the top of every signed in page. Sends people who are not signed in to the sign in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

/** Use on pages that need a particular permission. */
export async function requireCapability(capability: Capability): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, capability)) redirect("/no-access");
  return user;
}

export class AccessDeniedError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/** Use at the top of every server action. Throws rather than redirecting. */
export async function actionUser(capability?: Capability): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AccessDeniedError("Please sign in again.");
  if (capability && !can(user, capability)) throw new AccessDeniedError();
  return user;
}
