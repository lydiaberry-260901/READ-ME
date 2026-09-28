import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { footerPreviewFor } from "@/lib/outreach/footer-preview";
import { PageHeader } from "@/components/ui";
import { TemplateEditor } from "../../TemplateEditor";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await prisma.emailTemplate.findFirst({ where: { id, organisationId: user.organisationId } });
  if (!t) notFound();
  const editable = can(user, "templates.manage");

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/outreach">Outreach</Link> <span className="text-ink-muted">/ {t.name}</span></p>
      <PageHeader
        title={t.name}
        description={editable ? `Version ${t.version}. Changes apply to new drafts only.` : "To use this template, open a contact and choose it there. Admins and managers can edit templates."}
      />
      <TemplateEditor
        canEdit={editable}
        footerPreview={await footerPreviewFor(user.organisationId)}
        template={{ id: t.id, name: t.name, customerGroup: t.customerGroup, reason: t.reason, subject: t.subject, body: t.body, isMarketing: t.isMarketing, active: t.active }}
      />
    </>
  );
}
