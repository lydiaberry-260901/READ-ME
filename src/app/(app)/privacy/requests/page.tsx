import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { daysLeft, effectiveDue, isOpenRequest, requestStatusLabels, requestTypeLabels } from "@/lib/privacy/requests";
import { Badge, EmptyState } from "@/components/ui";
import { DaysLeft } from "../clock";

export const metadata = { title: "Requests about data" };

type Params = Record<string, string | string[] | undefined>;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireCapability("privacy.access");
  const p = await searchParams;
  const showClosed = p.show === "all";
  const now = new Date();
  const requests = await prisma.dataRequest.findMany({
    where: { organisationId: user.organisationId, ...(showClosed ? {} : { status: { in: ["OPEN", "IN_PROGRESS"] } }) },
    include: { assignedTo: { select: { name: true } }, contact: { select: { id: true } } },
    orderBy: [{ dueAt: "asc" }],
    take: 500,
  });
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Requests about data</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            When someone asks to see, correct, delete or limit their data, object to its use, or receive a copy, record it here. Each must be answered within one calendar month. Weekends are allowed for; check bank holidays by hand.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={showClosed ? "/privacy/requests" : "/privacy/requests?show=all"} className="btn btn-secondary py-1.5 no-underline">{showClosed ? "Open only" : "Include closed"}</Link>
          <Link href="/privacy/requests/new" className="btn btn-primary py-1.5 no-underline">Record a request</Link>
        </div>
      </header>
      {requests.length === 0 ? (
        <EmptyState title={showClosed ? "No requests recorded" : "No open requests"}>Requests can arrive by any route: email, phone, letter or in person, and need not use any particular words.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Request</th>
                <th scope="col" className="px-4 py-2.5 font-medium">From</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Received</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Handled by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5"><Link href={`/privacy/requests/${r.id}`} className="font-medium text-fg">{requestTypeLabels[r.type]}</Link></td>
                  <td className="px-4 py-2.5">{r.requesterName}{!r.contact ? <span className="block text-xs text-fg-muted">Not linked to a contact</span> : null}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatDate(r.receivedAt)}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {formatDate(effectiveDue(r))}
                    {r.extendedDueAt ? <span className="block text-xs text-fg-muted">Extended</span> : null}
                    {isOpenRequest(r.status) ? <span className="block"><DaysLeft days={daysLeft(effectiveDue(r), now)} /></span> : null}
                  </td>
                  <td className="px-4 py-2.5"><Badge tone={r.status === "COMPLETED" ? "green" : r.status === "REFUSED" ? "red" : "neutral"}>{requestStatusLabels[r.status]}</Badge></td>
                  <td className="px-4 py-2.5">{r.assignedTo?.name ?? "Nobody yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
