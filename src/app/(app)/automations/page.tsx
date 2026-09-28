import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getAutomationStatus } from "@/lib/automations";
import { getAutomationOverview } from "@/lib/automation-overview";
import { formatDateTime } from "@/lib/format";
import { Badge, Notice } from "@/components/ui";
import { AnimatedNumber } from "@/components/motion";
import { AutomationTimeline } from "./Timeline";
import { RunNow } from "./RunNow";

export const metadata = { title: "Automations" };

const stateLabels: Record<string, { label: string; tone: "green" | "amber" | "red" | "neutral" }> = {
  completed: { label: "Finished", tone: "green" },
  active: { label: "Running", tone: "amber" },
  created: { label: "Waiting", tone: "neutral" },
  retry: { label: "Will retry", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default async function AutomationsPage() {
  const user = await requireUser();
  const [status, overview] = await Promise.all([getAutomationStatus(), getAutomationOverview()]);
  const runner = can(user, "jobs.run");
  const workerAge = status.workerLastSeen ? Math.round((Date.now() - new Date(status.workerLastSeen).getTime()) / 60_000) : null;
  const online = workerAge !== null && workerAge <= 30;
  const doneToday = overview.timeline.reduce((a, h) => a + h.done, 0);
  const failedToday = overview.timeline.reduce((a, h) => a + h.failed, 0);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Automations</h1>
        <p className="mt-1 text-sm text-fg-muted">
          The background worker runs these on its own. Nothing here ever sends an email to a prospect or changes a deal without a person.
        </p>
      </header>

      {!online ? (
        <Notice tone="amber" title="The background worker is not running">
          Scheduled jobs wait until it starts again. On this computer, run <code>npm run worker</code> in a second terminal. On the live server it runs as its own service.
        </Notice>
      ) : null}

      <section aria-label="Automation figures" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <div className="bg-panel px-5 py-4">
          <p className="text-xs text-fg-muted">Worker</p>
          <p className="mt-1 flex items-center gap-2 text-xl font-semibold">
            <span aria-hidden="true" className={`size-2.5 rounded-full ${online ? "live-dot bg-green-text" : "bg-amber"}`} />
            {online ? "Running" : "Offline"}
          </p>
          <p className="text-xs text-fg-muted">{status.workerLastSeen ? `Last checked in ${formatDateTime(status.workerLastSeen)}` : "Has not checked in yet"}</p>
        </div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Finished, last 24 hours</p><p className="mt-1 text-2xl font-semibold"><AnimatedNumber value={doneToday} /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">In progress now</p><p className="mt-1 text-2xl font-semibold"><AnimatedNumber value={status.running + status.waiting} /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Failed, last 24 hours</p><p className={`mt-1 text-2xl font-semibold ${failedToday ? "text-red-text" : ""}`}><AnimatedNumber value={failedToday} /></p><p className="text-xs text-fg-muted">Failed jobs are retried automatically.</p></div>
      </section>

      <AutomationTimeline data={overview.timeline} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel" aria-label="Scheduled automations">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">On a timetable</h2>
          <ul className="divide-y divide-line">
            {overview.schedules.map((s) => (
              <li key={s.queue} className="grid gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{s.label}</p>
                  <Badge>{s.when}</Badge>
                </div>
                <p className="text-sm text-fg-muted">{s.description}</p>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted">
                  <span>
                    Last ran {s.lastRun ? formatDateTime(s.lastRun) : "not yet"}. Next {s.nextRun ? formatDateTime(s.nextRun) : "when the worker is running"}.
                    {s.failed24h ? <span className="text-red-text"> {s.failed24h} failed today.</span> : null}
                  </span>
                  {runner && s.runnable ? <RunNow queue={s.queue} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid content-start gap-6">
          <section className="rounded-lg border border-line bg-panel" aria-label="Automations that run when something happens">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">When something happens</h2>
            <ul className="divide-y divide-line">
              {overview.onDemand.map((q) => (
                <li key={q.queue} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span>{q.label}</span>
                  <span className="text-xs text-fg-muted">
                    {q.running + q.waiting > 0 ? `${q.running} running, ${q.waiting} waiting` : `${q.done24h} done today`}
                    {q.failed24h ? `, ${q.failed24h} failed` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-line bg-panel" aria-label="Recent jobs">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Recent jobs</h2>
            {overview.recent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">No jobs in the last 24 hours.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-line">
                  {overview.recent.map((j, i) => (
                    <tr key={i}>
                      <td className="px-5 py-2">{j.name}</td>
                      <td className="px-3 py-2"><Badge tone={stateLabels[j.state]?.tone ?? "neutral"}>{stateLabels[j.state]?.label ?? j.state}</Badge></td>
                      <td className="px-3 py-2 text-xs text-fg-muted">{formatDateTime(j.createdOn)}</td>
                      <td className="px-5 py-2 text-right text-xs tabular-nums text-fg-muted">{j.seconds !== null ? `${j.seconds} s` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
