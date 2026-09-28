import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "My drafts" };

export default async function DraftsPage() {
  const user = await requireUser();
  const drafts = await prisma.outreachDraft.findMany({
    where: { organisationId: user.organisationId, userId: user.id, status: { in: ["DRAFT", "READY"] } },
    orderBy: { updatedAt: "desc" },
    include: { contact: { select: { firstName: true, lastName: true } }, company: { select: { name: true } } },
    take: 200,
  });
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/outreach">Outreach</Link> <span className="text-fg-muted">/ My drafts</span></p>
      <PageHeader title="My drafts" description="Emails and call scripts you have started. Nothing here has been sent." />
      {drafts.length === 0 ? (
        <EmptyState title="No drafts">Open a contact and choose a template to start one.</EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {drafts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <Link href={`/outreach/drafts/${d.id}`} className="font-medium text-fg">
                  {d.kind === "EMAIL" ? d.subject || "Email without a subject" : "Call script"}
                </Link>
                <p className="text-sm text-fg-muted">
                  To {d.contact ? `${d.contact.firstName} ${d.contact.lastName ?? ""}`.trim() : "a removed contact"}
                  {d.company ? ` at ${d.company.name}` : ""}, changed {formatDateTime(d.updatedAt)}
                </p>
              </div>
              <span className="flex gap-1.5">
                <Badge>{d.kind === "EMAIL" ? "Email" : "Call script"}</Badge>
                {d.aiGenerated ? <Badge>AI draft</Badge> : null}
                {d.status === "READY" ? <Badge tone="green">Ready to call</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
