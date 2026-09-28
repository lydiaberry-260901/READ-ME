"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError } from "@/lib/session";
import { canEdit, canView } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { failure, type ActionResult } from "@/lib/action-result";
import { enqueue } from "@/jobs/boss";
import { QUEUES } from "@/jobs/queues";

/** Marks a news item as read, acted on, or back to new. Anyone who can see the company may do this. */
export async function setNewsStatus(formData: FormData) {
  const me = await actionUser();
  const { id, status } = z.object({ id: z.string().min(1), status: z.enum(["NEW", "READ", "ACTED_ON"]) }).parse(Object.fromEntries(formData));
  const item = await prisma.newsItem.findFirst({ where: { id, organisationId: me.organisationId }, include: { company: true } });
  if (!item || !canView(me, item.company)) throw new AccessDeniedError("That news item could not be found.");
  await prisma.newsItem.update({ where: { id }, data: { status } });
  revalidatePath("/news");
  revalidatePath(`/companies/${item.companyId}`);
}

/** Pauses or restarts news checks for one company. */
export async function setNewsPaused(formData: FormData) {
  const me = await actionUser();
  const { companyId, paused } = z.object({ companyId: z.string().min(1), paused: z.enum(["true", "false"]) }).parse(Object.fromEntries(formData));
  const company = await prisma.company.findFirst({ where: { id: companyId, organisationId: me.organisationId } });
  if (!company || !canEdit(me, company, { sharedIsEditable: true })) throw new AccessDeniedError("You cannot change news checks for this company.");
  const value = paused === "true";
  await prisma.newsWatch.upsert({
    where: { companyId },
    create: { organisationId: me.organisationId, companyId, paused: value, frequency: company.importance === 1 ? "DAILY" : "WEEKLY" },
    update: { paused: value },
  });
  await audit({ organisationId: me.organisationId, userId: me.id, action: value ? "news.paused" : "news.restarted", entityType: "Company", entityId: companyId });
  revalidatePath(`/companies/${companyId}`);
}

const feedList = z
  .string()
  .transform((s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
  .pipe(z.array(z.string().url("Each feed must be a full web address.").refine((u) => u.startsWith("https://"), "Feed addresses must start with https://")).max(50, "Please keep to 50 feeds or fewer."));

export async function saveNewsSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const input = z
      .object({
        newsSource: z.enum(["OFF", "API", "FEEDS"]),
        newsFeeds: feedList,
        newsDailyCallLimit: z.coerce.number().int().min(1, "Allow at least one search a day.").max(1000, "Please keep the daily limit to 1,000 or fewer."),
      })
      .parse({ ...Object.fromEntries(formData), newsFeeds: formData.get("newsFeeds") ?? "" });
    if (input.newsSource === "FEEDS" && input.newsFeeds.length === 0) return { ok: false, message: "Add at least one feed, or choose a different source." };
    await prisma.organisation.update({ where: { id: me.organisationId }, data: input });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "news.settings_updated", entityType: "Organisation", entityId: me.organisationId, details: input });
    revalidatePath("/settings/news");
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function checkNewsNow(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    await enqueue(QUEUES.newsCollect, { organisationId: me.organisationId }, { singletonKey: `manual:news:${me.organisationId}` });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "automation.run_by_hand", details: { queue: QUEUES.newsCollect } });
    return { ok: true, message: "Started. Only companies that are due a check are looked at. Refresh this page in a minute or two." };
  } catch (error) {
    return failure(error);
  }
}
