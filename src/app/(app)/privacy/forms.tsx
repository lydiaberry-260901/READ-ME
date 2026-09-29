"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import {
  approveRetention, closeBreach, completeRequest, createBreach, createRequest, findContactsForRequest, saveAssessment, savePrivacySettings, saveSupplier, updateBreach, updateRequest,
} from "./actions";

type Option = { id: string; label: string };
type Act = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

function Result({ state }: { state: ActionResult | null }) {
  return state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null;
}

function Submit({ pending, label, busy }: { pending: boolean; label: string; busy?: string }) {
  return <button type="submit" className="btn btn-primary py-1.5" disabled={pending}>{pending ? busy ?? "Saving" : label}</button>;
}

const REQUEST_TYPES: Option[] = [
  { id: "ACCESS", label: "See their data" },
  { id: "RECTIFICATION", label: "Correct their data" },
  { id: "ERASURE", label: "Delete their data" },
  { id: "RESTRICTION", label: "Limit the use of their data" },
  { id: "OBJECTION", label: "Object to the use of their data" },
  { id: "PORTABILITY", label: "Receive a copy in a usable format" },
];

/** Searches every contact in the organisation, so a request can be linked to the right record. */
export function ContactFinder({ name = "contactId", initial }: { name?: string; initial?: Option | null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Option[]>([]);
  const [chosen, setChosen] = useState<Option | null>(initial ?? null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => start(async () => setResults(await findContactsForRequest(q))), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      {chosen ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded border border-line bg-panel-sunk px-2 py-1">{chosen.label}</span>
          <button type="button" className="text-xs text-fg-muted underline" onClick={() => setChosen(null)}>Change</button>
        </p>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="field" aria-label="Search contacts" />
          {pending ? <p className="text-xs text-fg-muted">Searching</p> : null}
          {results.length ? (
            <ul className="max-h-48 overflow-auto rounded-md border border-line text-sm">
              {results.map((r) => (
                <li key={r.id}><button type="button" onClick={() => setChosen(r)} className="block w-full px-3 py-1.5 text-left hover:bg-panel-raised">{r.label}</button></li>
              ))}
            </ul>
          ) : q.trim().length >= 2 && !pending ? <p className="text-xs text-fg-muted">No contact found. That can be the answer: we may hold nothing about them.</p> : null}
        </>
      )}
    </div>
  );
}

export function NewRequestForm({ people, today, meId }: { people: Option[]; today: string; meId: string }) {
  const [state, action, pending] = useActionState(createRequest, null);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="r-type" className="label">What they are asking for</label>
          <select id="r-type" name="type" className="field" required>
            {REQUEST_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="r-received" className="label">Date received</label>
          <input id="r-received" name="receivedDate" type="date" defaultValue={today} max={today} className="field" required />
          <p className="mt-1 text-xs text-fg-muted">The one month deadline runs from this date.</p>
        </div>
        <div>
          <label htmlFor="r-name" className="label">Their name</label>
          <input id="r-name" name="requesterName" className="field" required />
        </div>
        <div>
          <label htmlFor="r-email" className="label">How to reply to them (email)</label>
          <input id="r-email" name="requesterEmail" type="email" className="field" />
        </div>
      </div>
      <div>
        <p className="label">Their contact record, if we have one</p>
        <ContactFinder />
      </div>
      <div>
        <label htmlFor="r-details" className="label">What they asked, in brief</label>
        <textarea id="r-details" name="details" rows={3} className="field" />
      </div>
      <div className="max-w-sm">
        <label htmlFor="r-assign" className="label">Handled by</label>
        <select id="r-assign" name="assignedToId" defaultValue={meId} className="field">
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div><Submit pending={pending} label="Record the request" /></div>
      <Result state={state} />
    </form>
  );
}

