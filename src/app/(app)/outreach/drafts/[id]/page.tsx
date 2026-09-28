import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { OutreachBlockedError } from "@/lib/outreach/context";
import { emailBlockReason, ownDraft } from "@/lib/outreach/drafts";
import { marketingFooter, footerGaps } from "@/lib/outreach/footer";
import { unsubscribeUrl } from "@/lib/outreach/unsubscribe";
import { MERGE_FIELDS } from "@/lib/outreach/merge";
import { Badge, Notice } from "@/components/ui";
import { discardDraft } from "../../actions";
import { EmailDraftEditor, ScriptDraftEditor } from "./DraftEditors";

export const metadata = { title: "Draft" };

const fieldLabel = (key: string) => MERGE_FIELDS.find((f) => f.key === key)?.label.toLowerCase() ?? key;

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let draft;
  try {
    draft = await ownDraft(user, id);
  } catch (error) {
    if (error instanceof OutreachBlockedError) notFound();
    throw error;
  }
  const [org, sendAccount] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } }),
    prisma.emailAccount.findFirst({ where: { userId: user.id, status: "ACTIVE" }, select: { emailAddress: true } }),
  ]);
  const notes = (draft.aiNotes ?? {}) as { personalisationNotes?: string[]; missingInformation?: string[]; missingMergeFields?: string[] };
  const locked = draft.status === "SENT" || draft.status === "DISCARDED";
  const contactName = draft.contact ? `${draft.contact.firstName} ${draft.contact.lastName ?? ""}`.trim() : "a removed contact";
  const blocked = draft.kind === "EMAIL" && draft.contact ? emailBlockReason(draft.contact, draft.isMarketing) : null;
  const footer = draft.kind === "EMAIL" && draft.isMarketing && draft.contactId ? marketingFooter(org, unsubscribeUrl(org.id, draft.contactId)) : null;
  const gaps = footer ? footerGaps(org) : [];

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/outreach/drafts">My drafts</Link>
        {draft.contact ? <> <span className="text-fg-muted">/</span> <Link href={`/contacts/${draft.contact.id}`}>{contactName}</Link></> : null}
      </p>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{draft.kind === "EMAIL" ? "Email draft" : "Call script"} for {contactName}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {draft.company ? `${draft.company.name}. ` : ""}
            From {draft.emailTemplate?.name ?? draft.callScript?.name ?? "a template that has since been removed"}. Started {formatDateTime(draft.createdAt)}.
          </p>
        </div>
        <span className="flex gap-1.5">
          {draft.aiGenerated ? <Badge>AI draft by {draft.aiModel}</Badge> : null}
          {draft.status === "DISCARDED" ? <Badge tone="red">Discarded</Badge> : null}
        </span>
      </header>

      {blocked ? <div className="mb-6"><Notice tone="red" title="This email cannot be sent">{blocked}</Notice></div> : null}
      {draft.aiGenerated ? (
        <div className="mb-6">
          <Notice tone="amber" title="Please check this AI draft carefully">
            It was written from the company's details and the template. Make sure every statement is true before using it.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <section aria-label="Draft">
          {draft.kind === "EMAIL" ? (
            <EmailDraftEditor id={draft.id} subject={draft.subject ?? ""} body={draft.body ?? ""} footer={footer} locked={locked} recipient={draft.contact?.email ?? null} sendFrom={sendAccount?.emailAddress ?? null} blocked={Boolean(blocked)} />
          ) : (
            <ScriptDraftEditor
              id={draft.id}
              locked={locked}
              ready={draft.status === "READY"}
              fields={{
                opening: draft.opening ?? "",
                questions: (draft.questions as string[]) ?? [],
                objections: (draft.objections as { objection: string; response: string }[]) ?? [],
                ask: draft.ask ?? "",
              }}
            />
          )}
        </section>

        <aside className="grid content-start gap-8 text-sm">
          {notes.missingMergeFields?.length ? (
            <div className="section-plain">
              <h2 className="font-semibold">Details we do not have</h2>
              <p className="mt-1 text-fg-muted">These are shown as [[...]] in the draft: {notes.missingMergeFields.map(fieldLabel).join(", ")}.</p>
            </div>
          ) : null}
          {notes.personalisationNotes?.length ? (
            <div className="section-plain">
              <h2 className="font-semibold">What the AI personalised</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">{notes.personalisationNotes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          ) : null}
          {notes.missingInformation?.length ? (
            <div className="section-plain">
              <h2 className="font-semibold">Information the AI could not find</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">{notes.missingInformation.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          ) : null}
          {gaps.length ? (
            <div className="section-plain">
              <h2 className="font-semibold">Footer details still needed</h2>
              <p className="mt-1 text-fg-muted">An admin needs to add {gaps.join(", ")} under Settings, Organisation.</p>
            </div>
          ) : null}
          {!locked ? (
            <form action={discardDraft} className="section-plain">
              <input type="hidden" name="id" value={draft.id} />
              <button type="submit" className="text-sm font-medium text-red-text underline-offset-4 hover:underline">Discard this draft</button>
            </form>
          ) : null}
        </aside>
      </div>
    </>
  );
}
