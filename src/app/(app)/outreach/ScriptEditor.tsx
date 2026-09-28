"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "@/components/ui";

type Objection = { objection: string; response: string };

export type ScriptFields = {
  opening: string;
  questions: string[];
  objections: Objection[];
  ask: string;
};

/** Editable call script parts. Used for the library and for drafts, so both look the same. */
export function ScriptFieldsEditor({ initial, disabled }: { initial: ScriptFields; disabled?: boolean }) {
  const [questions, setQuestions] = useState(initial.questions.length ? initial.questions : [""]);
  const [objections, setObjections] = useState<Objection[]>(initial.objections.length ? initial.objections : [{ objection: "", response: "" }]);

  return (
    <fieldset disabled={disabled} className="grid gap-6">
      <div>
        <label htmlFor="s-opening" className="label">Opening line</label>
        <textarea id="s-opening" name="opening" defaultValue={initial.opening} rows={3} required className="field leading-relaxed" />
      </div>
      <div>
        <p className="label">Questions to ask</p>
        <ol className="grid gap-2">
          {questions.map((q, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-sm text-fg-muted">{i + 1}.</span>
              <label htmlFor={`s-q-${i}`} className="sr-only">Question {i + 1}</label>
              <input id={`s-q-${i}`} name="question" value={q} onChange={(e) => setQuestions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} className="field" />
              {!disabled && questions.length > 1 ? (
                <button type="button" onClick={() => setQuestions((all) => all.filter((_, j) => j !== i))} className="mt-2 text-sm text-red-text" aria-label={`Remove question ${i + 1}`}>Remove</button>
              ) : null}
            </li>
          ))}
        </ol>
        {!disabled && questions.length < 6 ? (
          <button type="button" onClick={() => setQuestions((all) => [...all, ""])} className="mt-2 text-sm font-medium text-green-text">Add a question</button>
        ) : null}
      </div>
      <div>
        <p className="label">Likely objections and suggested replies</p>
        <div className="grid gap-3">
          {objections.map((o, i) => (
            <div key={i} className="grid gap-2 border-l-2 border-amber pl-3">
              <label htmlFor={`s-o-${i}`} className="sr-only">Objection {i + 1}</label>
              <input id={`s-o-${i}`} name="objection" placeholder="What they might say" value={o.objection} onChange={(e) => setObjections((all) => all.map((x, j) => (j === i ? { ...x, objection: e.target.value } : x)))} className="field" />
              <label htmlFor={`s-r-${i}`} className="sr-only">Reply {i + 1}</label>
              <textarea id={`s-r-${i}`} name="response" placeholder="How to reply" rows={2} value={o.response} onChange={(e) => setObjections((all) => all.map((x, j) => (j === i ? { ...x, response: e.target.value } : x)))} className="field" />
              {!disabled && objections.length > 1 ? (
                <button type="button" onClick={() => setObjections((all) => all.filter((_, j) => j !== i))} className="justify-self-start text-sm text-red-text">Remove this objection</button>
              ) : null}
            </div>
          ))}
        </div>
        {!disabled && objections.length < 6 ? (
          <button type="button" onClick={() => setObjections((all) => [...all, { objection: "", response: "" }])} className="mt-2 text-sm font-medium text-green-text">Add an objection</button>
        ) : null}
      </div>
      <div>
        <label htmlFor="s-ask" className="label">The clear request at the end</label>
        <textarea id="s-ask" name="ask" defaultValue={initial.ask} rows={2} required className="field" />
      </div>
    </fieldset>
  );
}

const reasons = [
  ["EPC_RISK", "EPC risk"], ["NET_ZERO", "Net zero targets"], ["NEW_ESG_HIRE", "New ESG hire"],
  ["TENDER", "Tender"], ["ACQUISITION", "Acquisition"], ["GENERAL_INTRO", "General introduction"],
];

export function ScriptEditor({
  script,
  canEdit,
  action,
}: {
  script: ScriptFields & { id?: string; name: string; customerGroup: string | null; reason: string; active: boolean };
  canEdit: boolean;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid max-w-3xl gap-6">
      {script.id ? <input type="hidden" name="id" value={script.id} /> : null}
      <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="s-name" className="label">Script name</label>
          <input id="s-name" name="name" defaultValue={script.name} required maxLength={120} className="field" />
        </div>
        <div>
          <label htmlFor="s-group" className="label">Customer group</label>
          <select id="s-group" name="customerGroup" defaultValue={script.customerGroup ?? ""} className="field">
            <option value="">Any group</option>
            <option value="ASSET_ESG">Asset and ESG</option>
            <option value="PROPERTY_MANAGER">Property manager</option>
            <option value="OCCUPIER">Occupier</option>
          </select>
        </div>
        <div>
          <label htmlFor="s-reason" className="label">Reason for the call</label>
          <select id="s-reason" name="reason" defaultValue={script.reason} className="field">
            {reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={script.active} className="size-4 accent-green" />
          In use
        </label>
      </fieldset>
      <p className="text-sm text-fg-muted">You can use merge fields such as {"{{contact.firstName}}"}, {"{{company.name}}"} and {"{{sender.name}}"}.</p>
      <ScriptFieldsEditor initial={script} disabled={!canEdit} />
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : script.id ? "Save script" : "Create script"}</button>
          <Link href="/outreach" className="text-sm">Back to the library</Link>
        </div>
      ) : null}
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}
