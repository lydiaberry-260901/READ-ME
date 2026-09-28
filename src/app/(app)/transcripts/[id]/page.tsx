import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";
import { callOutcomeLabels } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { QUALIFICATION_FIELDS } from "@/lib/qualification";
import { canManageTranscript, canViewTranscript } from "@/lib/transcripts/access";
import { linkOptions } from "@/lib/transcripts/pickers";
import { Badge, Notice } from "@/components/ui";
import { DeleteTranscriptForm, LinkForm, RecordingNoticeForm, SuggestionCard } from "../forms";
import { readAgain } from "../actions";

type AiResult = {
  recordingNotice?: { mentioned: boolean; evidence: string | null };
  dropped?: string[];
  promptVersion?: string;
};
type Promise_ = { text: string; dueDate: string | null; byWhom: "US" | "THEM" };
type Objection = { objection: string; howHandled: string | null };

const statusText = { PENDING: "Waiting to be read by the AI.", PROCESSING: "The AI is reading this call now. Refresh in a minute.", DONE: "", FAILED: "The AI could not read this call." } as const;
const fieldLabel = (key: string | null) => QUALIFICATION_FIELDS.find((f) => f.key === key)?.label ?? "Deal stage";
const ukDate = (iso: string) => iso.split("-").reverse().join("/");

