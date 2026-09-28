"use client";

// Bulk actions for list pages. Row checkboxes elsewhere on the page join this form
// through their form="..." attribute, so the table itself can stay a server component.
import { useActionState, useEffect, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

export type BulkOption = { value: string; label: string };
export type BulkAction = {
  value: string;
  label: string;
  // What extra choice the action needs, if any.
  input?: { kind: "select"; label: string; options: BulkOption[] } | { kind: "text"; label: string; placeholder?: string };
};

export function BulkBar({
  formId,
  actions,
  action,
  noun,
}: {
  formId: string;
  actions: BulkAction[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  noun: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [chosen, setChosen] = useState("");
  const [count, setCount] = useState(0);
  const current = actions.find((a) => a.value === chosen);

  // Keep the count of ticked rows up to date.
  useEffect(() => {
    const update = () => setCount(document.querySelectorAll(`input[name="ids"][form="${formId}"]:checked`).length);
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId, state]);

  return (
    <form id={formId} action={formAction} className="flex flex-wrap items-end gap-3 border-b border-line bg-panel-sunk px-6 py-3">
      <p className="self-center text-sm font-medium">
        {count === 0 ? `Tick ${noun} to act on several at once` : `${count} selected`}
      </p>
      <div>
        <label htmlFor={`${formId}-action`} className="sr-only">Action</label>
        <select
          id={`${formId}-action`}
          name="bulkAction"
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          className="field w-auto py-1.5"
          disabled={count === 0}
        >
          <option value="">Choose an action</option>
          {actions.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>
      {current?.input?.kind === "select" ? (
        <div>
          <label htmlFor={`${formId}-value`} className="sr-only">{current.input.label}</label>
          <select id={`${formId}-value`} name="value" className="field w-auto py-1.5" required>
            <option value="">{current.input.label}</option>
            {current.input.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ) : null}
      {current?.input?.kind === "text" ? (
        <div>
          <label htmlFor={`${formId}-value`} className="sr-only">{current.input.label}</label>
          <input id={`${formId}-value`} name="value" className="field w-56 py-1.5" required placeholder={current.input.placeholder ?? current.input.label} />
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary py-1.5" disabled={pending || count === 0 || !chosen}>
        {pending ? "Working" : "Apply"}
      </button>
      {state ? (
        <p role="status" className={`self-center text-sm ${state.ok ? "text-green-text" : "text-red-text"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Tick box in a table heading that ticks every row on the page. */
export function SelectAll({ formId, label }: { formId: string; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 accent-green"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]`).forEach((box) => {
          box.checked = e.currentTarget.checked;
        });
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}