export function RequestUpdateForm({
  request, people,
}: {
  request: { id: string; status: string; contact: Option | null; assignedToId: string | null; identityChecked: boolean; details: string | null; extendMonths: number; extensionReason: string | null };
  people: Option[];
}) {
  const [state, action, pending] = useActionState(updateRequest, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={request.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="u-status" className="label">Status</label>
          <select id="u-status" name="status" defaultValue={request.status === "IN_PROGRESS" ? "IN_PROGRESS" : "OPEN"} className="field">
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
          </select>
        </div>
        <div>
          <label htmlFor="u-assign" className="label">Handled by</label>
          <select id="u-assign" name="assignedToId" defaultValue={request.assignedToId ?? ""} className="field">
            <option value="">Nobody yet</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className="label">Their contact record</p>
        <ContactFinder initial={request.contact} />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="identityChecked" value="yes" defaultChecked={request.identityChecked} /> We have checked they are who they say they are
      </label>
      <div>
        <label htmlFor="u-details" className="label">What they asked, in brief</label>
        <textarea id="u-details" name="details" rows={3} defaultValue={request.details ?? ""} className="field" />
      </div>
      <fieldset className="grid gap-3 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-semibold">More time for a complex request</legend>
        <select name="extendMonths" defaultValue={String(request.extendMonths)} className="field w-auto" aria-label="Extra months">
          <option value="0">No extension</option>
          <option value="1">One more month</option>
          <option value="2">Two more months</option>
        </select>
        <input name="extensionReason" defaultValue={request.extensionReason ?? ""} placeholder="Why more time is needed" className="field" aria-label="Why more time is needed" />
        <p className="text-xs text-fg-muted">Only for complex or numerous requests. Tell the person, with the reason, within the first month.</p>
      </fieldset>
      <div><Submit pending={pending} label="Save" /></div>
      <Result state={state} />
    </form>
  );
}

export function CompleteRequestForm({ id, type, hasContact }: { id: string; type: string; hasContact: boolean }) {
  const [state, action, pending] = useActionState(completeRequest, null);
  const [decision, setDecision] = useState("COMPLETED");
  const warning =
    decision === "COMPLETED" && hasContact
      ? type === "ERASURE" ? "Completing this deletes their contact record, emails, transcripts, drafts and tasks about them. This cannot be undone."
      : type === "RESTRICTION" ? "Completing this marks their details as limited, so nobody can contact them."
      : type === "OBJECTION" ? "Completing this opts them out and adds them to the do not contact list."
      : null
      : null;
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2"><input type="radio" name="decision" value="COMPLETED" checked={decision === "COMPLETED"} onChange={() => setDecision("COMPLETED")} /> Done</label>
        <label className="inline-flex items-center gap-2"><input type="radio" name="decision" value="REFUSED" checked={decision === "REFUSED"} onChange={() => setDecision("REFUSED")} /> Refused, with a reason</label>
      </div>
      <div>
        <label htmlFor="c-outcome" className="label">{decision === "REFUSED" ? "Why it was refused (the person must be told, and of their right to complain to the ICO)" : "What was done, and when they were told"}</label>
        <textarea id="c-outcome" name="outcome" rows={3} className="field" required />
      </div>
      {decision === "COMPLETED" && type === "ERASURE" && hasContact ? (
        <label className="inline-flex items-start gap-2 text-sm">
          <input type="checkbox" name="keepOnDoNotContactList" value="yes" defaultChecked className="mt-1" />
          <span>Keep a minimal entry on the do not contact list (a scrambled copy of their email and phone only), so they are never contacted again</span>
        </label>
      ) : null}
      {warning ? <Notice tone="amber">{warning}</Notice> : null}
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" required /> I confirm
      </label>
      <div><Submit pending={pending} label="Close the request" busy="Closing" /></div>
      <Result state={state} />
    </form>
  );
}

