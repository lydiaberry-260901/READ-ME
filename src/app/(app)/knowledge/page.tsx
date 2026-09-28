import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { DEFAULT_CONTEXT_CHARS, knowledgeKindLabels } from "@/lib/knowledge/context";
import { PageHeader, Badge, EmptyState, StatCard } from "@/components/ui";
import { UploadPanel } from "./UploadPanel";

export const metadata = { title: "Knowledge" };

export default async function KnowledgePage() {
  const user = await requireUser();
  const docs = await prisma.knowledgeDocument.findMany({
    where: { organisationId: user.organisationId },
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, kind: true, description: true, fileName: true, charCount: true, useForAi: true, containsPersonalData: true, createdAt: true, uploadedBy: { select: { name: true } } },
  });
  const manage = can(user, "knowledge.manage");
  const aiDocs = docs.filter((d) => d.useForAi && !d.containsPersonalData);
  const aiChars = aiDocs.reduce((s, d) => s + d.charCount, 0);

  return (
    <>
      <PageHeader
        title="Knowledge"
        description="Documents that explain Moca's business: company context, products, case studies and example transcripts. The AI reads the ones switched on here when it writes company summaries, and later outreach drafts and call scripts."
      />

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Documents" value={docs.length} />
        <StatCard label="Used by the AI" value={aiDocs.length} />
        <StatCard
          label="Text the AI reads"
          value={`${Math.min(100, Math.round((aiChars / DEFAULT_CONTEXT_CHARS) * 100))}%`}
          hint={aiChars > DEFAULT_CONTEXT_CHARS ? "More than fits. Company context and products are used first, then case studies, then transcripts." : "Of the space available for background information."}
        />
      </section>

      {manage ? <UploadPanel /> : <p className="mb-6 text-sm text-mocha-muted">Admins and managers can add documents to the library.</p>}

      <section className="card mt-8 overflow-hidden" aria-labelledby="lib-heading">
        <h2 id="lib-heading" className="px-6 pb-3 pt-6 text-lg font-semibold">Library</h2>
        {docs.length === 0 ? (
          <div className="px-6 pb-6"><EmptyState title="Nothing here yet">Add Moca's company overview, product notes and case studies to get started.</EmptyState></div>
        ) : (
          <ul className="divide-y divide-stone border-t border-stone">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <Link href={`/knowledge/${d.id}`} className="font-medium text-mocha underline-offset-4 hover:underline">{d.title}</Link>
                  <p className="mt-0.5 text-sm text-mocha-muted">
                    {knowledgeKindLabels[d.kind]}, {d.charCount.toLocaleString("en-GB")} characters, added {formatDate(d.createdAt)}
                    {d.uploadedBy?.name ? ` by ${d.uploadedBy.name}` : ""}
                    {d.fileName ? `, from ${d.fileName}` : ", pasted in"}
                  </p>
                  {d.description ? <p className="mt-1 text-sm">{d.description}</p> : null}
                </div>
                <span className="flex flex-wrap gap-1.5">
                  {d.containsPersonalData ? <Badge tone="amber">Holds personal details</Badge> : null}
                  {d.useForAi && !d.containsPersonalData ? <Badge tone="green">Used by the AI</Badge> : <Badge>Not used by the AI</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
