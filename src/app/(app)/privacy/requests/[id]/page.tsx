import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { daysLeft, effectiveDue, isOpenRequest, requestStatusLabels, requestTypeHelp, requestTypeLabels } from "@/lib/privacy/requests";
import { findMentions } from "@/lib/privacy/subject";
import { Badge, Notice } from "@/components/ui";
import { DaysLeft } from "../../clock";
import { CompleteRequestForm, RequestUpdateForm } from "../../forms";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCapability("privacy.access");
  const { id } = await params;
  const r = await prisma.dataRequest.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, company: { select: { name: true } }, optedOut: true, restricted: true } }, assignedTo: { select: { name: true } } },
  });
  if (!r) notFound();
  const [people, history] = await Promise.all([
    prisma.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({ where: { organisationId: user.organisationId, entityType: "DataRequest", entityId: r.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const open = isOpenRequest(r.status);
  const name = r.contact ? `${r.contact.firstName} ${r.contact.lastName ?? ""}`.trim() : r.requesterName;
  const mentions = open ? await findMentions(user.organisationId, name, r.contact?.id) : [];
  const due = effectiveDue(r);
  const contactOption = r.contact ? { id: r.contact.id, label: `${name}${r.contact.email ? ` (${r.contact.email})` : ""}${r.contact.company ? `, ${r.contact.company.name}` : ""}` } : null;
  const extendMonths = r.extendedDueAt ? Math.max(1, Math.min(2, Math.round((r.extendedDueAt.getTime() - r.dueAt.getTime()) / (30 * 86_400_000)))) : 0;

  return (
    <div className="grid gap-6">
      <p className="text-sm"><Link href="/privacy/requests">Requests</Link> <span className="text-fg-muted">/ {r.requesterName}</span></p>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{requestTypeLabels[r.type]}</h1>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-muted">
            <span>From {r.requesterName}{r.requesterEmail ? ` (${r.requesterEmail})` : ""}</span>
            <span>Received {formatDate(r.receivedAt)}</span>
            <span>Handled by {r.assignedTo?.name ?? "nobody yet"}</span>
          </p>
        </div>
        <div className="text-right">
          <Badge tone={r.status === "COMPLETED" ? "green" : r.status === "REFUSED" ? "red" : "neutral"}>{requestStatusLabels[r.status]}</Badge>
          <p className="mt-2 text-sm">Due {formatDate(due)}{r.extendedDueAt ? " (extended)" : ""}</p>
          {open ? <DaysLeft days={daysLeft(due, new Date())} /> : null}
        </div>
      </header>

      <Notice title="What to do">{requestTypeHelp[r.type]}</Notice>
      {open && !r.identityCheckedAt ? <Notice tone="amber">Check they are who they say they are before sending any data. Ask only for what is reasonable, and the deadline still runs.</Notice> : null}
      {r.outcome ? <Notice tone={r.status === "REFUSED" ? "red" : "green"} title={`${requestStatusLabels[r.status]} on ${formatDate(r.completedAt)}`}>{r.outcome}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="grid content-start gap-6">
          <section className="card p-6" aria-labelledby="record-heading">
            <h2 id="record-heading" className="text-lg font-semibold">Their record</h2>
            {r.contact ? (
              <div className="mt-3 grid gap-3 text-sm">
                <p>
                  <Link href={`/contacts/${r.contact.id}`} className="font-medium">{name}</Link>
                  {r.contact.company ? <span className="text-fg-muted">, {r.contact.company.name}</span> : null}
                  {r.contact.optedOut ? <span className="ml-2"><Badge tone="red">Opted out</Badge></span> : null}
                  {r.contact.restricted ? <span className="ml-2"><Badge tone="amber">Use limited</Badge></span> : null}
                </p>
                {r.type === "ACCESS" || r.type === "PORTABILITY" ? (
                  <div>
                    <a href={`/api/privacy/requests/${r.id}/export`} className="btn btn-primary py-1.5 no-underline">Download their data</a>
                    <p className="mt-2 text-xs text-fg-muted">One file with everything linked to them, and the other places their name appears. Read it before sending, and remove details about other people. The download is recorded.</p>
                  </div>
                ) : r.type === "RECTIFICATION" ? (
                  <p><Link href={`/contacts/${r.contact.id}`}>Open their record to correct it</Link>, then close this request saying what was changed.</p>
                ) : (
                  <p className="text-fg-muted">The change is made when you close the request below.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-fg-muted">Not linked to a contact yet. Search for them below. If we hold nothing about them, close the request saying so.</p>
            )}
          </section>

          {open && mentions.length ? (
            <section className="rounded-lg border border-amber/40 bg-panel" aria-labelledby="mentions-heading">
              <div className="border-b border-line px-5 py-3">
                <h2 id="mentions-heading" className="text-sm font-semibold">Other places &ldquo;{name}&rdquo; appears</h2>
                <p className="mt-0.5 text-xs text-fg-muted">Free text not linked to their record. Check each one: it may need correcting, deleting or including. It may also be someone else with the same name.</p>
              </div>
              <ul className="divide-y divide-line text-sm">
                {mentions.slice(0, 30).map((m, i) => (
                  <li key={i} className="px-5 py-2.5">
                    <p className="text-xs text-fg-muted">{m.where}: {m.href ? <Link href={m.href}>{m.label}</Link> : m.label}</p>
                    <p className="mt-0.5">{m.snippet}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-lg border border-line bg-panel" aria-labelledby="history-heading">
            <h2 id="history-heading" className="border-b border-line px-5 py-3 text-sm font-semibold">History</h2>
            {history.length === 0 ? <p className="px-5 py-3 text-sm text-fg-muted">Nothing recorded yet.</p> : null}
            <ul className="divide-y divide-line text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 px-5 py-2">
                  <span>{h.action.replace("privacy.request_", "Request ").replace("export.subject_access", "Their data downloaded").replace(/_/g, " ")} <span className="text-fg-muted">by {h.user?.name ?? "someone"}</span></span>
                  <span className="text-xs tabular-nums text-fg-muted">{formatDateTime(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {open ? (
          <aside className="grid content-start gap-6">
            <section className="section-plain" aria-labelledby="update-heading">
              <h2 id="update-heading" className="mb-3 text-sm font-semibold">Details</h2>
              <RequestUpdateForm
                people={people.map((p) => ({ id: p.id, label: p.name ?? p.email }))}
                request={{ id: r.id, status: r.status, contact: contactOption, assignedToId: r.assignedToId, identityChecked: Boolean(r.identityCheckedAt), details: r.details, extendMonths, extensionReason: r.extensionReason }}
              />
            </section>
            <section className="section-plain" aria-labelledby="close-heading">
              <h2 id="close-heading" className="mb-3 text-sm font-semibold">Close the request</h2>
              <CompleteRequestForm id={r.id} type={r.type} hasContact={Boolean(r.contact)} />
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
