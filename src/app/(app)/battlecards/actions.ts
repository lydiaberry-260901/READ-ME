"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, type ActionResult } from "@/lib/action-result";
import { removeDashPunctuation } from "@/lib/text";

export async function saveBattlecard(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string | null = null;
  try {
    const me = await actionUser("battlecards.edit");
    const existingId = formData.get("id") ? String(formData.get("id")) : null;
    const input = z
      .object({
        competitorName: z.string().trim().min(2, "Name the competitor.").max(120),
        comparison: z.string().trim().min(10, "Write a short comparison.").max(3000),
      })
      .parse(Object.fromEntries(formData));
    const responses = formData.getAll("response").map(String);
    const objections = formData
      .getAll("objection")
      .map(String)
      .map((o, i) => ({ objection: removeDashPunctuation(o.trim()), response: removeDashPunctuation((responses[i] ?? "").trim()) }))
      .filter((o) => o.objection || o.response);
    if (objections.some((o) => !o.objection || !o.response)) return { ok: false, message: "Each objection needs a suggested response." };

    const clash = await prisma.battlecard.findFirst({
      where: { organisationId: me.organisationId, competitorName: { equals: input.competitorName, mode: "insensitive" }, ...(existingId ? { id: { not: existingId } } : {}) },
    });
    if (clash) return { ok: false, message: "There is already a battlecard for that competitor." };

    const data = { competitorName: input.competitorName, comparison: removeDashPunctuation(input.comparison), objections, updatedById: me.id };
    if (existingId) {
      const updated = await prisma.battlecard.updateMany({ where: { id: existingId, organisationId: me.organisationId }, data });
      if (updated.count === 0) return { ok: false, message: "That battlecard could not be found." };
      await audit({ organisationId: me.organisationId, userId: me.id, action: "battlecard.updated", entityType: "Battlecard", entityId: existingId });
      revalidatePath(`/battlecards/${existingId}`);
      return { ok: true, message: "Saved." };
    }
    const created = await prisma.battlecard.create({ data: { ...data, organisationId: me.organisationId } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "battlecard.created", entityType: "Battlecard", entityId: created.id });
    id = created.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/battlecards/${id}`);
}
