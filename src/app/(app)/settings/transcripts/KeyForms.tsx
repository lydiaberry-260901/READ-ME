"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { createKeyAction, removeKeyAction } from "../../transcripts/actions";

export function CreateKeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, action, pending] = useActionState(createKeyAction, null);
  return (
    <form action={action} className="grid gap-3">
      <div>
        <button type="submit" className="btn btn-primary py-1.5" disabled={pending}>
          {pending ? "Creating" : hasKey ? "Replace the key" : "Create a key"}
        </button>
      </div>
      {hasKey ? <p className="text-xs text-fg-muted">Replacing the key stops the old one working straight away, so update the recording tool at the same time.</p> : null}
      {state ? (
        <Notice tone={state.ok ? "green" : "red"} title={state.ok ? "Your new key" : undefined}>
          <p>{state.message}</p>
          {"key" in state && state.key ? <code className="mt-2 block break-all rounded border border-line bg-canvas-deep px-3 py-2 font-mono text-sm text-fg">{state.key}</code> : null}
        </Notice>
      ) : null}
    </form>
  );
}

export function RemoveKeyForm() {
  return (
    <form action={removeKeyAction} className="grid gap-2 text-sm">
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" name="confirm" value="yes" required /> Stop accepting calls from recording tools
      </label>
      <div><button type="submit" className="btn border border-red/40 bg-transparent py-1.5 text-red-text hover:bg-red-tint">Remove the key</button></div>
    </form>
  );
}
