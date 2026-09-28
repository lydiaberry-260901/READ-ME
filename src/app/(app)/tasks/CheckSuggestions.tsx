"use client";

import { useActionState } from "react";
import { checkForSuggestions } from "./actions";

export function CheckSuggestions() {
  const [state, action, pending] = useActionState(checkForSuggestions, null);
  return (
    <form action={action} className="flex items-center gap-3">
      <button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? "Checking" : "Check for new suggestions"}</button>
      {state ? <span role="status" className={`text-sm ${state.ok ? "text-green-text" : "text-red-text"}`}>{state.message}</span> : null}
    </form>
  );
}