function localNow() {
  const d = new Date();
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function NewBreachForm() {
  const [state, action, pending] = useActionState(createBreach, null);
  const [now] = useState(localNow);
  return (
    <form action={action} className="grid gap-4">
      <div>
        <label htmlFor="b-title" className="label">Short title</label>
        <input id="b-title" name="title" placeholder="For example: Contact list emailed to the wrong person" className="field" required />
      </div>
      <div className="max-w-sm">
        <label htmlFor="b-found" className="label">When we found out (London time)</label>
        <input id="b-found" name="discoveredAt" type="datetime-local" defaultValue={now} max={now} className="field" required />
        <p className="mt-1 text-xs text-fg-muted">The 72 hour clock starts from this moment.</p>
      </div>
      <div>
        <label htmlFor="b-desc" className="label">What happened</label>
        <textarea id="b-desc" name="description" rows={4} className="field" required />
      </div>
      <div>
        <label htmlFor="b-data" className="label">What personal data was involved, if known</label>
        <textarea id="b-data" name="dataInvolved" rows={2} className="field" />
      </div>
      <div><Submit pending={pending} label="Record and start the clock" /></div>
      <Result state={state} />
    </form>
  );
}

type BreachValues = {
  id: string; description: string; occurredAt: string; dataInvolved: string | null; peopleAffected: number | null; risk: string; riskReason: string | null;
  icoDecision: string; icoDecisionReason: string | null; icoReference: string | null; peopleTold: boolean; actionsTaken: string | null; lessons: string | null;
};

export function BreachForm({ b, closed }: { b: BreachValues; closed: boolean }) {
  const [state, action, pending] = useActionState(updateBreach, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={b.id} />
      <fieldset disabled={closed} className="grid gap-4">
        <div>
          <label htmlFor="bf-desc" className="label">What happened</label>
          <textarea id="bf-desc" name="description" rows={4} defaultValue={b.description} className="field" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bf-occ" className="label">When it happened, if known (London time)</label>
            <input id="bf-occ" name="occurredAt" type="datetime-local" defaultValue={b.occurredAt} className="field" />
          </div>
          <div>
            <label htmlFor="bf-people" className="label">Roughly how many people are affected</label>
            <input id="bf-people" name="peopleAffected" type="number" min={0} defaultValue={b.peopleAffected ?? ""} className="field" />
          </div>
        </div>
        <div>
          <label htmlFor="bf-data" className="label">What personal data was involved</label>
          <textarea id="bf-data" name="dataInvolved" rows={2} defaultValue={b.dataInvolved ?? ""} className="field" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bf-risk" className="label">Risk to the people affected</label>
            <select id="bf-risk" name="risk" defaultValue={b.risk} className="field">
              <option value="UNKNOWN">Not decided yet</option>
              <option value="UNLIKELY">Unlikely to be a risk to them</option>
              <option value="RISK">A risk to them: tell the ICO</option>
              <option value="HIGH_RISK">A high risk: tell the ICO and the people affected</option>
            </select>
          </div>
          <div>
            <label htmlFor="bf-ico" className="label">Telling the ICO</label>
            <select id="bf-ico" name="icoDecision" defaultValue={b.icoDecision} className="field">
              <option value="NOT_DECIDED">Not decided yet</option>
              <option value="REPORTED">Reported to the ICO</option>
              <option value="NOT_REQUIRED">Not required, with the reason recorded</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="bf-riskr" className="label">Why that level of risk</label>
          <textarea id="bf-riskr" name="riskReason" rows={2} defaultValue={b.riskReason ?? ""} className="field" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bf-icor" className="label">Reason for the ICO decision</label>
            <textarea id="bf-icor" name="icoDecisionReason" rows={2} defaultValue={b.icoDecisionReason ?? ""} className="field" />
          </div>
          <div>
            <label htmlFor="bf-ref" className="label">ICO reference, if reported</label>
            <input id="bf-ref" name="icoReference" defaultValue={b.icoReference ?? ""} className="field" />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="peopleTold" value="yes" defaultChecked={b.peopleTold} /> The people affected have been told
        </label>
        <div>
          <label htmlFor="bf-actions" className="label">What was done</label>
          <textarea id="bf-actions" name="actionsTaken" rows={3} defaultValue={b.actionsTaken ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="bf-lessons" className="label">What will stop it happening again</label>
          <textarea id="bf-lessons" name="lessons" rows={2} defaultValue={b.lessons ?? ""} className="field" />
        </div>
        {!closed ? <div><Submit pending={pending} label="Save" /></div> : null}
      </fieldset>
      <Result state={state} />
    </form>
  );
}

export function CloseBreachForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(closeBreach, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <div><button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>{pending ? "Closing" : "Close this breach"}</button></div>
      <Result state={state} />
    </form>
  );
}

type SupplierValues = {
  id?: string; name: string; purpose: string; dataShared: string; location: string | null; outsideUk: boolean | null; safeguards: string | null;
  dpaInPlace: boolean; dpaDate: string | null; noTraining: boolean | null; notes: string | null;
};
const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "unknown");

