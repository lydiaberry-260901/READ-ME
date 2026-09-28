"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { addStage, archiveStage, updateStage } from "./actions";

type Stage = { id: string; name: string; colour: string; probability: number; noActivityDays: number; kind: string };

export function StageRow({ stage }: { stage: Stage }) {
  const [state, action, pending] = useActionState(updateStage, null);
  const [archState, archAction, archiving] = useActionState(archiveStage, null);
  return (
    <div className="grid gap-2">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={stage.id} />
        <div>
          <label htmlFor={`c-${stage.id}`} className="text-xs text-fg-muted">Colour</label>
          <input id={`c-${stage.id}`} name="colour" type="color" defaultValue={stage.colour} className="mt-1 block h-9 w-12 cursor-pointer rounded border border-line-strong bg-canvas-deep p-1" />
        </div>
        <div>
          <label htmlFor={`n-${stage.id}`} className="text-xs text-fg-muted">Name</label>
          <input id={`n-${stage.id}`} name="name" defaultValue={stage.name} required maxLength={40} className="field mt-1 w-44 py-1.5" />
        </div>
        <div>
          <label htmlFor={`p-${stage.id}`} className="text-xs text-fg-muted">Chance of winning (%)</label>
          <input id={`p-${stage.id}`} name="probability" type="number" min={0} max={100} defaultValue={stage.probability} className="field mt-1 w-28 py-1.5" />
        </div>
        <div>
          <label htmlFor={`a-${stage.id}`} className="text-xs text-fg-muted">Days without activity before a task</label>
          <input id={`a-${stage.id}`} name="noActivityDays" type="number" min={1} max={365} defaultValue={stage.noActivityDays} className="field mt-1 w-28 py-1.5" />
        </div>
        <button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>Save</button>
      </form>
      <form action={archAction}>
        <input type="hidden" name="id" value={stage.id} />
        <button type="submit" className="text-xs text-red-text hover:underline" disabled={archiving}>Remove this stage</button>
      </form>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
      {archState ? <Notice tone={archState.ok ? "green" : "red"}>{archState.message}</Notice> : null}
    </div>
  );
}

export function AddStageForm() {
  const [state, action, pending] = useActionState(addStage, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="new-colour" className="text-xs text-fg-muted">Colour</label>
        <input id="new-colour" name="colour" type="color" defaultValue="#A9A39C" className="mt-1 block h-9 w-12 cursor-pointer rounded border border-line-strong bg-canvas-deep p-1" />
      </div>
      <div>
        <label htmlFor="new-name" className="text-xs text-fg-muted">New stage name</label>
        <input id="new-name" name="name" required maxLength={40} className="field mt-1 w-56 py-1.5" />
      </div>
      <button type="submit" className="btn btn-primary py-1.5" disabled={pending}>Add stage</button>
      {state ? <div className="w-full"><Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice></div> : null}
    </form>
  );
}
