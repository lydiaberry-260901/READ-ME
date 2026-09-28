// Connection to the job list (pg-boss), stored in its own "pgboss" area of the main database.
import { PgBoss } from "pg-boss";
import { QUEUES, DEFAULT_RETRY, type JobData, type QueueName } from "@/jobs/queues";
import { logger } from "@/lib/logger";

const instances = new Map<string, Promise<PgBoss>>();

/**
 * The worker runs the scheduler and maintenance. The web app only adds jobs, so it
 * starts pg-boss with scheduling and maintenance switched off.
 */
export function getBoss(role: "worker" | "web" = "web"): Promise<PgBoss> {
  let started = instances.get(role);
  if (!started) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    const isWorker = role === "worker";
    const boss = new PgBoss({ connectionString, schema: "pgboss", schedule: isWorker, supervise: isWorker });
    boss.on("error", (error) => logger.error("Job list error", { error: String(error) }));
    started = (async () => {
      await boss.start();
      // Creating a queue that already exists does nothing, so both programs can do it safely.
      for (const name of Object.values(QUEUES)) {
        if (!(await boss.getQueue(name))) await boss.createQueue(name, { ...DEFAULT_RETRY });
      }
      return boss;
    })();
    instances.set(role, started);
  }
  return started;
}

/**
 * Adds a job to the list. `singletonKey` stops the same job being queued twice while one is waiting,
 * for example two summary requests for the same company.
 */
export async function enqueue<Q extends QueueName>(queue: Q, data: JobData[Q], opts: { singletonKey?: string } = {}) {
  const boss = await getBoss("web");
  return boss.send(queue, data, { ...DEFAULT_RETRY, ...(opts.singletonKey ? { singletonKey: opts.singletonKey } : {}) });
}