export function SupplierForm({ s, onDone }: { s?: SupplierValues; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveSupplier as Act, null);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  const k = s?.id ?? "new";
  return (
    <form action={action} className="grid gap-3 text-sm">
      {s?.id ? <input type="hidden" name="id" value={s.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`s-name-${k}`} className="label">Supplier</label>
          <input id={`s-name-${k}`} name="name" defaultValue={s?.name} className="field" required />
        </div>
        <div>
          <label htmlFor={`s-loc-${k}`} className="label">Where the data is stored</label>
          <input id={`s-loc-${k}`} name="location" defaultValue={s?.location ?? ""} placeholder="Not confirmed yet" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor={`s-purpose-${k}`} className="label">What they do for us</label>
        <textarea id={`s-purpose-${k}`} name="purpose" rows={2} defaultValue={s?.purpose} className="field" required />
      </div>
      <div>
        <label htmlFor={`s-data-${k}`} className="label">What data they receive</label>
        <textarea id={`s-data-${k}`} name="dataShared" rows={2} defaultValue={s?.dataShared} className="field" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`s-out-${k}`} className="label">Data leaves the UK</label>
          <select id={`s-out-${k}`} name="outsideUk" defaultValue={tri(s?.outsideUk ?? null)} className="field">
            <option value="unknown">Not confirmed</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div>
          <label htmlFor={`s-dpa-${k}`} className="label">Data processing agreement</label>
          <select id={`s-dpa-${k}`} name="dpaInPlace" defaultValue={s?.dpaInPlace ? "yes" : "no"} className="field">
            <option value="no">Not in place yet</option>
            <option value="yes">In place</option>
          </select>
        </div>
        <div>
          <label htmlFor={`s-dpad-${k}`} className="label">Agreement date</label>
          <input id={`s-dpad-${k}`} name="dpaDate" type="date" defaultValue={s?.dpaDate ?? ""} className="field" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`s-safe-${k}`} className="label">Safeguard if data leaves the UK</label>
          <input id={`s-safe-${k}`} name="safeguards" defaultValue={s?.safeguards ?? ""} placeholder="For example: UK adequacy, or the international data transfer addendum" className="field" />
        </div>
        <div>
          <label htmlFor={`s-train-${k}`} className="label">For AI services: does not train on our data</label>
          <select id={`s-train-${k}`} name="noTraining" defaultValue={tri(s?.noTraining ?? null)} className="field">
            <option value="unknown">Not confirmed or not an AI service</option>
            <option value="yes">Confirmed: no training on our data</option>
            <option value="no">It may train on our data</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`s-notes-${k}`} className="label">Notes</label>
        <textarea id={`s-notes-${k}`} name="notes" rows={2} defaultValue={s?.notes ?? ""} className="field" />
      </div>
      <div><Submit pending={pending} label={s?.id ? "Save" : "Add supplier"} /></div>
      <Result state={state} />
    </form>
  );
}

type Assessment = { purpose: string; necessity: string; balance: string; safeguards: string; outcome: string };

export function AssessmentForm({ a }: { a: Assessment }) {
  const [state, action, pending] = useActionState(saveAssessment, null);
  const parts: { key: keyof Assessment; label: string; hint: string }[] = [
    { key: "purpose", label: "1. Why we need the data (the purpose test)", hint: "What is the business reason? Who benefits? Would it matter if we could not do it?" },
    { key: "necessity", label: "2. Why it is necessary (the necessity test)", hint: "Does holding business contact details actually help? Is there a less intrusive way? Do we collect only what is needed?" },
    { key: "balance", label: "3. How we balance it against people's rights (the balancing test)", hint: "Would people at businesses reasonably expect this? Could it cause them harm or upset? Are any of them vulnerable?" },
    { key: "safeguards", label: "Safeguards we use", hint: "For example: business details only, privacy notice at first contact, opt out in every email, do not call checks, limited keeping periods, access by role." },
    { key: "outcome", label: "Conclusion", hint: "Can we rely on legitimate interests? When will this be reviewed?" },
  ];
  return (
    <form action={action} className="grid gap-4">
      {parts.map((p) => (
        <div key={p.key}>
          <label htmlFor={`lia-${p.key}`} className="label">{p.label}</label>
          <p className="mb-1 text-xs text-fg-muted">{p.hint}</p>
          <textarea id={`lia-${p.key}`} name={p.key} rows={4} defaultValue={a[p.key]} className="field" />
        </div>
      ))}
      <div><Submit pending={pending} label="Save the assessment" /></div>
      <Result state={state} />
    </form>
  );
}

