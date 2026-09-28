import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { emailMode } from "@/lib/notifications/email";
import { PageHeader, Badge, Notice, EmptyState } from "@/components/ui";

export const metadata = { title: "Alert log" };

type Params = Record<string, string | string[] | undefined>;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireCapability("alerts.view");
  const status = String((await searchParams).status ?? "");
  const where = { organisationId: user.organisationId, ...(["PENDING", "SENDING", "SENT", "FAILED"].includes(status) ? { status: status as "PENDING" } : {}) };
  const [alerts, counts] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.notification.groupBy({ by: ["status"], where: { organisationId: user.organisationId }, _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const mode = emailMode();

  return (
    <>
      <PageHeader title="Alert log" description="Every alert email the CRM has tried to send, with its status. Failed alerts are tried again automatically." />
      {mode === "none" ? (
        <div className="mb-6"><Notice tone="amber" title="Alert emails are not set up yet">Add the SMTP settings (see the README). Until then alerts are saved here and sent once it is set up.</Notice></div>
      ) : mode === "log" ? (
        <div className="mb-6"><Notice>Development mode: alert emails are written to the worker's log instead of being sent.</Notice></div>
      ) : null}
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["", "All"], ["SENT", `Sent (${count("SENT")})`], ["PENDING", `Waiting (${count("PENDING")})`], ["FAILED", `Failed (${count("FAILED")})`]].map(([v, l]) => (
          <a key={v} href={v ? `?status=${v}` : "?"} className={`rounded-full border px-3 py-1 no-underline ${status === v ? "border-green-text text-green-text" : "border-line text-fg"}`}>{l}</a>
        ))}
      </nav>
      {alerts.length === 0 ? (
        <EmptyState title="No alerts yet">They appear when a deal moves stage or closes.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-panel-sunk text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Created</th>
                <th scope="col" className="px-3 py-2.5 font-medium">To</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Subject</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Attempts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-panel">
              {alerts.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                  <td className="px-3 py-2.5">{a.recipientEmail}</td>
                  <td className="px-3 py-2.5">{a.subject}</td>
                  <td className="px-3 py-2.5">
                    {a.status === "SENT" ? <Badge tone="green">Sent {formatDateTime(a.sentAt)}</Badge> : a.status === "FAILED" ? <Badge tone="red">Failed</Badge> : <Badge tone="amber">Waiting</Badge>}
                    {a.lastError ? <p className="mt-1 max-w-xs text-xs text-red-text">{a.lastError}</p> : null}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{a.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
