// The background worker. Runs scheduled jobs and retries failed ones.
// Start with: npm run worker (a separate program from the web app, sharing the same code and database).
import "dotenv/config";
import { getBoss } from "@/jobs/boss";
import { handlers } from "@/jobs/handlers";
import { SCHEDULES, SCHEDULE_TIME_ZONE, type QueueName } from "@/jobs/queues";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

async function main() {
  const boss = await getBoss();

  for (const s of SCHEDULES) {
    await boss.schedule(s.queue, s.cron, null, { tz: SCHEDULE_TIME_ZONE });
    logger.info("Scheduled job", { queue: s.queue, cron: s.cron, timeZone: SCHEDULE_TIME_ZONE });
  }

  for (const [queue, handler] of Object.entries(handlers) as [QueueName, (data: unknown) => Promise<void>][]) {
    await boss.work(queue, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          await handler(job.data);
          logger.info("Job finished", { queue, jobId: job.id, ms: Date.now() - started });
        } catch (error) {
          logger.error("Job failed, it will be retried", { queue, jobId: job.id, error: String(error) });
          throw error;
        }
      }
    });
  }

  logger.info("Worker started", { queues: Object.keys(handlers) });

  const shutdown = async (signal: string) => {
    logger.info("Worker stopping", { signal });
    await boss.stop({ graceful: true, timeout: 20_000 });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("Worker could not start", { error: String(error) });
  process.exit(1);
});
