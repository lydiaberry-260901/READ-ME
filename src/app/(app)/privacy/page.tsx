import Link from "next/link";
import clsx from "clsx";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { colours } from "@/design/tokens";
import { daysLeft, effectiveDue, requestTypeLabels } from "@/lib/privacy/requests";
import { privacyAttention } from "@/lib/privacy/reminders";
import { goLiveChecklist } from "@/lib/privacy/checklist";
import { AnimatedNumber } from "@/components/motion";
import { Ring } from "@/components/visuals";
import { EmptyState, Notice } from "@/components/ui";
import { BreachClock, DaysLeft } from "./clock";
import { ACCESS_ACTIONS, accessLabel } from "./access-labels";

export const metadata = { title: "Privacy centre" };

export default async function PrivacyOverview() {
  const user = await requireCapability("privacy.access");
  const orgId = user.organisationId;
  const now = new Date();
  const [requests, breaches, review, suppressed, checklist, attention, access, completedThisYear] = await Promise.all([
    prisma.dataRequest.findMany({ where: { organisationId: orgId, status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { dueAt: "asc" } }),
    prisma.breach.findMany({ where: { organisationId: orgId, status: "OPEN" }, orderBy: { discoveredAt: "asc" } }),
    prisma.retentionReview.findFirst({ where: { organisationId: orgId, status: "PENDING" } }),
    prisma.suppression.count({ where: { organisationId: orgId } }),
    goLiveChecklist(orgId),
    privacyAttention(orgId, now),
    prisma.auditLog.findMany({
      where: { organisationId: orgId, OR: [{ action: { in: ACCESS_ACTIONS } }, { action: { startsWith: "export." } }] },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.dataRequest.count({ where: { organisationId: orgId, status: { in: ["COMPLETED", "REFUSED"] }, completedAt: { gte: new Date(now.getTime() - 365 * 86_400_000) } } }),
  ]);
  const overdue = requests.filter((r) => daysLeft(effectiveDue(r), now) < 0).length;
  const dueSoon = requests.filter((r) => { const d = daysLeft(effectiveDue(r), now); return d >= 0 && d <= 7; }).length;
  const reviewCount = review ? (review.items as unknown[]).length : 0;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Privacy centre</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Requests from people about their data, breaches, how long data is kept, suppliers, and the records the law asks us to keep. For the data protection lead and admins.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/privacy/requests/new" className="btn btn-primary py-1.5 no-underline">Record a request</Link>
          <Link href="/privacy/breaches/new" className="btn border border-red/40 bg-transparent py-1.5 text-red-text no-underline hover:bg-red-tint">Report a breach</Link>
        </div>
      </header>

      {breaches.some((b) => b.icoDecision === "NOT_DECIDED") ? (
        <section className="rounded-lg border border-red/40 bg-red-tint/40 p-5" aria-label="Open breaches">
          <h2 className="text-sm font-semibold text-red-text">Breach waiting for a decision on telling the ICO</h2>
          <ul className="mt-3 grid gap-3">
            {breaches.filter((b) => b.icoDecision === "NOT_DECIDED").map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-4">
                <Link href={`/privacy/breaches/${b.id}`} className="font-medium text-fg">{b.title}</Link>
                <BreachClock discoveredAt={b.discoveredAt.toISOString()} decided={false} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="At a glance" className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="bg-panel px-5 py-4">
          <Ring
            size={112}
            thickness={12}
            centre={<><AnimatedNumber value={checklist.done} /><span className="text-sm text-fg-muted">/{checklist.total}</span></>}
            centreLabel="ready to go live"
            parts={[
              { label: "Done", value: checklist.done, colour: colours.greenText },
              { label: "Still to do", value: checklist.total - checklist.done, colour: colours.amber },
            ]}
          />
        </div>
        <Link href="/privacy/requests" className="bg-panel px-5 py-4 no-underline hover:bg-panel-raised">
          <p className="text-xs text-fg-muted">Open requests</p>
          <p className="mt-1 text-3xl font-semibold text-fg"><AnimatedNumber value={requests.length} /></p>
          <p className={clsx("mt-1 text-xs", overdue ? "text-red-text" : dueSoon ? "text-amber-text" : "text-fg-muted")}>{overdue ? `${overdue} overdue` : dueSoon ? `${dueSoon} due within 7 days` : "None due this week"}</p>
        </Link>
        <Link href="/privacy/breaches" className="bg-panel px-5 py-4 no-underline hover:bg-panel-raised">
          <p className="text-xs text-fg-muted">Open breaches</p>
          <p className={clsx("mt-1 text-3xl font-semibold", breaches.length ? "text-red-text" : "text-fg")}><AnimatedNumber value={breaches.length} /></p>
          <p className="mt-1 text-xs text-fg-muted">Recorded even when not reported</p>
        </Link>
        <Link href="/privacy/retention" className="bg-panel px-5 py-4 no-underline hover:bg-panel-raised">
          <p className="text-xs text-fg-muted">Due for deletion</p>
          <p className={clsx("mt-1 text-3xl font-semibold", reviewCount ? "text-amber-text" : "text-fg")}><AnimatedNumber value={reviewCount} /></p>
          <p className="mt-1 text-xs text-fg-muted">{review ? `Waiting since ${formatDate(review.createdAt)}` : "Nothing waiting"}</p>
        </Link>
        <div className="bg-panel px-5 py-4">
          <p className="text-xs text-fg-muted">Do not contact list</p>
          <p className="mt-1 text-3xl font-semibold"><AnimatedNumber value={suppressed} /></p>
          <p className="mt-1 text-xs text-fg-muted">{completedThisYear} requests closed in the last year</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel" aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="border-b border-line px-5 py-3 text-sm font-semibold">Needs attention</h2>
          {attention.lines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-fg-muted">Nothing needs attention right now. Reminders are emailed at 08:00 when something does.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">{attention.lines.map((l, i) => <li key={i} className="px-5 py-2.5">{l}</li>)}</ul>
          )}
          {requests.length ? (
            <div className="border-t border-line">
              <h3 className="px-5 pt-3 text-xs font-semibold text-fg-muted">Open requests, soonest first</h3>
              <ul className="divide-y divide-line text-sm">
                {requests.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                    <Link href={`/privacy/requests/${r.id}`} className="text-fg">{requestTypeLabels[r.type]}: {r.requesterName}</Link>
                    <DaysLeft days={daysLeft(effectiveDue(r), now)} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-line bg-panel" aria-labelledby="access-heading">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id="access-heading" className="text-sm font-semibold">Recent views and downloads of personal data</h2>
            <Link href="/privacy/access-log" className="text-xs">Full log</Link>
          </div>
          {access.length === 0 ? (
            <div className="p-5"><EmptyState title="Nothing recorded yet" /></div>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {access.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                  <span>{a.user?.name ?? "Someone"} <span className="text-fg-muted">{accessLabel(a.action)}</span></span>
                  <span className="text-xs tabular-nums text-fg-muted">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {checklist.done < checklist.total ? (
        <Notice tone="amber" title="Before going live">
          {checklist.total - checklist.done} items on the go live checklist are still to do. See <Link href="/privacy/records">Records and checklist</Link>.
        </Notice>
      ) : null}
    </>
  );
}
