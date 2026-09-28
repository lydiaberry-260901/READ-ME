"use client";

import { useActionState, useState } from "react";
import { saveView } from "@/app/(app)/views/actions";

export function SaveViewForm({ entity, query }: { entity: "companies" | "contacts"; query: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveView, null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-dashed border-line-strong px-3 py-1 text-fg hover:bg-panel">
        Save these filters
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="query" value={query} />
      <label htmlFor="view-name" className="sr-only">View name</label>
      <input id="view-name" name="name" required maxLength={60} placeholder="Name this view" className="field w-44 py-1" />
      <label className="inline-flex items-center gap-1.5">
        <input type="checkbox" name="isShared" className="size-4 accent-green" /> Share with the team
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary py-1">Save</button>
      {state ? <span role="status" className={state.ok ? "text-green-text" : "text-red-text"}>{state.message}</span> : null}
    </form>
  );
}
