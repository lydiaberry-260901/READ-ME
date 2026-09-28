import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { knowledgeKindLabels } from "@/lib/knowledge/context";
import { Badge } from "@/components/ui";
import { deleteDocument } from "../actions";
import { EditDocument } from "./EditDocument";

export default async function KnowledgeDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { uploadedBy: { select: { name: true } } },
  });
  if (!doc) notFound();
  const manage = can(user, "knowledge.manage");

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/knowledge">Knowledge</Link> <span className="text-mocha-muted">/ {doc.title}</span></p>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{doc.title}</h1>
          <p className="mt-1.5 text-sm text-mocha-muted">
            {knowledgeKindLabels[doc.kind]}, added {formatDateTime(doc.createdAt)}{doc.uploadedBy?.name ? ` by ${doc.uploadedBy.name}` : ""}
            {doc.fileName ? `, from ${doc.fileName}` : ", pasted in"}
          </p>
        </div>
        <span className="flex gap-1.5">
          {doc.containsPersonalData ? <Badge tone="amber">Holds personal details</Badge> : null}
          {doc.useForAi && !doc.containsPersonalData ? <Badge tone="green">Used by the AI</Badge> : <Badge>Not used by the AI</Badge>}
        </span>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-6" aria-labelledby="text-heading">
          <h2 id="text-heading" className="text-lg font-semibold">Text</h2>
          <p className="text-sm text-mocha-muted">The text read from the file. The original file is not kept.</p>
          <div className="mt-4 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border border-stone bg-surface-sunk p-4 text-sm leading-relaxed">
            {doc.text}
          </div>
        </section>
        {manage ? (
          <div className="flex flex-col gap-8">
            <section className="card p-6">
              <h2 className="mb-4 text-lg font-semibold">Settings</h2>
              <EditDocument doc={{ id: doc.id, title: doc.title, kind: doc.kind, description: doc.description, useForAi: doc.useForAi, containsPersonalData: doc.containsPersonalData }} />
            </section>
            <section className="card p-6">
              <h2 className="text-lg font-semibold">Remove</h2>
              <p className="mt-1 text-sm text-mocha-muted">Deleting removes the text for good. The AI stops using it straight away.</p>
              <form action={deleteDocument} className="mt-4">
                <input type="hidden" name="id" value={doc.id} />
                <button type="submit" className="btn btn-danger">Delete this document</button>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </>
  );
}
