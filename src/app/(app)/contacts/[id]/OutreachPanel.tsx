"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { startDraft } from "@/app/(app)/outreach/actions";

type Item = { id: string; label: string; suggested: boolean };

/** Start an email or call script for this contact, from a template, with or without AI help. */
export function OutreachPanel({
  contactId,
  templates,
  scripts,
  emailBlocked,
  callBlocked,
  aiReady,
}: {
  contactId: string;
  templates: Item[];
  scripts: Item[];
  emailBlocked: string | null;
  callBlocked: string | null;
  aiReady: boolean;
}) {
  const [kind, setKind] = useState<"email" | "script">("email");
  const [state, action, pending] = useActionState(startDraft, null);
  const items = kind === "email" ? templates : scripts;
  const blockedReason = kind === "email" ? emailBlocked : callBlocked;
  const suggested = items.filter((i) => i.suggested);
  const others = items.filter((i) => !i.suggested);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="kind" value={kind} />
      <div role="tablist" aria-label="What to prepare" className="inline-flex w-fit rounded-md border border-stone p-0.5 text-sm">
        {(["email", "script"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded px-3 py-1.5 font-medium ${kind === k ? "bg-ink text-cream" : "text-ink hover:bg-surface-sunk"}`}>
            {k === "email" ? "Email" : "Call script"}
          </button>
        ))}
      </div>
      {blockedReason ? (
        <Notice tone="red" title={kind === "email" ? "Emails are blocked" : "Calls are blocked"}>{blockedReason}</Notice>
      ) : (
        <>
          <div>
            <label htmlFor="o-item" className="label">{kind === "email" ? "Template" : "Script"}</label>
            <select id="o-item" name="itemId" key={kind} defaultValue={suggested[0]?.id ?? ""} className="field" required>
              <option value="" disabled>Choose one</option>
              {suggested.length ? (
                <optgroup label="For this customer group">{suggested.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>
              ) : null}
              {others.length ? (
                <optgroup label="Others">{others.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>
              ) : null}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="mode" value="plain" className="btn btn-secondary" disabled={pending}>Use template as it is</button>
            <button type="submit" name="mode" value="ai" className="btn btn-primary" disabled={pending || !aiReady} title={aiReady ? undefined : "AI is not set up yet"}>
              {pending ? "Preparing the draft" : "Draft with AI"}
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Either way you get a draft to read and edit. The AI sees the company's details and this person's job title, not their name or contact details.
          </p>
        </>
      )}
      {state && !state.ok ? <Notice tone="red">{state.message}</Notice> : null}
    </form>
  );
}
