"use client";

import { useActionState } from "react";
import { buildListNow } from "./actions";

export function RunListNow() {
  const [state, action, pending] = useActionState(buildListNow, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <button type="submit" className="btn btn-secondary px-3 py-1 text-xs" disabled={pending}>{pending ? "Checking" : "Check now"}</button>
      {state ? <span role="status" className={`text-xs ${state.ok ? "text-green-text" : "text-red-text"}`}>{state.message}</span> : null}
    </form>
  );
}
