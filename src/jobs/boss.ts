// Connection to the job list (pg-boss), stored in its own "pgboss" area of the main database.
import { PgBoss } from "pg-boss";
import { QUEUES, DEFAULT_RETRY } from "@/jobs/queues";
import { logger } from "@/lib/logger";

let started: Promise<PgBoss> | null = null;

export function getBoss(): Promise<PgBoss> {
  if (!started) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    const boss = new PgBoss({ connectionString, schema: "pgboss" });
    boss.on("error", (error) => logger.error("Job list error", { error: String(error) }));
    started = (async () => {
      await boss.start();
      for (const name of Object.values(QUEUES)) {
        await boss.createQueue(name, { ...DEFAULT_RETRY });
      }
      return boss;
    })();
  }
  return started;
}
