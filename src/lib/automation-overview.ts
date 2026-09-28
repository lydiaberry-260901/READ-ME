// The Automations page: every scheduled job in plain English, when it last ran and runs next,
// and the last 24 hours of work, read from the job list in the database.
import { prisma } from "@/lib/db";
import { getBoss } from "@/jobs/boss";
import { QUEUES, SCHEDULES, SCHEDULE_TIME_ZONE, type QueueName } from "@/jobs/queues";
import { automationLabels } from "@/lib/automations";

/** Describes the cron timings this app uses in plain English. */
export function describeCron(cron: string): string {
  const [min, hour, dom, mon, dow] = cron.split(/\s+/);
  const every = min.match(/^\*\/(\d+)$/);
  if (every && hour === "*" && dom === "*" && mon === "*" && dow === "*") return `Every ${every[1]} minutes`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*") {
    const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (dow === "*") return `Every day at ${time}`;
    if (dow === "1-5") return `Every weekday at ${time}`;
    if (dow === "1") return `Every Monday at ${time}`;
  }
  return `On the schedule "${cron}"`;
}

/** Automations people may start by hand from the page. */
export const RUNNABLE: QueueName[] = [QUEUES.recalculateHealth, QUEUES.sendNotification];

type RawJob = { name: string; state: string; created_ms: number; started_ms: number | null; completed_ms: number | null };
type JobRow = { name: string; state: string; created_on: Date; started_on: Date | null; completed_on: Date | null };

export async function getAutomationOverview(now = new Date()) {
  let jobs: JobRow[] = [];
  try {
    // Times are read as milliseconds since 1970, which avoids any time zone confusion in the driver.
    const raw = await prisma.$queryRaw<RawJob[]>`
      SELECT name, state,
             (extract(epoch from created_on) * 1000)::float8 AS created_ms,
             (extract(epoch from started_on) * 1000)::float8 AS started_ms,
             (extract(epoch from completed_on) * 1000)::float8 AS completed_ms
      FROM pgboss.job
      WHERE created_on > now() - interval '24 hours'
      ORDER BY created_on DESC
      LIMIT 2000`;
    jobs = raw.map((j) => ({
      name: j.name,
      state: j.state,
      created_on: new Date(j.created_ms),
      started_on: j.started_ms ? new Date(j.started_ms) : null,
      completed_on: j.completed_ms ? new Date(j.completed_ms) : null,
    }));
  } catch {
    // The job list is created when the worker first starts.
  }

  let nextRuns = new Map<string, Date | null>();
  try {
    const boss = await getBoss("web");
    nextRuns = new Map(SCHEDULES.map((s) => [s.queue, boss.previewSchedule(s.cron, { tz: SCHEDULE_TIME_ZONE, from: now, count: 1 })[0] ?? null]));
  } catch {
    // If the job list cannot be reached, next run times are left blank.
  }

  const schedules = SCHEDULES.map((s) => {
    const mine = jobs.filter((j) => j.name === s.queue);
    const last = mine.find((j) => j.state === "completed");
    return {
      queue: s.queue,
      label: automationLabels[s.queue],
      description: s.description,
      when: describeCron(s.cron),
      nextRun: nextRuns.get(s.queue)?.toISOString() ?? null,
      lastRun: last?.completed_on?.toISOString() ?? null,
      failed24h: mine.filter((j) => j.state === "failed").length,
      done24h: mine.filter((j) => j.state === "completed").length,
      runnable: RUNNABLE.includes(s.queue),
    };
  });

  // Jobs that are not on a timetable but run when something happens, such as AI summaries.
  const scheduled = new Set<string>(SCHEDULES.map((s) => s.queue));
  const onDemand = (Object.values(QUEUES) as QueueName[])
    .filter((q) => !scheduled.has(q))
    .map((q) => {
      const mine = jobs.filter((j) => j.name === q);
      return {
        queue: q,
        label: automationLabels[q],
        waiting: mine.filter((j) => j.state === "created" || j.state === "retry").length,
        running: mine.filter((j) => j.state === "active").length,
        done24h: mine.filter((j) => j.state === "completed").length,
        failed24h: mine.filter((j) => j.state === "failed").length,
      };
    });

  // Jobs finished each hour for the last 24 hours.
  const hours = Array.from({ length: 24 }, (_, i) => {
    const start = new Date(now.getTime() - (23 - i) * 3_600_000);
    start.setMinutes(0, 0, 0);
    return start;
  });
  const timeline = hours.map((h) => {
    const end = h.getTime() + 3_600_000;
    const inHour = jobs.filter((j) => j.completed_on && j.completed_on.getTime() >= h.getTime() && j.completed_on.getTime() < end);
    return {
      hour: new Intl.DateTimeFormat("en-GB", { timeZone: SCHEDULE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(h),
      done: inHour.filter((j) => j.state === "completed").length,
      failed: inHour.filter((j) => j.state === "failed").length,
    };
  });

  const recent = jobs.slice(0, 25).map((j) => ({
    name: automationLabels[j.name as QueueName] ?? j.name,
    state: j.state,
    createdOn: j.created_on.toISOString(),
    seconds: j.started_on && j.completed_on ? Math.max(0, Math.round((j.completed_on.getTime() - j.started_on.getTime()) / 100) / 10) : null,
  }));

  return { schedules, onDemand, timeline, recent };
}