export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await prisma.callTranscript.findFirst({
    where: { id, organisationId: user.organisationId },
    include: {
      deal: { include: { stage: true, pipeline: { include: { stages: true } } } },
      contact: { select: { id: true, firstName: true, lastName: true, organisationId: true, ownerId: true, isShared: true } },
      company: { select: { id: true, name: true } },
      uploadedBy: { select: { name: true, email: true } },
      suggestions: { include: { decidedBy: { select: { name: true } } }, orderBy: [{ kind: "desc" }, { createdAt: "asc" }] },
      tasks: { select: { id: true, title: true, dueAt: true, status: true, assignee: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!t || !canViewTranscript(user, t)) notFound();
  // Transcripts hold personal data, so every view is recorded.
  await audit({ organisationId: user.organisationId, userId: user.id, action: "transcript.viewed", entityType: "CallTranscript", entityId: t.id });

  const manage = canManageTranscript(user, t);
  const decideOnDeal = t.deal ? canEdit(user, t.deal, { sharedIsEditable: false }) : false;
  const options = manage ? await linkOptions(user, { contactId: t.contactId, dealId: t.dealId }) : null;
  const ai = (t.aiResult ?? {}) as AiResult;
  const promises = (t.promises ?? []) as Promise_[];
  const objections = (t.objections ?? []) as Objection[];
  const stageName = (stageId: string | null) => t.deal?.pipeline.stages.find((s) => s.id === stageId)?.name ?? "an unknown stage";
  const pending = t.suggestions.filter((s) => s.status === "PENDING");
  const decided = t.suggestions.filter((s) => s.status !== "PENDING");
  const at = t.callAt ?? t.createdAt;

  return (
    <div className="grid gap-6">
      <p className="text-sm"><Link href="/transcripts">Calls</Link> <span className="text-fg-muted">/ {t.title ?? "Call transcript"}</span></p>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.title ?? "Call transcript"}</h1>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-muted">
            <span>{t.callAt ? `Call on ${formatDateTime(t.callAt)}` : `Added ${formatDateTime(t.createdAt)}`}</span>
            {t.durationSeconds ? <span>{Math.round(t.durationSeconds / 60)} minutes</span> : null}
            <span>{t.source === "WEBHOOK" ? "Sent in by a call recording tool" : t.source === "UPLOAD" ? "Uploaded" : "Pasted"}{t.uploadedBy ? ` by ${t.uploadedBy.name ?? t.uploadedBy.email}` : ""}</span>
            {t.contact ? <Link href={`/contacts/${t.contact.id}`}>{t.contact.firstName} {t.contact.lastName}</Link> : null}
            {t.company ? <Link href={`/companies/${t.company.id}`}>{t.company.name}</Link> : null}
            {t.deal ? <Link href={`/deals/${t.deal.id}`}>Deal: {t.deal.name}</Link> : null}
          </p>
        </div>
        {t.outcome ? <Badge tone={t.outcome === "MEETING_BOOKED" || t.outcome === "INTERESTED" ? "green" : t.outcome === "NOT_INTERESTED" ? "red" : "neutral"}>{callOutcomeLabels[t.outcome]}</Badge> : null}
      </header>

      {t.recordingNoticeGiven !== true ? (
        <Notice tone={t.recordingNoticeGiven === false ? "red" : "amber"} title={t.recordingNoticeGiven === false ? "The person was not told the call was recorded" : "No record that the person was told the call was recorded"}>
          People must be told a call is being recorded, and why. {ai.recordingNotice?.mentioned ? <>The AI found these words in the call: &ldquo;{ai.recordingNotice.evidence}&rdquo;. If that is right, record it below.</> : "Record below whether they were told."}
        </Notice>
      ) : null}
      {t.matchStatus === "NEEDS_MATCHING" ? <Notice tone="amber" title="Not linked to a contact or deal">Link it below so it appears on the right records and the AI can suggest deal changes.</Notice> : null}
      {t.processingStatus !== "DONE" ? (
        <Notice tone={t.processingStatus === "FAILED" ? "red" : "neutral"} title={statusText[t.processingStatus]}>
          {t.processingError ?? "Suggestions appear here once it has been read."}
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-6">
          {t.summary ? (
            <section className="card relative overflow-hidden p-6" aria-labelledby="reading-heading">
              <span className="absolute inset-y-0 left-0 w-1 bg-green-text" aria-hidden="true" />
              <h2 id="reading-heading" className="text-lg font-semibold">What happened on the call</h2>
              <p className="mt-3 leading-relaxed">{t.summary}</p>
              {t.nextStep ? <p className="mt-3 text-sm"><span className="text-fg-muted">Agreed next step: </span>{t.nextStep}</p> : null}
              <div className="mt-5 grid gap-5 border-t border-line pt-5 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Promises</h3>
                  {promises.length ? (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {promises.map((p, i) => (
                        <li key={i}><span className="text-fg-muted">{p.byWhom === "US" ? "We" : "They"}: </span>{p.text}{p.dueDate ? <span className="text-fg-muted"> by {ukDate(p.dueDate)}</span> : null}</li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-fg-muted">None found.</p>}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Objections</h3>
                  {objections.length ? (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {objections.map((o, i) => <li key={i}>{o.objection}{o.howHandled ? <span className="block text-fg-muted">Handled: {o.howHandled}</span> : null}</li>)}
                    </ul>
                  ) : <p className="mt-2 text-sm text-fg-muted">None found.</p>}
                </div>
              </div>
              {ai.dropped?.length ? (
                <details className="mt-5 text-sm">
                  <summary className="cursor-pointer text-fg-muted">{ai.dropped.length} suggestion{ai.dropped.length === 1 ? " was" : "s were"} left out by the checks</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">{ai.dropped.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </details>
              ) : null}
              <p className="mt-5 text-xs text-fg-muted">
                Read by {t.aiModel} on {t.processedAt ? formatDateTime(t.processedAt) : ""}{ai.promptVersion ? `, using ${ai.promptVersion}` : ""}. Email addresses and phone numbers were removed first. Check it against the call before acting.
              </p>
            </section>
          ) : null}

          <section className="rounded-lg border border-line bg-panel" aria-labelledby="suggestions-heading">
            <div className="border-b border-line px-5 py-3">
              <h2 id="suggestions-heading" className="text-sm font-semibold">Suggested deal changes</h2>
              <p className="mt-0.5 text-xs text-fg-muted">Approve or reject each one. The deal only changes when you approve.</p>
            </div>
            {!t.deal ? (
              <p className="px-5 py-4 text-sm text-fg-muted">Link this call to a deal to get suggestions.</p>
            ) : pending.length === 0 ? (
              <p className="px-5 py-4 text-sm text-fg-muted">{t.processingStatus === "DONE" ? "Nothing waiting for a decision." : "Suggestions appear once the call has been read."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {pending.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    id={s.id}
                    kind={s.kind}
                    label={s.kind === "STAGE_CHANGE" ? "Move to a new stage" : fieldLabel(s.field)}
                    current={s.kind === "STAGE_CHANGE" ? stageName(s.currentValue) : s.currentValue}
                    proposed={s.kind === "STAGE_CHANGE" ? stageName(s.proposedValue) : s.proposedValue}
                    evidence={s.evidence}
                    canDecide={decideOnDeal}
                  />
                ))}
              </ul>
            )}
            {decided.length ? (
              <div className="border-t border-line px-5 py-3 text-xs text-fg-muted">
                <p className="font-medium text-fg">Already decided</p>
                <ul className="mt-1 space-y-0.5">
                  {decided.map((s) => (
                    <li key={s.id}>
                      {s.kind === "STAGE_CHANGE" ? `Move to ${stageName(s.proposedValue)}` : `${fieldLabel(s.field)}: ${s.proposedValue}`}, {s.status === "APPROVED" ? "approved" : "rejected"} by {s.decidedBy?.name ?? "a team member"}{s.decidedAt ? ` on ${formatDate(s.decidedAt)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-line bg-panel" aria-labelledby="tasks-heading">
            <h2 id="tasks-heading" className="border-b border-line px-5 py-3 text-sm font-semibold">Follow up tasks from this call</h2>
            {t.tasks.length ? (
              <ul className="divide-y divide-line text-sm">
                {t.tasks.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                    <span>{k.title} <span className="text-fg-muted">for {k.assignee.name}</span></span>
                    <span className="text-xs text-fg-muted">{k.status === "DONE" ? "Done" : k.status === "CANCELLED" ? "Removed" : k.dueAt ? `Due ${formatDate(k.dueAt)}` : "Open"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-fg-muted">{t.processingStatus === "DONE" ? "None. Tasks go to the deal owner, or the person who added the call." : "Tasks are added once the call has been read."}</p>
            )}
            {t.tasks.length ? <p className="border-t border-line px-5 py-2 text-xs"><Link href="/tasks">Open the Today page</Link> to work through them, with the draft messages.</p> : null}
          </section>

          <section className="rounded-lg border border-line bg-panel" aria-labelledby="text-heading">
            <details>
              <summary className="cursor-pointer px-5 py-3 text-sm font-semibold" id="text-heading">The transcript</summary>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap border-t border-line px-5 py-4 font-sans text-sm leading-relaxed text-fg-muted">{t.text}</pre>
            </details>
          </section>
        </div>

        <aside className="grid content-start gap-6">
          {manage && options ? (
            <>
              <section className="section-plain" aria-labelledby="link-heading">
                <h2 id="link-heading" className="mb-3 text-sm font-semibold">Linked records</h2>
                <LinkForm id={t.id} contacts={options.contacts} deals={options.deals} contactId={t.contactId} dealId={t.dealId} />
              </section>
              <section className="section-plain" aria-labelledby="notice-heading">
                <h2 id="notice-heading" className="mb-3 text-sm font-semibold">Recording notice</h2>
                <RecordingNoticeForm id={t.id} given={t.recordingNoticeGiven} detail={t.recordingNoticeDetail} />
              </section>
              <section className="section-plain" aria-labelledby="ai-heading">
                <h2 id="ai-heading" className="mb-2 text-sm font-semibold">Read the call again</h2>
                <p className="mb-3 text-xs text-fg-muted">Replaces the summary and any suggestions not yet decided. Tasks already made are not repeated.</p>
                <form action={readAgain}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="btn btn-secondary py-1.5">Read again</button>
                </form>
              </section>
              <section className="section-plain" aria-labelledby="delete-heading">
                <h2 id="delete-heading" className="mb-3 text-sm font-semibold">Delete</h2>
                <DeleteTranscriptForm id={t.id} />
              </section>
            </>
          ) : (
            <p className="text-sm text-fg-muted">Only the person who added this call, the deal&apos;s owner, their manager or an admin can change it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
