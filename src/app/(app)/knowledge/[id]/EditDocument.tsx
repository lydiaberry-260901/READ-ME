"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { updateDocument } from "../actions";

export function EditDocument({ doc }: { doc: { id: string; title: string; kind: string; description: string | null; useForAi: boolean; containsPersonalData: boolean } }) {
  const [state, action, pending] = useActionState(updateDocument, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={doc.id} />
      <div>
        <label htmlFor="k-title" className="label">Title</label>
        <input id="k-title" name="title" defaultValue={doc.title} required maxLength={200} className="field" />
      </div>
      <div>
        <label htmlFor="k-kind" className="label">Kind</label>
        <select id="k-kind" name="kind" defaultValue={doc.kind} className="field">
          <option value="COMPANY_CONTEXT">Company context</option>
          <option value="PRODUCT">Product and services</option>
          <option value="CASE_STUDY">Case study</option>
          <option value="TRANSCRIPT">Transcript</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="k-desc" className="label">Short description (optional)</label>
        <input id="k-desc" name="description" defaultValue={doc.description ?? ""} maxLength={500} className="field" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="useForAi" defaultChecked={doc.useForAi} className="mt-0.5 size-4 accent-green" />
        Let the AI use this document as background on Moca
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="containsPersonalData" defaultChecked={doc.containsPersonalData} className="mt-0.5 size-4 accent-green" />
        It contains personal details about people (kept away from the AI)
      </label>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save"}</button>
      </div>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}
