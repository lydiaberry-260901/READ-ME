"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { enqueue } from "@/jobs/boss";
import { QUEUES } from "@/jobs/queues";

/** Disconnects an account: asks the provider to forget the access where possible, then deletes the saved details. */
export async function disconnect(formData: FormData): Promise<void> {
  const me = await actionUser();
  const input = z.object({ id: z.string(), kind: z.enum(["email", "calendar"]) }).parse(Object.fromEntries(formData));
  const account =
    input.kind === "email"
      ? await prisma.emailAccount.findFirst({ where: { id: input.id, userId: me.id } })
      : await prisma.calendarAccount.findFirst({ where: { id: input.id, userId: me.id } });
  if (!account) return;
  if (account.provider === "GOOGLE" && account.refreshTokenEnc) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(account.refreshTokenEnc))}`, { method: "POST", signal: AbortSignal.timeout(8000) });
    } catch {
      // The saved details are deleted below either way.
    }
  }
  if (input.kind === "email") await prisma.emailAccount.delete({ where: { id: account.id } });
  else await prisma.calendarAccount.delete({ where: { id: account.id } });
  await audit({ organisationId: me.organisationId, userId: me.id, action: `connection.${input.kind}_disconnected`, details: { provider: account.provider } });
  revalidatePath("/settings/connections");
}

export async function syncNow(formData: FormData): Promise<void> {
  const me = await actionUser();
  const input = z.object({ id: z.string(), kind: z.enum(["email", "calendar"]) }).parse(Object.fromEntries(formData));
  if (input.kind === "email") {
    if (await prisma.emailAccount.count({ where: { id: input.id, userId: me.id } })) await enqueue(QUEUES.mailSync, { accountId: input.id }, { singletonKey: `mail:${input.id}` });
  } else if (await prisma.calendarAccount.count({ where: { id: input.id, userId: me.id } })) {
    await enqueue(QUEUES.calendarSync, { accountId: input.id }, { singletonKey: `calendar:${input.id}` });
  }
  revalidatePath("/settings/connections");
}
