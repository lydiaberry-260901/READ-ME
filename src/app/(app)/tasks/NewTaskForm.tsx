"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Notice } from "@/components/ui";
import { createTask } from "./actions";

export function NewTaskForm({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createTask, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (!open) {
    return <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Add a task</button>;
  }
  return (
    <form ref={formRef} action={action} className="grid gap-4 rounded-lg border border-line bg-panel p-5 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
      <div>
        <label htmlFor="t-title" className="label">What needs doing</label>
        <input id="t-title" name="title" required maxLength={200} className="field" autoFocus />
      </div>
      <div>
        <label htmlFor="t-type" className="label">Type</label>
        <select id="t-type" name="type" defaultValue="FOLLOW_UP" className="field">
          <option value="CALL">Call</option>
          <option value="EMAIL">Email</option>
          <option value="FOLLOW_UP">Follow up</option>
          <option value="RESEARCH">Research</option>
          <option value="MEETING">Meeting</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="t-priority" className="label">Priority</label>
        <select id="t-priority" name="priority" defaultValue="MEDIUM" className="field">
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>
      <div>
        <label htmlFor="t-date" className="label">Due</label>
        <input id="t-date" name="dueDate" type="date" defaultValue={today} required className="field" />
      </div>
      <div>
        <label htmlFor="t-time" className="label">Time</label>
        <input id="t-time" name="dueTime" type="time" defaultValue="17:00" className="field" />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Adding" : "Add"}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
      </div>
      {state ? <div className="lg:col-span-6"><Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice></div> : null}
    </form>
  );
}
