// What the background automations are doing, read from the job list (pg-boss) in the database.
// Shown in the live indicator in the top bar and, later, on the admin job status page.
import { prisma } from "@/lib/db";
import { QUEUES, type QueueName } from "@/jobs/queues";

export const automationLabels: Record<QueueName, string> = {
  [QUEUES.heartbeat]: "Worker check",
  [QUEUES.companySummary]: "Company summaries",
  [QUEUES.companyEnrich]: "Company details",
  [QUEUES.sendNotification]: "Alert emails",
  [QUEUES.recalculateHealth]: "Deal health check",
  [QUEUES.mailSyncAll]: "Email sync",
  [QUEUES.mailSync]: "Email sync for one account",
  [QUEUES.calendarSyncAll]: "Calendar sync",
  [QUEUES.calendarSync]: "Calendar sync for one account",
  [QUEUES.dailyTasks]: "Daily task list",
  [QUEUES.newsCollect]: "News about companies",
  [QUEUES.transcriptProcess]: "Reading a call transcript",
  [QUEUES.transcriptSweep]: "Call transcripts waiting to be read",
};

export type AutomationStatus = {
  running: number;
  waiting: number;
  failedToday: number;
  workerLastSeen: string | null;
  queues: { name: string; label: string; running: number; waiting: number; lastFinished: string | null }[];
};

// Times come back as milliseconds since 1970, which avoids any time zone confusion in the driver.
type Row = { name: string; running: bigint; waiting: bigint; failed_today: bigint; last_finished_ms: number | null };

export async function getAutomationStatus(): Promise<AutomationStatus> {
  let rows: Row[] = [];
  try {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT name,
             count(*) FILTER (WHERE state = 'active') AS running,
             count(*) FILTER (WHERE state IN ('created', 'retry')) AS waiting,
             count(*) FILTER (WHERE state = 'failed' AND completed_on > now() - interval '1 day') AS failed_today,
             (extract(epoch from max(completed_on) FILTER (WHERE state = 'completed')) * 1000)::float8 AS last_finished_ms
      FROM pgboss.job
      GROUP BY name`;
  } catch {
    // The job list is created when the worker first starts. Until then there is nothing to show.
  }
  const byName = new Map(rows.map((r) => [r.name, r]));
  const queues = (Object.values(QUEUES) as QueueName[]).map((name) => {
    const r = byName.get(name);
    return {
      name,
      label: automationLabels[name],
      running: Number(r?.running ?? 0),
      waiting: Number(r?.waiting ?? 0),
      lastFinished: r?.last_finished_ms ? new Date(r.last_finished_ms).toISOString() : null,
    };
  });
  return {
    running: queues.reduce((s, q) => s + q.running, 0),
    waiting: queues.reduce((s, q) => s + q.waiting, 0),
    failedToday: rows.reduce((s, r) => s + Number(r.failed_today), 0),
    workerLastSeen: byName.get(QUEUES.heartbeat)?.last_finished_ms ? new Date(byName.get(QUEUES.heartbeat)!.last_finished_ms!).toISOString() : null,
    queues: queues.filter((q) => q.name !== QUEUES.heartbeat),
  };
}
