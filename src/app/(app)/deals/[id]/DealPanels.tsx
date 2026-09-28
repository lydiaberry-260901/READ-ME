"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StageKind } from "@/generated/prisma/enums";
import { QUALIFICATION_FIELDS } from "@/lib/qualification";
import { Notice } from "@/components/ui";
import { QualificationMeter } from "@/components/deal-bits";
import { CloseDialog, type BoardDeal, type BoardStage } from "../DealBoard";
import { addNote, moveDealAction, saveQualification, saveStakeholder, updateDealBasics } from "../actions";

function Result({ state }: { state: { ok: boolean; message: string } | null }) {
  return state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null;
}

/** Move the deal to another stage without dragging. Won and Lost ask for the closing details. */
export function StageMover({ deal, stages, disabled }: { deal: BoardDeal; stages: BoardStage[]; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<{ deal: BoardDeal; stage: BoardStage } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, start] = useTransition();

  function go(stage: BoardStage, close = {}) {
    start(async () => {
      const r = await moveDealAction({ dealId: deal.id, stageId: stage.id, ...close });
      setMessage(r.ok ? null : r);
      router.refresh();
    });
  }

  return (
    <div>
      <label htmlFor="move-stage" className="text-xs text-fg-muted">Stage</label>
      <select
        id="move-stage"
        value={deal.stageId}
        disabled={disabled || busy}
        onChange={(e) => {
          const stage = stages.find((s) => s.id === e.target.value)!;
          if (stage.kind === "OPEN") go(stage);
          else setPending({ deal, stage });
        }}
        className="field mt-1 w-56 py-1.5"
      >
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {message ? <div className="mt-2"><Result state={message} /></div> : null}
      {pending ? (
        <CloseDialog
          pending={pending}
          onCancel={() => setPending(null)}
          onConfirm={(close) => {
            go(pending.stage, close);
            setPending(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function QualificationForm({ dealId, values, pct, disabled }: { dealId: string; values: Record<string, string | null>; pct: number; disabled: boolean }) {
  const [state, action, pending] = useActionState(saveQualification, null);
  const [filled, setFilled] = useState(() => Object.fromEntries(QUALIFICATION_FIELDS.map((f) => [f.key, Boolean(values[f.key]?.trim())])));
  const livePct = Math.round((Object.values(filled).filter(Boolean).length / QUALIFICATION_FIELDS.length) * 100);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={dealId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Fill these in as you learn them. There is no need to do them all at once.</p>
        <QualificationMeter pct={disabled ? pct : livePct} wide />
      </div>
      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
        {QUALIFICATION_FIELDS.map((f) => (
          <div key={f.key} className="bg-panel p-3">
            <label htmlFor={`q-${f.key}`} className="flex items-center justify-between gap-2 text-sm font-medium">
              {f.label}
              <span className={filled[f.key] ? "text-xs text-green-text" : "text-xs text-fg-soft"}>{filled[f.key] ? "Known" : "Not known yet"}</span>
            </label>
            <p className="text-xs text-fg-muted">{f.help}</p>
            <textarea
              id={`q-${f.key}`}
              name={f.key}
              defaultValue={values[f.key] ?? ""}
              disabled={disabled}
              rows={2}
              maxLength={2000}
              onChange={(e) => setFilled((m) => ({ ...m, [f.key]: e.target.value.trim().length > 0 }))}
              className="field mt-2 resize-y"
            />
          </div>
        ))}
      </div>
      {!disabled ? (
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save qualification"}</button>
        </div>
      ) : null}
      <Result state={state} />
    </form>
  );
}

const roles = [["", "No role yet"], ["CHAMPION", "Champion"], ["ECONOMIC_BUYER", "Economic buyer"], ["BLOCKER", "Blocker"], ["INFLUENCER", "Influencer"], ["USER", "User"]] as const;

export function StakeholderRow({ dealId, contactId, role, engaged, disabled }: { dealId: string; contactId: string; role: string | null; engaged: boolean; disabled: boolean }) {
  const [state, action, pending] = useActionState(saveStakeholder, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="contactId" value={contactId} />
      <label className="sr-only" htmlFor={`role-${contactId}`}>Role</label>
      <select id={`role-${contactId}`} name="role" defaultValue={role ?? ""} disabled={disabled} className="field w-auto py-1 text-xs">
        {roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <label className="sr-only" htmlFor={`eng-${contactId}`}>Engaged</label>
      <select id={`eng-${contactId}`} name="engaged" defaultValue={String(engaged)} disabled={disabled} className="field w-auto py-1 text-xs">
        <option value="true">Engaged</option>
        <option value="false">Not engaged</option>
      </select>
      {!disabled ? <button type="submit" className="btn btn-secondary px-2.5 py-1 text-xs" disabled={pending}>Save</button> : null}
      {state && !state.ok ? <span className="text-xs text-red-text">{state.message}</span> : null}
    </form>
  );
}

export function AddStakeholder({ dealId, contacts }: { dealId: string; contacts: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveStakeholder, null);
  if (contacts.length === 0) return <p className="text-xs text-fg-muted">Everyone at this company is already on the deal. Add more contacts on the company page.</p>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="engaged" value="true" />
      <div>
        <label htmlFor="add-contact" className="text-xs text-fg-muted">Add someone from the company</label>
        <select id="add-contact" name="contactId" defaultValue="" required className="field mt-1 w-56 py-1.5">
          <option value="" disabled>Choose a contact</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="add-role" className="text-xs text-fg-muted">Role</label>
        <select id="add-role" name="role" defaultValue="" className="field mt-1 w-40 py-1.5">
          {roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>Add</button>
      {state && !state.ok ? <span className="text-xs text-red-text">{state.message}</span> : null}
    </form>
  );
}

export function NoteForm({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState(addNote, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <label htmlFor="note-body" className="label">Add a note</label>
      <p id="note-warning" className="text-xs text-amber-text">
        Only record business information. Do not record personal opinions or sensitive details such as health, politics, religion, or anything about family.
      </p>
      <textarea id="note-body" name="body" rows={3} maxLength={4000} required aria-describedby="note-warning" className="field" />
      <div><button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? "Adding" : "Add note"}</button></div>
      <Result state={state} />
    </form>
  );
}

export function DealBasicsForm({
  deal,
  owners,
  disabled,
  canReassign,
}: {
  deal: { id: string; name: string; value: number; expectedCloseDate: string; customerGroup: string | null; nextStep: string | null; competitor: string | null; ownerId: string; isShared: boolean };
  owners: { id: string; name: string }[];
  disabled: boolean;
  canReassign: boolean;
}) {
  const [state, action, pending] = useActionState(updateDealBasics, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={deal.id} />
      <fieldset disabled={disabled} className="grid gap-4">
        <div>
          <label htmlFor="b-name" className="label">Deal name</label>
          <input id="b-name" name="name" defaultValue={deal.name} required className="field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="b-value" className="label">Value (£)</label>
            <input id="b-value" name="value" type="number" min={0} defaultValue={deal.value} className="field" />
          </div>
          <div>
            <label htmlFor="b-close" className="label">Expected close</label>
            <input id="b-close" name="expectedCloseDate" type="date" defaultValue={deal.expectedCloseDate} className="field" />
          </div>
        </div>
        <div>
          <label htmlFor="b-next" className="label">Next step</label>
          <input id="b-next" name="nextStep" defaultValue={deal.nextStep ?? ""} maxLength={300} className="field" />
        </div>
        <div>
          <label htmlFor="b-comp" className="label">Competitor mentioned by the prospect</label>
          <input id="b-comp" name="competitor" defaultValue={deal.competitor ?? ""} maxLength={120} placeholder="For example: Traditional energy consultant" className="field" />
          <p className="mt-1 text-xs text-fg-muted">If it matches a battlecard, the battlecard appears on this page.</p>
        </div>
        <div>
          <label htmlFor="b-group" className="label">Customer group</label>
          <select id="b-group" name="customerGroup" defaultValue={deal.customerGroup ?? ""} className="field">
            <option value="">Not set</option>
            <option value="ASSET_ESG">Asset and ESG</option>
            <option value="PROPERTY_MANAGER">Property manager</option>
            <option value="OCCUPIER">Occupier</option>
          </select>
        </div>
        <div>
          <label htmlFor="b-owner" className="label">Owner</label>
          <select id="b-owner" name="ownerId" defaultValue={deal.ownerId} disabled={!canReassign} className="field">
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {!canReassign ? <input type="hidden" name="ownerId" value={deal.ownerId} /> : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isShared" defaultChecked={deal.isShared} className="size-4 accent-green" />
          Shared with everyone
        </label>
      </fieldset>
      {!disabled ? <div><button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? "Saving" : "Save details"}</button></div> : null}
      <Result state={state} />
    </form>
  );
}
