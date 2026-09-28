"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "@/components/ui";
import { recordPhoneCheck, recordPrivacyNotice, recordConsent, optOutContact, addContactTag } from "../actions";

function Message({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <div className="mt-2">
      <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice>
    </div>
  );
}

export function PhoneCheckForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(recordPhoneCheck, null);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-ink-muted">
        Check the number on the TPS and CTPS websites, then record the result here.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" name="result" value="CLEAR" className="btn btn-secondary py-1.5" disabled={pending}>Checked today: not listed</button>
        <button type="submit" name="result" value="LISTED" className="btn btn-secondary py-1.5" disabled={pending}>Checked today: listed</button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function DateRecordForm({ id, kind, todayIso, label, button }: { id: string; kind: "notice" | "consent"; todayIso: string; label: string; button: string }) {
  const [state, action, pending] = useActionState(kind === "notice" ? recordPrivacyNotice : recordConsent, null);
  const name = kind === "notice" ? "sentAt" : "consentAt";
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor={`${kind}-${id}`} className="text-xs text-ink-muted">{label}</label>
        <input id={`${kind}-${id}`} name={name} type="date" defaultValue={todayIso} max={todayIso} required className="field py-1" />
      </div>
      <button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>{button}</button>
      <div className="w-full"><Message state={state} /></div>
    </form>
  );
}

export function OptOutForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(optOutContact, null);
  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        Record an opt out
      </button>
    );
  }
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="optout-reason" className="label">How did they ask us to stop?</label>
      <input id="optout-reason" name="reason" required minLength={2} maxLength={300} className="field" placeholder="For example: replied to our email asking not to be contacted" />
      <p className="text-xs text-ink-muted">This blocks all contact straight away, for everyone in the team, and cannot be undone here.</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-danger" disabled={pending}>{pending ? "Saving" : "Confirm opt out"}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function AddContactTagForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addContactTag, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="new-contact-tag" className="sr-only">New tag</label>
      <input id="new-contact-tag" name="name" maxLength={40} placeholder="Add a tag" className="field w-40 py-1" required />
      <button type="submit" className="btn btn-secondary py-1" disabled={pending}>Add</button>
      {state && !state.ok ? <span role="status" className="text-sm text-red-ink">{state.message}</span> : null}
    </form>
  );
}
