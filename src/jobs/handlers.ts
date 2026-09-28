// What each background job does. Later phases add news, daily tasks, email sync and alerts here.
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { QUEUES, type QueueName } from "@/jobs/queues";

type Handler = (data: unknown) => Promise<void>;

export const handlers: Record<QueueName, Handler> = {
  [QUEUES.heartbeat]: async () => {
    const organisations = await prisma.organisation.count();
    logger.info("Worker heartbeat", { organisations });
  },
};
