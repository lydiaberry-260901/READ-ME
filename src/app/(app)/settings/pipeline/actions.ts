"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, type ActionResult } from "@/lib/action-result";

async function defaultPipeline(organisationId: string) {
  return prisma.pipeline.findFirstOrThrow({ where: { organisationId, isDefault: true }, include: { stages: { orderBy: { position: "asc" } } } });
}

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a colour.");

export async function addStage(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const input = z.object({ name: z.string().trim().min(2, "Name the stage.").max(40), colour }).parse(Object.fromEntries(formData));
    const pipeline = await defaultPipeline(me.organisationId);
    if (pipeline.stages.some((s) => !s.archived && s.name.toLowerCase() === input.name.toLowerCase())) return { ok: false, message: "A stage with that name already exists." };
    // New stages go just before the first closed stage, so Won and Lost stay at the end.
    const firstClosed = pipeline.stages.find((s) => s.kind !== "OPEN" && !s.archived);
    const position = firstClosed ? firstClosed.position : pipeline.stages.length;
    await prisma.$transaction([
      prisma.stage.updateMany({ where: { pipelineId: pipeline.id, position: { gte: position } }, data: { position: { increment: 1 } } }),
      prisma.stage.create({ data: { pipelineId: pipeline.id, name: input.name, colour: input.colour, position, kind: "OPEN" } }),
    ]);
    await audit({ organisationId: me.organisationId, userId: me.id, action: "stage.created", details: { name: input.name } });
    revalidatePath("/settings/pipeline");
    return { ok: true, message: `Added "${input.name}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateStage(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const input = z
      .object({
        id: z.string(),
        name: z.string().trim().min(2, "Name the stage.").max(40),
        colour,
        probability: z.coerce.number().int().min(0).max(100),
        noActivityDays: z.coerce.number().int().min(1).max(365),
      })
      .parse(Object.fromEntries(formData));
    const pipeline = await defaultPipeline(me.organisationId);
    if (!pipeline.stages.some((s) => s.id === input.id)) return { ok: false, message: "That stage could not be found." };
    const { id, ...data } = input;
    await prisma.stage.update({ where: { id }, data });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "stage.updated", entityType: "Stage", entityId: id, details: data });
    revalidatePath("/settings/pipeline");
    revalidatePath("/deals");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function moveStage(formData: FormData): Promise<void> {
  const me = await actionUser("settings.manage");
  const input = z.object({ id: z.string(), direction: z.enum(["up", "down"]) }).parse(Object.fromEntries(formData));
  const pipeline = await defaultPipeline(me.organisationId);
  const active = pipeline.stages.filter((s) => !s.archived);
  const i = active.findIndex((s) => s.id === input.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= active.length) return;
  const [a, b] = [active[i], active[j]];
  await prisma.$transaction([
    prisma.stage.update({ where: { id: a.id }, data: { position: b.position } }),
    prisma.stage.update({ where: { id: b.id }, data: { position: a.position } }),
  ]);
  await audit({ organisationId: me.organisationId, userId: me.id, action: "stage.reordered", entityType: "Stage", entityId: a.id, details: { direction: input.direction } });
  revalidatePath("/settings/pipeline");
  revalidatePath("/deals");
}

export async function archiveStage(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const id = z.string().parse(formData.get("id"));
    const pipeline = await defaultPipeline(me.organisationId);
    const stage = pipeline.stages.find((s) => s.id === id);
    if (!stage) return { ok: false, message: "That stage could not be found." };
    const sameKindLeft = pipeline.stages.filter((s) => !s.archived && s.kind === stage.kind && s.id !== id).length;
    if (sameKindLeft === 0) return { ok: false, message: `The pipeline needs at least one ${stage.kind === "OPEN" ? "open" : stage.kind === "WON" ? "won" : "lost"} stage.` };
    const inUse = await prisma.deal.count({ where: { stageId: id } });
    if (inUse > 0) return { ok: false, message: `${inUse} deals are in this stage. Move them to another stage first.` };
    await prisma.stage.update({ where: { id }, data: { archived: true } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "stage.archived", entityType: "Stage", entityId: id });
    revalidatePath("/settings/pipeline");
    return { ok: true, message: `Removed "${stage.name}". Its history is kept.` };
  } catch (error) {
    return failure(error);
  }
}
