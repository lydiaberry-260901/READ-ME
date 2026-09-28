"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { hasUnfilledGaps } from "@/lib/outreach/merge";
import { ScriptFieldsEditor, type ScriptFields } from "../../ScriptEditor";
import { markReady, saveEmailDraft, saveScriptDraft, sendDraftAction } from "../../actions";

export function EmailDraftEditor({
  id,
  subject,
  body,
  footer,
  locked,
  recipient,
  sendFrom,
  blocked,
}: {
  id: string;
  subject: string;
  body: string;
  footer: string | null;
  locked: boolean;
  recipient: string | null;
  sendFrom: string | null;
  blocked: boolean;
}) {
  const [state, action, pending] = useActionState(saveEmailDraft, null);
  const [sendState, sendAction, sending] = useActionState(sendDraftAction, null);
  const [text, setText] = useState(body);
  const [subj, setSubj] = useState(subject);
  const [confirming, setConfirming] = useState(false);
  const gaps = hasUnfilledGaps(text) || hasUnfilledGaps(subj);
  const sent = sendState?.ok;
  const readOnly = locked || sent;

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm text-fg-muted">To: {recipient ?? "no email address"}{sendFrom ? `, from ${sendFrom}` : ""}</p>
        <div>
          <label htmlFor="d-subject" className="label">Subject line</label>
          <input id="d-subject" name="subject" value={subj} onChange={(e) => setSubj(e.target.value)} disabled={readOnly} maxLength={200} className="field" />
        </div>
        <div>
          <label htmlFor="d-body" className="label">Email</label>
          <textarea id="d-body" name="body" value={text} onChange={(e) => setText(e.target.value)} disabled={readOnly} rows={16} className="field leading-relaxed" />
        </div>
        {footer ? (
          <div className="whitespace-pre-wrap rounded-md border border-dashed border-line bg-panel-sunk px-4 py-3 text-xs leading-relaxed text-fg-muted" aria-label="Fixed footer">
            <p className="mb-1 font-semibold text-fg">Added automatically when sent, and cannot be removed:</p>
            {footer}
          </div>
        ) : null}
        {gaps && !readOnly ? <Notice tone="amber">Some details are still missing, shown as [[...]]. Fill them in or reword that part before sending.</Notice> : null}
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? "Saving" : "Save draft"}</button>
            {sendFrom ? (
              <button type="button" className="btn btn-primary" disabled={gaps || blocked || !recipient} onClick={() => setConfirming(true)}>Send</button>
            ) : (
              <span className="text-sm text-fg-muted">Connect your email under Email and calendar in the account menu to send from the CRM.</span>
            )}
          </div>
        ) : null}
        {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
      </form>

      {confirming && !sent ? (
        <form action={sendAction} className="rounded-lg border border-green/40 bg-green-tint/40 p-4" aria-label="Confirm sending">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="subject" value={subj} />
          <input type="hidden" name="body" value={text} />
          <p className="font-semibold">Send this email to {recipient} now?</p>
          <p className="mt-1 text-sm text-fg-muted">It goes from your own account ({sendFrom}), exactly as shown{footer ? ", with the footer" : ""}. The contact rules are checked again at this moment.</p>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? "Sending" : "Yes, send it"}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>Not yet</button>
          </div>
        </form>
      ) : null}
      {sendState ? <Notice tone={sendState.ok ? "green" : "red"} title={sendState.ok ? "Sent" : "Not sent"}>{sendState.message}</Notice> : null}
    </div>
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
