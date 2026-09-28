// What each background job does.
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { loadActor } from "@/lib/actor";
import { canEdit } from "@/lib/permissions";
import { generateCompanySummary } from "@/lib/companies/summary";
import { enrichCompany } from "@/lib/enrichment";
import { AiNotConfiguredError } from "@/lib/ai";
import { QUEUES, type JobData, type QueueName } from "@/jobs/queues";

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

  [QUEUES.companyEnrich]: async ({ companyId, userId }) => {
    const found = await companyTheyMayEdit(companyId, userId);
    if (!found) {
      logger.warn("Skipped company details: no access or company removed", { companyId });
      return;
    }
    await enrichCompany(companyId, found.actor.organisationId, userId);
  },
};
