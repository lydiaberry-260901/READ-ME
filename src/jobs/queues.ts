// Names and timings of background jobs. Shared by the web app (which adds jobs to the list)
// and the worker (which runs them). The job list lives in the same Postgres database.
import { TIME_ZONE } from "@/lib/format";

export const QUEUES = {
  heartbeat: "heartbeat",
  companySummary: "company-ai-summary",
  companyEnrich: "company-enrich",
  sendNotification: "send-notification",
  recalculateHealth: "recalculate-deal-health",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Data carried by each job. */
export type JobData = {
  [QUEUES.heartbeat]: Record<string, never>;
  [QUEUES.companySummary]: { companyId: string; userId: string };
  [QUEUES.companyEnrich]: { companyId: string; userId: string };
  [QUEUES.sendNotification]: { notificationId: string };
  [QUEUES.recalculateHealth]: Record<string, never> | null;
};

/** Scheduled jobs. Cron timings use the Europe/London time zone, so they follow British Summer Time. */
export const SCHEDULES: { queue: QueueName; cron: string; description: string }[] = [
  { queue: QUEUES.heartbeat, cron: "*/15 * * * *", description: "Shows the worker is running, every 15 minutes." },
  { queue: QUEUES.recalculateHealth, cron: "30 5 * * *", description: "Recalculates the health of every deal at 05:30 each day." },
  // Catches any alerts that were saved but not sent, for example if the web app could not reach the job list.
  { queue: QUEUES.sendNotification, cron: "*/10 * * * *", description: "Sends any waiting alert emails, every 10 minutes." },
];

export const SCHEDULE_TIME_ZONE = TIME_ZONE;

/** Default retry settings for jobs that fail: try again up to 5 times, waiting longer each time. */
export const DEFAULT_RETRY = { retryLimit: 5, retryDelay: 60, retryBackoff: true } as const;

/** How many jobs of each kind the worker runs at once. AI and website jobs run one at a time to respect limits. */
export const CONCURRENCY: Partial<Record<QueueName, number>> = {
  [QUEUES.companySummary]: 1,
  [QUEUES.companyEnrich]: 1,
  [QUEUES.recalculateHealth]: 1,
};