type Settings = { dataProtectionLeadId: string | null; retainContactsMonths: number; retainTranscriptsMonths: number; retainNewsMonths: number; icoFeeRenewalDate: string | null; dpiaReviewDate: string | null };

export function PrivacySettingsForm({ s, people, canEdit }: { s: Settings; people: Option[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(savePrivacySettings, null);
  return (
    <form action={action} className="grid gap-4">
      <fieldset disabled={!canEdit} className="grid gap-4">
        <div className="max-w-sm">
          <label htmlFor="ps-lead" className="label">Data protection lead</label>
          <select id="ps-lead" name="dataProtectionLeadId" defaultValue={s.dataProtectionLeadId ?? ""} className="field">
            <option value="">Nobody named yet</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-fg-muted">They can use the privacy centre even if they are not an admin.</p>
        </div>
        <fieldset className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">How long to keep data (months)</legend>
          <div>
            <label htmlFor="ps-contacts" className="label">Contacts with no activity</label>
            <input id="ps-contacts" name="retainContactsMonths" type="number" min={1} max={120} defaultValue={s.retainContactsMonths} className="field" />
          </div>
          <div>
            <label htmlFor="ps-transcripts" className="label">Call transcripts</label>
            <input id="ps-transcripts" name="retainTranscriptsMonths" type="number" min={1} max={120} defaultValue={s.retainTranscriptsMonths} className="field" />
          </div>
          <div>
            <label htmlFor="ps-news" className="label">News items</label>
            <input id="ps-news" name="retainNewsMonths" type="number" min={1} max={120} defaultValue={s.retainNewsMonths} className="field" />
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ps-ico" className="label">ICO fee renewal date</label>
            <input id="ps-ico" name="icoFeeRenewalDate" type="date" defaultValue={s.icoFeeRenewalDate ?? ""} className="field" />
            <p className="mt-1 text-xs text-fg-muted">A reminder is emailed from 30 days before.</p>
          </div>
          <div>
            <label htmlFor="ps-dpia" className="label">Impact assessment review date</label>
            <input id="ps-dpia" name="dpiaReviewDate" type="date" defaultValue={s.dpiaReviewDate ?? ""} className="field" />
          </div>
        </div>
        {canEdit ? <div><Submit pending={pending} label="Save" /></div> : <p className="text-xs text-fg-muted">Only admins can change these.</p>}
      </fieldset>
      <Result state={state} />
    </form>
  );
}

type Item = { kind: string; id: string; label: string; reason: string };

export function RetentionReviewForm({ id, items, canApprove }: { id: string; items: Item[]; canApprove: boolean }) {
  const [state, action, pending] = useActionState(approveRetention, null);
  const groups = [
    { kind: "CONTACT", title: "Contacts" },
    { kind: "TRANSCRIPT", title: "Call transcripts" },
    { kind: "NEWS", title: "News items" },
  ];
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      {groups.map((g) => {
        const list = items.filter((i) => i.kind === g.kind);
        if (!list.length) return null;
        return (
          <details key={g.kind} className="rounded-md border border-line" open={g.kind === "CONTACT"}>
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">{g.title}: {list.length}</summary>
            <ul className="max-h-72 divide-y divide-line overflow-auto border-t border-line text-sm">
              {list.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-4 py-2">
                  <input type="checkbox" name="keep" value={i.id} id={`keep-${i.id}`} className="mt-1" disabled={!canApprove} />
                  <label htmlFor={`keep-${i.id}`} className="min-w-0">
                    <span className="block truncate">{i.label}</span>
                    <span className="block text-xs text-fg-muted">{i.reason}</span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      {canApprove ? (
        <>
          <p className="text-xs text-fg-muted">Tick anything that must be kept. Everything else is deleted when you approve. Each record is checked again first, so anything used since the list was made is kept. Opted out people stay on the do not contact list.</p>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required /> I understand the rest will be permanently deleted</label>
          <div><Submit pending={pending} label="Approve and delete" busy="Deleting" /></div>
        </>
      ) : <p className="text-xs text-fg-muted">Only admins can approve deletion.</p>}
      <Result state={state} />
    </form>
  );
}
