"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "@/components/ui";
import { generateSummaryNow, saveSummaryEdit, enrichNow, addCompanyTag } from "../actions";

function Message({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <div className="mt-3">
      <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice>
    </div>
  );
}

export function GenerateSummaryButton({ id, hasSummary, aiReady }: { id: string; hasSummary: boolean; aiReady: boolean }) {
  const [state, action, pending] = useActionState(generateSummaryNow, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={hasSummary ? "btn btn-secondary" : "btn btn-primary"} disabled={pending || !aiReady}>
        {pending ? "Writing, this can take up to a minute" : hasSummary ? "Regenerate" : "Write summary and score"}
      </button>
      {!aiReady ? <p className="mt-2 text-xs text-fg-muted">AI is not set up yet. An admin needs to add the ANTHROPIC_API_KEY setting.</p> : null}
      <Message state={state} />
    </form>
  );
}

export function EditSummary({ id, whyMatters, score, scoreReason }: { id: string; whyMatters: string; score: number | null; scoreReason: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveSummaryEdit, null);
  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }
  return (
    <form action={action} className="mt-4 grid w-full gap-4 rounded-md border border-line bg-panel-sunk p-4">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor="s-summary" className="label">Why this company matters to Moca (2 or 3 sentences)</label>
        <textarea id="s-summary" name="whyMatters" rows={4} maxLength={700} defaultValue={whyMatters} className="field" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div>
          <label htmlFor="s-score" className="label">Score</label>
          <select id="s-score" name="score" defaultValue={score ? String(score) : ""} className="field" required>
            <option value="" disabled>Choose</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="s-reason" className="label">One line reason</label>
          <input id="s-reason" name="scoreReason" maxLength={220} defaultValue={scoreReason} className="field" required />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save changes"}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function EnrichButton({ id, disabledReason }: { id: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState(enrichNow, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-secondary" disabled={pending || Boolean(disabledReason)}>
        {pending ? "Fetching" : "Fetch details"}
      </button>
      {disabledReason ? <p className="mt-2 text-xs text-fg-muted">{disabledReason}</p> : null}
      <Message state={state} />
    </form>
  );
}

export function AddTagForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(addCompanyTag, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="new-tag" className="sr-only">New tag</label>
      <input id="new-tag" name="name" maxLength={40} placeholder="Add a tag" className="field w-40 py-1" required />
      <button type="submit" className="btn btn-secondary py-1" disabled={pending}>Add</button>
      {state && !state.ok ? <span role="status" className="text-sm text-red-text">{state.message}</span> : null}
    </form>
  );
}
