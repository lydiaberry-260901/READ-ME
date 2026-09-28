"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError } from "@/lib/session";
import { audit } from "@/lib/audit";
import { normaliseEmail, randomToken } from "@/lib/crypto";

export type ActionResult = { ok: boolean; message: string; link?: string };

const INVITE_DAYS = 14;

const roleSchema = z.enum(["ADMIN", "MANAGER", "REP"]);
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));

function fail(error: unknown): ActionResult {
  if (error instanceof AccessDeniedError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? "Please check the form." };
  console.error(error);
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function inviteUser(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("users.manage");
    const input = z
      .object({
        email: z.string().trim().email("Enter a valid work email address."),
        role: roleSchema,
        teamId: optionalId,
      })
      .parse(Object.fromEntries(formData));
    const email = normaliseEmail(input.email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.organisationId) {
      return { ok: false, message: "This person already has an account." };
    }
    if (input.teamId) {
      const team = await prisma.team.findFirst({ where: { id: input.teamId, organisationId: me.organisationId } });
      if (!team) return { ok: false, message: "That team could not be found." };
    }

    // Cancel any earlier invitation for the same address so only the newest link works.
    await prisma.invitation.updateMany({
      where: { organisationId: me.organisationId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const invite = await prisma.invitation.create({
      data: {
        organisationId: me.organisationId,
        email,
        role: input.role,
        teamId: input.teamId,
        token: randomToken(),
        invitedById: me.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      },
    });
    await audit({
      organisationId: me.organisationId,
      userId: me.id,
      action: "invitation.created",
      entityType: "Invitation",
      entityId: invite.id,
      details: { email, role: input.role },
    });
    revalidatePath("/settings/users");
    const link = `${process.env.APP_URL ?? ""}/invite/${invite.token}`;
    return { ok: true, message: `Invitation created for ${email}. Send them this link:`, link };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const me = await actionUser("users.manage");
  const id = z.string().parse(formData.get("id"));
  const result = await prisma.invitation.updateMany({
    where: { id, organisationId: me.organisationId, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count > 0) {
    await audit({ organisationId: me.organisationId, userId: me.id, action: "invitation.revoked", entityType: "Invitation", entityId: id });
  }
  revalidatePath("/settings/users");
}

export async function updateUser(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("users.manage");
    const input = z
      .object({
        userId: z.string(),
        role: roleSchema,
        teamId: optionalId,
        active: z.enum(["true", "false"]).transform((v) => v === "true"),
      })
      .parse(Object.fromEntries(formData));

    const target = await prisma.user.findFirst({ where: { id: input.userId, organisationId: me.organisationId } });
    if (!target) return { ok: false, message: "That person could not be found." };

    if (target.id === me.id && (input.role !== "ADMIN" || !input.active)) {
      return { ok: false, message: "You cannot remove your own admin access. Ask another admin to do it." };
    }
    if (target.role === "ADMIN" && (input.role !== "ADMIN" || !input.active)) {
      const otherAdmins = await prisma.user.count({
        where: { organisationId: me.organisationId, role: "ADMIN", active: true, id: { not: target.id } },
      });
      if (otherAdmins === 0) return { ok: false, message: "There must always be at least one active admin." };
    }
    if (input.teamId) {
      const team = await prisma.team.findFirst({ where: { id: input.teamId, organisationId: me.organisationId } });
      if (!team) return { ok: false, message: "That team could not be found." };
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { role: input.role, teamId: input.teamId, active: input.active },
    });
    await audit({
      organisationId: me.organisationId,
      userId: me.id,
      action: "user.updated",
      entityType: "User",
      entityId: target.id,
      details: {
        before: { role: target.role, teamId: target.teamId, active: target.active },
        after: { role: input.role, teamId: input.teamId, active: input.active },
      },
    });
    revalidatePath("/settings/users");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function createTeam(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("users.manage");
    const input = z
      .object({
        name: z.string().trim().min(1, "Give the team a name.").max(80),
        managerId: optionalId,
      })
      .parse(Object.fromEntries(formData));

    if (input.managerId) {
      const manager = await prisma.user.findFirst({ where: { id: input.managerId, organisationId: me.organisationId } });
      if (!manager) return { ok: false, message: "That manager could not be found." };
    }
    const clash = await prisma.team.findFirst({ where: { organisationId: me.organisationId, name: input.name } });
    if (clash) return { ok: false, message: "A team with that name already exists." };

    const team = await prisma.team.create({
      data: { organisationId: me.organisationId, name: input.name, managerId: input.managerId },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "team.created", entityType: "Team", entityId: team.id });
    revalidatePath("/settings/users");
    return { ok: true, message: `Team "${input.name}" created.` };
  } catch (error) {
    return fail(error);
  }
}
