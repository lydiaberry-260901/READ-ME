"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";

const url = optionalText(300).refine((v) => v === null || /^https:\/\//.test(v), "Web addresses must start with https://");

export async function saveOrganisation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const input = z
      .object({
        name: z.string().trim().min(2, "Enter the organisation name.").max(120),
        legalName: optionalText(200),
        postalAddress: optionalText(300),
        websiteUrl: url,
        privacyNoticeUrl: url,
        phoneCheckMaxAgeDays: z.coerce.number().int().min(1, "Use a number from 1 to 28.").max(28, "The TPS and CTPS check must be no older than 28 days."),
      })
      .parse(Object.fromEntries(formData));
    await prisma.organisation.update({ where: { id: me.organisationId }, data: input });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "organisation.updated", entityType: "Organisation", entityId: me.organisationId, details: input });
    revalidatePath("/settings/organisation");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}
