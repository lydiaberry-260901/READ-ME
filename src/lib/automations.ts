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
};

export type AutomationStatus = {
  running: number;
  waiting: number;
  failedToday: number;
  workerLastSeen: string | null;
  queues: { name: string; label: string; running: number; waiting: number; lastFinished: string | null }[];
};

type Row = { name: string; running: bigint; waiting: bigint; failed_today: bigint; last_finished: Date | null };

export async function getAutomationStatus(): Promise<AutomationStatus> {
  let rows: Row[] = [];
  try {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT name,
             count(*) FILTER (WHERE state = 'active') AS running,
             count(*) FILTER (WHERE state IN ('created', 'retry')) AS waiting,
             count(*) FILTER (WHERE state = 'failed' AND completed_on > now() - interval '1 day') AS failed_today,
             max(completed_on) FILTER (WHERE state = 'completed') AS last_finished
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
      lastFinished: r?.last_finished ? r.last_finished.toISOString() : null,
    };
  });
  return {
    running: queues.reduce((s, q) => s + q.running, 0),
    waiting: queues.reduce((s, q) => s + q.waiting, 0),
    failedToday: rows.reduce((s, r) => s + Number(r.failed_today), 0),
    workerLastSeen: byName.get(QUEUES.heartbeat)?.last_finished?.toISOString() ?? null,
    queues: queues.filter((q) => q.name !== QUEUES.heartbeat),
  };
}
