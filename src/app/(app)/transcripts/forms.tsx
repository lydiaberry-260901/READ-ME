"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import {
  addTranscript, approveSuggestionAction, deleteTranscriptAction, linkTranscriptAction, rejectSuggestionAction, setRecordingNotice,
} from "./actions";

type Option = { id: string; label: string };

function Pickers({ contacts, deals, contactId, dealId }: { contacts: Option[]; deals: Option[]; contactId?: string | null; dealId?: string | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="t-contact" className="label">Contact on the call</label>
        <select id="t-contact" name="contactId" defaultValue={contactId ?? ""} className="field">
          <option value="">Not linked</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="t-deal" className="label">Deal</label>
        <select id="t-deal" name="dealId" defaultValue={dealId ?? ""} className="field">
          <option value="">Not linked (a contact&apos;s open deal is used if they have one)</option>
          {deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function NoticeFields({ given, detail }: { given?: boolean | null; detail?: string | null }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="label">Was the person told the call was being recorded, and why?</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {[
          { v: "yes", l: "Yes", checked: given === true },
          { v: "no", l: "No", checked: given === false },
          { v: "unknown", l: "Not known", checked: given === null || given === undefined },
        ].map((o) => (
          <label key={o.v} className="inline-flex items-center gap-2">
            <input type="radio" name="recordingNotice" value={o.v} defaultChecked={o.checked} /> {o.l}
          </label>
        ))}
      </div>
      <input name="recordingNoticeDetail" defaultValue={detail ?? ""} placeholder="How they were told, for example the opening script" className="field" aria-label="How they were told" />
    </fieldset>
  );
}

export function AddTranscriptForm({ contacts, deals, contactId, dealId }: { contacts: Option[]; deals: Option[]; contactId?: string | null; dealId?: string | null }) {
  const [state, action, pending] = useActionState(addTranscript, null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <form action={action} className="grid gap-5">
      <div>
        <label htmlFor="t-title" className="label">Title (optional)</label>
        <input id="t-title" name="title" placeholder="For example: Discovery call with Harbourline" className="field" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="t-date" className="label">Date of the call</label>
          <input id="t-date" name="callDate" type="date" className="field" />
        </div>
        <div>
          <label htmlFor="t-time" className="label">Time (24 hour)</label>
          <input id="t-time" name="callTime" type="time" className="field" />
        </div>
      </div>
      <Pickers contacts={contacts} deals={deals} contactId={contactId} dealId={dealId} />
      <div>
        <label htmlFor="t-text" className="label">Paste the transcript</label>
        <textarea id="t-text" name="text" rows={8} className="field font-mono text-sm" placeholder="Speaker names help, for example: Aisha: Thanks for making the time today." />
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={() => setDragging(false)}
        className={`relative grid cursor-pointer place-items-center rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm transition-colors ${dragging ? "border-green-text bg-green-tint" : "border-line-strong/60 bg-panel-sunk"}`}
      >
        <input type="file" name="file" accept=".txt,.vtt,.srt,.docx,.pdf,.md" className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
        <span className="font-medium">{fileName ?? "Or drag and drop a file here"}</span>
        <span className="mt-1 text-xs text-fg-muted">Text, subtitle (.vtt, .srt), Word or PDF, up to 10 MB. A file is used instead of pasted text.</span>
      </label>
      <NoticeFields />
      <p className="text-xs text-fg-muted">Transcripts hold personal details. Email addresses and phone numbers are removed before the AI reads the call. You can delete a transcript at any time.</p>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save and read the call"}</button></div>
      {state && !state.ok ? <Notice tone="red">{state.message}</Notice> : null}
    </form>
  );
}

export function LinkForm({ id, contacts, deals, contactId, dealId }: { id: string; contacts: Option[]; deals: Option[]; contactId: string | null; dealId: string | null }) {
  const [state, action, pending] = useActionState(linkTranscriptAction, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <Pickers contacts={contacts} deals={deals} contactId={contactId} dealId={dealId} />
      <div><button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>{pending ? "Saving" : "Save links"}</button></div>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}

export function RecordingNoticeForm({ id, given, detail }: { id: string; given: boolean | null; detail: string | null }) {
  const [state, action, pending] = useActionState(setRecordingNotice, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <NoticeFields given={given} detail={detail} />
      <div><button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>{pending ? "Saving" : "Save"}</button></div>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}

export function SuggestionCard({
  id, kind, label, current, proposed, evidence, canDecide, source,
}: { id: string; kind: "STAGE_CHANGE" | "QUALIFICATION_FIELD"; label: string; current: string | null; proposed: string; evidence: string | null; canDecide: boolean; source?: React.ReactNode }) {
  const [approveState, approve, approving] = useActionState(approveSuggestionAction, null);
  const [rejectState, reject, rejecting] = useActionState(rejectSuggestionAction, null);
  const state = approveState ?? rejectState;
  return (
    <li className="grid gap-3 px-5 py-4">
      {source ? <p className="text-xs text-fg-muted">{source}</p> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-fg-muted">Now: {current ?? "not recorded"}</p>
      </div>
      {evidence ? <blockquote className="border-l-2 border-line-strong pl-3 text-sm italic text-fg-muted">{evidence}</blockquote> : null}
      {canDecide && !state?.ok ? (
        <div className="flex flex-wrap items-end gap-2">
          <form action={approve} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={id} />
            {kind === "QUALIFICATION_FIELD" ? (
              <label className="min-w-64 flex-1">
                <span className="sr-only">Value to save</span>
                <input name="value" defaultValue={proposed} className="field py-1.5 text-sm" />
              </label>
            ) : (
              <p className="flex-1 text-sm">Move the deal to <strong>{proposed}</strong></p>
            )}
            <button type="submit" className="btn btn-primary py-1.5" disabled={approving || rejecting}>{approving ? "Applying" : "Approve"}</button>
          </form>
          <form action={reject}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="btn btn-secondary py-1.5" disabled={approving || rejecting}>Reject</button>
          </form>
        </div>
      ) : !canDecide ? (
        <p className="text-sm">Suggested: {proposed}. <span className="text-fg-muted">Only the deal&apos;s owner, their manager or an admin can decide.</span></p>
      ) : null}
      {state ? <p role="status" className={`text-sm ${state.ok ? "text-green-text" : "text-red-text"}`}>{state.message}</p> : null}
    </li>
  );
}

export function DeleteTranscriptForm({ id }: { id: string }) {
  return (
    <form action={deleteTranscriptAction} className="grid gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" name="confirm" value="yes" required /> I understand this deletes the transcript and its suggestions. Changes already approved stay on the deal, and tasks stay on the list.
      </label>
      <div><button type="submit" className="btn border border-red/40 bg-transparent py-1.5 text-red-text hover:bg-red-tint">Delete transcript</button></div>
    </form>
  );
}
