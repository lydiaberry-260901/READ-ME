import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { ScriptEditor } from "../../ScriptEditor";
import { saveScript } from "../../actions";

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const s = await prisma.callScript.findFirst({ where: { id, organisationId: user.organisationId } });
  if (!s) notFound();
  const editable = can(user, "templates.manage");
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/outreach">Outreach</Link> <span className="text-ink-muted">/ {s.name}</span></p>
      <PageHeader title={s.name} description={editable ? "Changes apply to new drafts only." : "To use this script, open a contact and choose it there."} />
      <ScriptEditor
        canEdit={editable}
        action={saveScript}
        script={{
          id: s.id, name: s.name, customerGroup: s.customerGroup, reason: s.reason, active: s.active,
          opening: s.opening, questions: (s.questions as string[]) ?? [], objections: (s.objections as { objection: string; response: string }[]) ?? [], ask: s.ask,
        }}
      />
    </>
  );
}
