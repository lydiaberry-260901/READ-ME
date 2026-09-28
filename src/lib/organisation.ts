// Creating an organisation and deciding who may join it.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { normaliseEmail } from "@/lib/crypto";
import { defaultStageColours } from "@/design/tokens";
import { installStarterLibrary } from "@/lib/outreach/starter-library";

const c = defaultStageColours;

export const DEFAULT_STAGES = [
  { name: "Prospect", kind: "OPEN", probability: 5, colour: c.Prospect },
  { name: "Contacted", kind: "OPEN", probability: 10, colour: c.Contacted },
  { name: "Conversation", kind: "OPEN", probability: 20, colour: c.Conversation },
  { name: "Demo", kind: "OPEN", probability: 35, colour: c.Demo },
  { name: "Proposal", kind: "OPEN", probability: 50, colour: c.Proposal },
  { name: "Negotiation", kind: "OPEN", probability: 75, colour: c.Negotiation },
  { name: "Won", kind: "WON", probability: 100, colour: c.Won },
  { name: "Lost", kind: "LOST", probability: 0, colour: c.Lost },
] as const;

type Db = Pick<PrismaClient, "organisation" | "pipeline" | "user" | "invitation" | "emailTemplate" | "callScript" | "$transaction">;

export async function createOrganisation(db: Db, name: string) {
  const org = await db.organisation.create({
    data: {
      name,
      pipelines: {
        create: {
          name: "Sales pipeline",
          isDefault: true,
          stages: {
            create: DEFAULT_STAGES.map((s, i) => ({ ...s, position: i })),
          },
        },
      },
    },
  });
  await installStarterLibrary(db, org.id);
  return org;
}

export type SignInDecision =
  | { allowed: true; reason: "existing_user" | "invited" | "first_user" }
  | { allowed: false; reason: "inactive" | "not_invited" };

/**
 * Decide whether an email address may sign in.
 * The very first person to sign in creates the organisation and becomes its admin.
 * After that, only existing active users and people with a valid invitation can join.
 */
export async function decideSignIn(db: Db, rawEmail: string, now = new Date()): Promise<SignInDecision> {
  const email = normaliseEmail(rawEmail);
  const user = await db.user.findUnique({ where: { email } });
  if (user?.organisationId) {
    return user.active ? { allowed: true, reason: "existing_user" } : { allowed: false, reason: "inactive" };
  }
  const invite = await findValidInvitation(db, email, now);
  if (invite) return { allowed: true, reason: "invited" };
  const orgCount = await db.organisation.count();
  if (orgCount === 0) return { allowed: true, reason: "first_user" };
  return { allowed: false, reason: "not_invited" };
}

export async function findValidInvitation(db: Pick<PrismaClient, "invitation">, email: string, now = new Date()) {
  return db.invitation.findFirst({
    where: {
      email: normaliseEmail(email),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * After sign in, make sure the user belongs to an organisation:
 * accept their invitation, or create the organisation if they are the first person.
 */
export async function attachUserToOrganisation(db: PrismaClient, userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  if (user.organisationId) {
    return db.user.update({ where: { id: userId }, data: { lastSignInAt: now } });
  }

  return db.$transaction(async (tx) => {
    const invite = await findValidInvitation(tx, user.email, now);
    if (invite) {
      await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: now } });
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          organisationId: invite.organisationId,
          role: invite.role,
          teamId: invite.teamId,
          lastSignInAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          organisationId: invite.organisationId,
          userId,
          action: "user.joined",
          entityType: "User",
          entityId: userId,
          details: { role: invite.role, invitedById: invite.invitedById },
        },
      });
      return updated;
    }

    const orgCount = await tx.organisation.count();
    if (orgCount > 0) return user;

    const org = await createOrganisation(tx as unknown as Db, "Moca");
    const role: Role = "ADMIN";
    const updated = await tx.user.update({
      where: { id: userId },
      data: { organisationId: org.id, role, lastSignInAt: now },
    });
    await tx.auditLog.create({
      data: {
        organisationId: org.id,
        userId,
        action: "organisation.created",
        entityType: "Organisation",
        entityId: org.id,
      },
    });
    return updated;
  });
}
