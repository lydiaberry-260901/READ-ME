"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { saveBattlecard } from "./actions";

type Objection = { objection: string; response: string };

export function BattlecardForm({ card }: { card: { id?: string; competitorName: string; comparison: string; objections: Objection[] } }) {
  const [state, action, pending] = useActionState(saveBattlecard, null);
  const [rows, setRows] = useState<Objection[]>(card.objections.length ? card.objections : [{ objection: "", response: "" }]);
  return (
    <form action={action} className="grid max-w-3xl gap-5">
      {card.id ? <input type="hidden" name="id" value={card.id} /> : null}
      <div>
        <label htmlFor="bc-name" className="label">Competitor</label>
        <input id="bc-name" name="competitorName" defaultValue={card.competitorName} required maxLength={120} className="field" />
        <p className="mt-1 text-xs text-fg-muted">Use the same name reps type into a deal's competitor field, so the card appears there.</p>
      </div>
      <div>
        <label htmlFor="bc-comp" className="label">Short comparison</label>
        <textarea id="bc-comp" name="comparison" defaultValue={card.comparison} rows={4} required className="field leading-relaxed" />
        <p className="mt-1 text-xs text-fg-muted">Only claims we can back up. Be fair to the competitor.</p>
      </div>
      <div>
        <p className="label">Common objections and suggested responses</p>
        <div className="grid gap-3">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 border-l-2 border-amber pl-3">
              <label className="sr-only" htmlFor={`bc-o-${i}`}>Objection {i + 1}</label>
              <input id={`bc-o-${i}`} name="objection" placeholder="What the prospect says" value={r.objection} onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, objection: e.target.value } : x)))} className="field" />
              <label className="sr-only" htmlFor={`bc-r-${i}`}>Response {i + 1}</label>
              <textarea id={`bc-r-${i}`} name="response" placeholder="How to respond" rows={2} value={r.response} onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, response: e.target.value } : x)))} className="field" />
              {rows.length > 1 ? <button type="button" className="justify-self-start text-sm text-red-text" onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>Remove</button> : null}
            </div>
          ))}
        </div>
        <button type="button" className="mt-2 text-sm font-medium text-green-text" onClick={() => setRows((all) => [...all, { objection: "", response: "" }])}>Add an objection</button>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : card.id ? "Save battlecard" : "Create battlecard"}</button></div>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}
