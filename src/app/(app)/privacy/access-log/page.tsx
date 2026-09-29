import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/ui";
import { ACCESS_ACTIONS, accessLabel } from "../access-labels";

export const metadata = { title: "Access log" };

type Params = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;

export default async function AccessLogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireCapability("privacy.access");
  const p = await searchParams;
  const page = Math.max(1, Number(Array.isArray(p.page) ? p.page[0] : p.page) || 1);
  const person = typeof p.person === "string" ? p.person : "";
  const where = {
    organisationId: user.organisationId,
    OR: [{ action: { in: ACCESS_ACTIONS } }, { action: { startsWith: "export." } }],
    ...(person ? { userId: person } : {}),
  };
  const [rows, total, people] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ where: { organisationId: user.organisationId }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const link = (e: { entityType: string | null; entityId: string | null; action: string }) =>
    e.action === "contact.erased" ? null : e.entityType === "Contact" && e.entityId ? `/contacts/${e.entityId}` : e.entityType === "CallTranscript" && e.entityId ? `/transcripts/${e.entityId}` : e.entityType === "DataRequest" && e.entityId ? `/privacy/requests/${e.entityId}` : null;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Access log</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">Who viewed or downloaded personal data, and when. Kept automatically; nobody can change it from the CRM.</p>
        </div>
        <form method="get" className="flex gap-2">
          <label htmlFor="al-person" className="sr-only">Person</label>
          <select id="al-person" name="person" defaultValue={person} className="field w-auto py-1.5">
            <option value="">Everyone</option>
            {people.map((x) => <option key={x.id} value={x.id}>{x.name ?? x.email}</option>)}
          </select>
          <button type="submit" className="btn btn-secondary py-1.5">Show</button>
        </form>
      </header>
      {rows.length === 0 ? (
        <EmptyState title="Nothing recorded" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-fg-muted">
              <tr><th scope="col" className="px-4 py-2.5 font-medium">When</th><th scope="col" className="px-4 py-2.5 font-medium">Who</th><th scope="col" className="px-4 py-2.5 font-medium">What</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const href = link(r);
                const details = (r.details ?? {}) as { rows?: string | number };
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-fg-muted">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2">{r.user?.name ?? r.user?.email ?? "System"}</td>
                    <td className="px-4 py-2">
                      {href ? <Link href={href}>{accessLabel(r.action)}</Link> : accessLabel(r.action)}
                      {details.rows !== undefined ? <span className="text-fg-muted"> ({details.rows} rows)</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(n) => `/privacy/access-log?${new URLSearchParams({ ...(person ? { person } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`} />
    </>
  );
}
