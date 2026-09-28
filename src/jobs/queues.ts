// Names and timings of background jobs. Shared by the web app (which adds jobs to the list)
// and the worker (which runs them). The job list lives in the same Postgres database.
import { TIME_ZONE } from "@/lib/format";

export const QUEUES = {
  heartbeat: "heartbeat",
  companySummary: "company-ai-summary",
  companyEnrich: "company-enrich",
  sendNotification: "send-notification",
  recalculateHealth: "recalculate-deal-health",
  mailSyncAll: "mail-sync-all",
  mailSync: "mail-sync",
  calendarSyncAll: "calendar-sync-all",
  calendarSync: "calendar-sync",
  dailyTasks: "daily-tasks",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Data carried by each job. */
export type JobData = {
  [QUEUES.heartbeat]: Record<string, never>;
  [QUEUES.companySummary]: { companyId: string; userId: string };
  [QUEUES.companyEnrich]: { companyId: string; userId: string };
  [QUEUES.sendNotification]: { notificationId: string };
  [QUEUES.recalculateHealth]: Record<string, never> | null;
  [QUEUES.mailSyncAll]: Record<string, never> | null;
  [QUEUES.mailSync]: { accountId: string };
  [QUEUES.calendarSyncAll]: Record<string, never> | null;
  [QUEUES.calendarSync]: { accountId: string };
  [QUEUES.dailyTasks]: Record<string, never> | null;
};

/** Scheduled jobs. Cron timings use the Europe/London time zone, so they follow British Summer Time. */
export const SCHEDULES: { queue: QueueName; cron: string; description: string }[] = [
  { queue: QUEUES.heartbeat, cron: "*/15 * * * *", description: "Shows the worker is running, every 15 minutes." },
  { queue: QUEUES.recalculateHealth, cron: "30 5 * * *", description: "Recalculates the health of every deal at 05:30 each day." },
  // Catches any alerts that were saved but not sent, for example if the web app could not reach the job list.
  { queue: QUEUES.sendNotification, cron: "*/10 * * * *", description: "Sends any waiting alert emails, every 10 minutes." },
  { queue: QUEUES.mailSyncAll, cron: "*/10 * * * *", description: "Collects new emails with CRM contacts from every connected email account." },
  { queue: QUEUES.calendarSyncAll, cron: "*/15 * * * *", description: "Brings every connected calendar up to date, both ways." },
  { queue: QUEUES.dailyTasks, cron: "0 7 * * 1-5", description: "Builds each person's task list for the day and sends morning summaries to those who want one." },
];

export const SCHEDULE_TIME_ZONE = TIME_ZONE;

/** Default retry settings for jobs that fail: try again up to 5 times, waiting longer each time. */
export const DEFAULT_RETRY = { retryLimit: 5, retryDelay: 60, retryBackoff: true } as const;

/** How many jobs of each kind the worker runs at once. AI and website jobs run one at a time to respect limits. */
export const CONCURRENCY: Partial<Record<QueueName, number>> = {
  [QUEUES.companySummary]: 1,
  [QUEUES.companyEnrich]: 1,
  [QUEUES.recalculateHealth]: 1,
  [QUEUES.mailSync]: 2,
  [QUEUES.calendarSync]: 2,
  [QUEUES.dailyTasks]: 1,
};
