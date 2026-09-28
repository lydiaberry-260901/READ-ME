"use client";

import { useActionState } from "react";
import { runNow } from "./actions";

export function RunNow({ queue }: { queue: string }) {
  const [state, action, pending] = useActionState(runNow, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="queue" value={queue} />
      <button type="submit" className="btn btn-secondary px-3 py-1 text-xs" disabled={pending}>{pending ? "Starting" : "Run now"}</button>
      {state ? <span role="status" className={`text-xs ${state.ok ? "text-green-text" : "text-red-text"}`}>{state.message}</span> : null}
    </form>
  );
}
