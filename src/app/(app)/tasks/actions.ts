"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError, type CurrentUser } from "@/lib/session";
import { canView } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { addDays, isoDay, startOfLondonDay } from "@/lib/calendar-view";
import { runDailyTasks } from "@/lib/tasks/daily";

/** People may change their own tasks; managers their team's; admins anyone's. */
async function ownTask(me: CurrentUser, id: string) {
  const task = await prisma.task.findFirst({ where: { id, organisationId: me.organisationId } });
  if (!task) throw new AccessDeniedError("That task could not be found.");
  if (me.role !== "ADMIN" && !me.visibleOwnerIds.includes(task.assigneeId)) throw new AccessDeniedError("That task could not be found.");
  return task;
}

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function createTask(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z
      .object({
        title: z.string().trim().min(2, "Say what needs doing.").max(200),
        type: z.enum(["CALL", "EMAIL", "FOLLOW_UP", "RESEARCH", "MEETING", "OTHER"]),
        priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date."),
        dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        description: optionalText(2000),
        contactId: optionalText(40),
        dealId: optionalText(40),
        companyId: optionalText(40),
      })
      .parse(Object.fromEntries(formData));
    const [h, m] = (input.dueTime || "17:00").split(":").map(Number);
    const dueAt = new Date(startOfLondonDay(input.dueDate).getTime() + (h * 60 + m) * 60_000);

    // Only link records the person may see.
    const [contact, deal, company] = await Promise.all([
      input.contactId ? prisma.contact.findFirst({ where: { id: input.contactId, organisationId: me.organisationId } }) : null,
      input.dealId ? prisma.deal.findFirst({ where: { id: input.dealId, organisationId: me.organisationId } }) : null,
      input.companyId ? prisma.company.findFirst({ where: { id: input.companyId, organisationId: me.organisationId } }) : null,
    ]);
    if ((input.contactId && !(contact && canView(me, contact))) || (input.dealId && !(deal && canView(me, deal))) || (input.companyId && !(company && canView(me, company)))) {
      return { ok: false, message: "That record could not be found." };
    }
    const task = await prisma.task.create({
      data: {
        organisationId: me.organisationId, assigneeId: me.id, createdById: me.id, title: input.title, type: input.type, priority: input.priority, dueAt,
        description: input.description, origin: "MANUAL", reason: "Added by you.",
        contactId: contact?.id ?? null, dealId: deal?.id ?? null, companyId: company?.id ?? deal?.companyId ?? contact?.companyId ?? null,
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "task.created", entityType: "Task", entityId: task.id });
    refresh();
    return { ok: true, message: "Task added." };
  } catch (error) {
    return failure(error);
  }
}

export async function completeTask(formData: FormData): Promise<void> {
  const me = await actionUser();
  const task = await ownTask(me, z.string().parse(formData.get("id")));
  const done = formData.get("done") !== "false";
  await prisma.task.update({ where: { id: task.id }, data: done ? { status: "DONE", completedAt: new Date() } : { status: "OPEN", completedAt: null } });
  refresh();
}

export async function snoozeTask(formData: FormData): Promise<void> {
  const me = await actionUser();
  const task = await ownTask(me, z.string().parse(formData.get("id")));
  const days = z.coerce.number().int().min(1).max(30).parse(formData.get("days"));
  // Snoozed until 08:00 London time on the chosen day.
  const until = new Date(startOfLondonDay(addDays(isoDay(new Date()), days)).getTime() + 8 * 3_600_000);
  await prisma.task.update({ where: { id: task.id }, data: { status: "SNOOZED", snoozedUntil: until, dueAt: until } });
  refresh();
}

export async function cancelTask(formData: FormData): Promise<void> {
  const me = await actionUser();
  const task = await ownTask(me, z.string().parse(formData.get("id")));
  await prisma.task.update({ where: { id: task.id }, data: { status: "CANCELLED" } });
  refresh();
}

/** Runs the daily rules for the signed in person now, instead of waiting for 07:00. Never creates duplicates. */
export async function checkForSuggestions(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const r = await runDailyTasks(new Date(), me.organisationId, me.id);
    await audit({ organisationId: me.organisationId, userId: me.id, action: "task.suggestions_checked", details: { created: r.created } });
    refresh();
    return { ok: true, message: r.created ? `Added ${r.created} new ${r.created === 1 ? "suggestion" : "suggestions"}.` : "Nothing new to suggest right now." };
  } catch (error) {
    return failure(error);
  }
}

export async function setMorningSummary(formData: FormData): Promise<void> {
  const me = await actionUser();
  const on = formData.get("on") === "true";
  await prisma.user.update({ where: { id: me.id }, data: { morningSummary: on } });
  refresh();
}
