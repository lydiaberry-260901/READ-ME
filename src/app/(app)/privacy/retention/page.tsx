import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RetentionItem } from "@/lib/privacy/retention";
import { EmptyState } from "@/components/ui";
import { PrivacySettingsForm, RetentionReviewForm } from "../forms";
import { dismissRetention } from "../actions";
import { RunListNow } from "./RunListNow";

export const metadata = { title: "Keeping data" };

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function RetentionPage() {
  const user = await requireCapability("privacy.access");
  const admin = can(user, "settings.manage");
  const [org, people, pending, history] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } }),
    prisma.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.retentionReview.findFirst({ where: { organisationId: user.organisationId, status: "PENDING" } }),
    prisma.retentionReview.findMany({ where: { organisationId: user.organisationId, status: { not: "PENDING" } }, include: { decidedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const items = (pending?.items ?? []) as RetentionItem[];
  const counts = (pending?.counts ?? {}) as { contacts?: number; transcripts?: number; news?: number };
  const shown = items.length;
  const total = (counts.contacts ?? 0) + (counts.transcripts ?? 0) + (counts.news ?? 0);

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Keeping data</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Data is kept only as long as it is needed. On the 1st of each month a list is made of records past these periods. Nothing is deleted until an admin approves the list. Contacts on open deals, or with a request in progress, are never included.
        </p>
      </header>

      <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
        <section className="rounded-lg border border-line bg-panel" aria-labelledby="list-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div>
              <h2 id="list-heading" className="text-sm font-semibold">Due for deletion</h2>
              <p className="text-xs text-fg-muted">{pending ? `Made ${formatDateTime(pending.createdAt)}: ${counts.contacts ?? 0} contacts, ${counts.transcripts ?? 0} transcripts, ${counts.news ?? 0} news items.` : "No list waiting."}</p>
            </div>
            {admin ? <RunListNow /> : null}
          </div>
          <div className="p-5">
            {pending ? (
              <>
                {total > shown ? <p className="mb-3 text-xs text-amber-text">Showing the first {shown} of {total}. The rest will be on next month&apos;s list.</p> : null}
                <RetentionReviewForm id={pending.id} items={items} canApprove={admin} />
                {admin ? (
                  <form action={dismissRetention} className="mt-4">
                    <input type="hidden" name="id" value={pending.id} />
                    <button type="submit" className="text-xs text-fg-muted underline">Dismiss this list without deleting anything</button>
                  </form>
                ) : null}
              </>
            ) : (
              <EmptyState title="Nothing is due for deletion">The next list is made on the 1st of next month.</EmptyState>
            )}
          </div>
        </section>

        <section className="grid content-start gap-4" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="text-sm font-semibold">Settings</h2>
          <PrivacySettingsForm
            canEdit={admin}
            people={people.map((p) => ({ id: p.id, label: p.name ?? p.email }))}
            s={{
              dataProtectionLeadId: org.dataProtectionLeadId, retainContactsMonths: org.retainContactsMonths, retainTranscriptsMonths: org.retainTranscriptsMonths, retainNewsMonths: org.retainNewsMonths,
              icoFeeRenewalDate: isoDate(org.icoFeeRenewalDate), dpiaReviewDate: isoDate(org.dpiaReviewDate),
            }}
          />
        </section>
      </div>

      {history.length ? (
        <section className="rounded-lg border border-line bg-panel" aria-labelledby="history-heading">
          <h2 id="history-heading" className="border-b border-line px-5 py-3 text-sm font-semibold">Earlier lists</h2>
          <ul className="divide-y divide-line text-sm">
            {history.map((h) => {
              const r = (h.result ?? {}) as { deleted?: { contacts: number; transcripts: number; news: number }; note?: string };
              return (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                  <span>
                    {formatDate(h.createdAt)}: {h.status === "APPROVED" && r.deleted ? `deleted ${r.deleted.contacts} contacts, ${r.deleted.transcripts} transcripts, ${r.deleted.news} news items` : r.note ?? "Dismissed"}
                  </span>
                  <span className="text-xs text-fg-muted">{h.decidedBy?.name ? `by ${h.decidedBy.name}` : ""}{h.decidedAt ? ` on ${formatDate(h.decidedAt)}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
