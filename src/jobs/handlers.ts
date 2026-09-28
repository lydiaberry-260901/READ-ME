// What each background job does.
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { loadActor } from "@/lib/actor";
import { canEdit } from "@/lib/permissions";
import { generateCompanySummary } from "@/lib/companies/summary";
import { enrichCompany } from "@/lib/enrichment";
import { AiNotConfiguredError } from "@/lib/ai";
import { DEFAULT_RETRY, QUEUES, type JobData, type QueueName } from "@/jobs/queues";
import { getBoss } from "@/jobs/boss";
import { syncMailAccount } from "@/lib/integrations/mail-sync";
import { syncCalendarAccount } from "@/lib/integrations/calendar-sync";
import { runDailyTasks } from "@/lib/tasks/daily";
import { deliverNotification } from "@/lib/notifications/deal-alerts";
import { recalculateOrganisation } from "@/lib/deals/recalculate";

const MAX_ALERT_ATTEMPTS = 8;

type Handlers = { [Q in QueueName]: (data: JobData[Q]) => Promise<void> };

/** Jobs run on behalf of the person who asked, so their access is checked again when the job runs. */
async function companyTheyMayEdit(companyId: string, userId: string) {
  const actor = await loadActor(userId);
  if (!actor) return null;
  const company = await prisma.company.findFirst({ where: { id: companyId, organisationId: actor.organisationId } });
  if (!company || !canEdit(actor, company, { sharedIsEditable: true })) return null;
  return { actor, company };
}

export const handlers: Handlers = {
  [QUEUES.heartbeat]: async () => {
    const organisations = await prisma.organisation.count();
    logger.info("Worker heartbeat", { organisations });
  },

  [QUEUES.companySummary]: async ({ companyId, userId }) => {
    const found = await companyTheyMayEdit(companyId, userId);
    if (!found) {
      logger.warn("Skipped company summary: no access or company removed", { companyId });
      return;
    }
    try {
      await generateCompanySummary(companyId, found.actor.organisationId, userId);
    } catch (error) {
      // Retrying will not help until an admin adds the key, so finish quietly.
      if (error instanceof AiNotConfiguredError) {
        logger.warn("Skipped company summary: AI is not set up", { companyId });
        return;
      }
      throw error;
    }
  },

  [QUEUES.sendNotification]: async (data) => {
    if (data?.notificationId) {
      await deliverNotification(data.notificationId);
      return;
    }
    // Scheduled sweep: send anything still waiting, and retry failures up to a limit.
    const waiting = await prisma.notification.findMany({
      where: { OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: MAX_ALERT_ATTEMPTS } }] },
      select: { id: true },
      take: 200,
    });
    for (const n of waiting) {
      try {
        await deliverNotification(n.id);
      } catch (error) {
        logger.warn("Alert could not be sent, it will be tried again", { notificationId: n.id, error: String(error) });
      }
    }
  },

  [QUEUES.recalculateHealth]: async () => {
    const orgs = await prisma.organisation.findMany({ select: { id: true } });
    let total = 0;
    for (const o of orgs) total += await recalculateOrganisation(o.id);
    logger.info("Deal health recalculated", { deals: total });
  },

  [QUEUES.mailSyncAll]: async () => {
    const accounts = await prisma.emailAccount.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    const boss = await getBoss("worker");
    for (const a of accounts) await boss.send(QUEUES.mailSync, { accountId: a.id }, { ...DEFAULT_RETRY, singletonKey: `mail:${a.id}` });
  },

  [QUEUES.mailSync]: async ({ accountId }) => {
    const r = await syncMailAccount(accountId);
    logger.info("Email sync", { accountId, ...r });
  },

  [QUEUES.calendarSyncAll]: async () => {
    const accounts = await prisma.calendarAccount.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    const boss = await getBoss("worker");
    for (const a of accounts) await boss.send(QUEUES.calendarSync, { accountId: a.id }, { ...DEFAULT_RETRY, singletonKey: `calendar:${a.id}` });
  },

  [QUEUES.calendarSync]: async ({ accountId }) => {
    const r = await syncCalendarAccount(accountId);
    logger.info("Calendar sync", { accountId, ...r });
  },

  [QUEUES.dailyTasks]: async () => {
    const r = await runDailyTasks();
    logger.info("Daily task lists built", { people: r.people, created: r.created });
    // Send any morning summaries straight away rather than waiting for the next sweep.
    const boss = await getBoss("worker");
    await boss.send(QUEUES.sendNotification, null as never, { ...DEFAULT_RETRY });
  },

  [QUEUES.companyEnrich]: async ({ companyId, userId }) => {
    const found = await companyTheyMayEdit(companyId, userId);
    if (!found) {
      logger.warn("Skipped company details: no access or company removed", { companyId });
      return;
    }
    await enrichCompany(companyId, found.actor.organisationId, userId);
  },
};
