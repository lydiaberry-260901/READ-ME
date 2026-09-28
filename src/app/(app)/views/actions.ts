"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { failure, type ActionResult } from "@/lib/action-result";

const entitySchema = z.enum(["companies", "contacts"]);

export async function saveView(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z
      .object({
        entity: entitySchema,
        name: z.string().trim().min(1, "Give the view a name.").max(60),
        query: z.string().max(1000).refine((q) => q === "" || q.startsWith("?"), "That view could not be saved."),
        isShared: z.string().optional().transform((v) => v === "on"),
      })
      .parse(Object.fromEntries(formData));
    await prisma.savedView.create({
      data: { organisationId: me.organisationId, userId: me.id, entity: input.entity, name: input.name, query: input.query, isShared: input.isShared },
    });
    revalidatePath(`/${input.entity}`);
    return { ok: true, message: `Saved "${input.name}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteView(formData: FormData): Promise<void> {
  const me = await actionUser();
  const id = z.string().parse(formData.get("id"));
  const view = await prisma.savedView.findFirst({ where: { id, organisationId: me.organisationId } });
  if (!view || (view.userId !== me.id && me.role !== "ADMIN")) return;
  await prisma.savedView.delete({ where: { id } });
  revalidatePath(`/${view.entity}`);
}
