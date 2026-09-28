"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { hasUnfilledGaps } from "@/lib/outreach/merge";
import { ScriptFieldsEditor, type ScriptFields } from "../../ScriptEditor";
import { markReady, saveEmailDraft, saveScriptDraft } from "../../actions";

export function EmailDraftEditor({ id, subject, body, footer, locked }: { id: string; subject: string; body: string; footer: string | null; locked: boolean }) {
  const [state, action, pending] = useActionState(saveEmailDraft, null);
  const [text, setText] = useState(body);
  const [subj, setSubj] = useState(subject);
  const gaps = hasUnfilledGaps(text) || hasUnfilledGaps(subj);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor="d-subject" className="label">Subject line</label>
        <input id="d-subject" name="subject" value={subj} onChange={(e) => setSubj(e.target.value)} disabled={locked} maxLength={200} className="field" />
      </div>
      <div>
        <label htmlFor="d-body" className="label">Email</label>
        <textarea id="d-body" name="body" value={text} onChange={(e) => setText(e.target.value)} disabled={locked} rows={16} className="field leading-relaxed" />
      </div>
      {footer ? (
        <div className="whitespace-pre-wrap rounded-md border border-dashed border-line bg-panel-sunk px-4 py-3 text-xs leading-relaxed text-fg-muted" aria-label="Fixed footer">
          <p className="mb-1 font-semibold text-fg">Added automatically when sent, and cannot be removed:</p>
          {footer}
        </div>
      ) : null}
      {gaps ? <Notice tone="amber">Some details are still missing, shown as [[...]]. Fill them in or reword that part before sending.</Notice> : null}
      {!locked ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save draft"}</button>
          <span className="text-sm text-fg-muted">Sending from the CRM arrives once email accounts can be connected. Nothing is ever sent automatically.</span>
        </div>
      ) : null}
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}

export function ScriptDraftEditor({ id, fields, ready, locked }: { id: string; fields: ScriptFields; ready: boolean; locked: boolean }) {
  const [state, action, pending] = useActionState(saveScriptDraft, null);
  const [readyState, readyAction, readying] = useActionState(markReady, null);
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="id" value={id} />
        <ScriptFieldsEditor initial={fields} disabled={locked} />
        {!locked ? (
          <div>
            <button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? "Saving" : "Save script"}</button>
          </div>
        ) : null}
        {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
      </form>
      <form action={readyAction} className="grid gap-3 border-t border-line pt-5">
        <input type="hidden" name="id" value={id} />
        {ready ? (
          <Notice tone="green" title="Ready to call">The number was checked against the TPS and CTPS do not call lists recently enough.</Notice>
        ) : (
          <>
            <p className="text-sm text-fg-muted">Before calling, the number must have been checked against the TPS and CTPS do not call lists within the allowed time.</p>
            <div>
              <button type="submit" className="btn btn-primary" disabled={readying || locked}>{readying ? "Checking" : "Mark ready to call"}</button>
            </div>
          </>
        )}
        {readyState ? <Notice tone={readyState.ok ? "green" : "red"}>{readyState.message}</Notice> : null}
      </form>
    </div>
  );
}
