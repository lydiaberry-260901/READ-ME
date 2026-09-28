"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { HealthFlag as Flag, StageKind } from "@/generated/prisma/enums";
import { HealthFlag, QualificationMeter, initials } from "@/components/deal-bits";
import { AnimatedNumber } from "@/components/motion";
import { Notice } from "@/components/ui";
import { moveDealAction } from "./actions";

export type BoardStage = { id: string; name: string; colour: string; kind: StageKind };
export type BoardDeal = {
  id: string;
  name: string;
  companyName: string;
  value: number;
  ownerName: string | null;
  stageId: string;
  expectedClose: string | null; // already formatted
  daysInStage: number;
  nextStep: string | null;
  healthFlag: Flag | null;
  healthScore: number | null;
  qualificationPct: number;
  canMove: boolean;
};

const lossReasons = [
  ["BUDGET", "Budget"], ["TIMING", "Timing"], ["NO_DECISION", "No decision"], ["LOST_TO_COMPETITOR", "Lost to competitor"],
  ["NO_ECONOMIC_BUYER", "No economic buyer"], ["PRODUCT_FIT", "Product fit"], ["OTHER", "Other"],
] as const;

const pounds = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);

function Card({ deal, dragging = false }: { deal: BoardDeal; dragging?: boolean }) {
  return (
    <div className={clsx("rounded-md border bg-panel p-3 text-sm", dragging ? "border-green-text shadow-2xl" : "border-line hover:border-line-strong")}>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-xs text-fg-muted">{deal.companyName}</p>
        <span className="shrink-0 font-semibold tabular-nums">{pounds(deal.value)}</span>
      </div>
      <Link href={`/deals/${deal.id}`} className="mt-0.5 block font-medium leading-snug text-fg no-underline hover:underline" draggable={false}>
        {deal.name}
      </Link>
      {deal.nextStep ? <p className="mt-1.5 line-clamp-2 text-xs text-fg-muted">Next: {deal.nextStep}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <HealthFlag flag={deal.healthFlag} />
        <QualificationMeter pct={deal.qualificationPct} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs text-fg-muted">
        <span title={deal.ownerName ?? "No owner"} className="grid size-5 place-items-center rounded-full bg-panel-raised text-[10px] font-semibold text-fg">
          {initials(deal.ownerName)}
        </span>
        <span>{deal.daysInStage} {deal.daysInStage === 1 ? "day" : "days"} here</span>
        <span>{deal.expectedClose ? `Close ${deal.expectedClose}` : "No close date"}</span>
      </div>
    </div>
  );
}

function DraggableCard({ deal }: { deal: BoardDeal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, disabled: !deal.canMove });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-roledescription="Draggable deal"
      aria-label={`${deal.name}, ${deal.companyName}, ${pounds(deal.value)}. ${deal.canMove ? "Press space to pick up." : "You cannot move this deal."}`}
      className={clsx("touch-none", isDragging && "opacity-30", deal.canMove ? "cursor-grab active:cursor-grabbing" : "cursor-default")}
    >
      <Card deal={deal} />
    </div>
  );
}

function Column({ stage, deals }: { stage: BoardStage; deals: BoardDeal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + d.value, 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name}: ${deals.length} deals`}
      className={clsx("flex w-72 shrink-0 flex-col rounded-lg border bg-panel-sunk transition-colors", isOver ? "border-green-text bg-green-tint/40" : "border-line")}
    >
      <header className="border-b border-line px-3 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-1 rounded-full" style={{ background: stage.colour }} />
          <h2 className="text-sm font-semibold">{stage.name}</h2>
          <span className="ml-auto text-xs tabular-nums text-fg-muted">{deals.length}</span>
        </div>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          <AnimatedNumber value={total} format="pounds" />
        </p>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
        {deals.map((d) => <DraggableCard key={d.id} deal={d} />)}
        {deals.length === 0 ? <p className="px-2 py-6 text-center text-xs text-fg-soft">Drop a deal here</p> : null}
      </div>
    </section>
  );
}

type Pending = { deal: BoardDeal; stage: BoardStage };

export function DealBoard({ stages, deals: initial }: { stages: BoardStage[]; deals: BoardDeal[] }) {
  const [deals, setDeals] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const byStage = useMemo(() => {
    const map = new Map<string, BoardDeal[]>(stages.map((s) => [s.id, []]));
    for (const d of deals) map.get(d.stageId)?.push(d);
    return map;
  }, [deals, stages]);
  const active = deals.find((d) => d.id === activeId) ?? null;

  function move(deal: BoardDeal, stage: BoardStage, close: { lossReason?: string; closeNote?: string; finalValue?: number } = {}) {
    const before = deals;
    setError(null);
    setDeals((all) => all.map((d) => (d.id === deal.id ? { ...d, stageId: stage.id, daysInStage: 0, value: close.finalValue ?? d.value, healthFlag: stage.kind === "OPEN" ? d.healthFlag : null } : d)));
    startTransition(async () => {
      const result = await moveDealAction({ dealId: deal.id, stageId: stage.id, ...close });
      if (!result.ok) {
        setDeals(before);
        setError(result.message);
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const deal = deals.find((d) => d.id === e.active.id);
    const stage = stages.find((s) => s.id === e.over?.id);
    if (!deal || !stage || deal.stageId === stage.id) return;
    if (stage.kind === "OPEN") move(deal, stage);
    else setPending({ deal, stage });
  }

  return (
    <>
      {error ? <div className="mb-4"><Notice tone="red">{error}</Notice></div> : null}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          screenReaderInstructions: { draggable: "To pick up a deal, press space. Use the arrow keys to move it between stages, then press space again to drop it, or escape to cancel." },
        }}
      >
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {stages.map((s) => <Column key={s.id} stage={s} deals={byStage.get(s.id) ?? []} />)}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {active ? <div className="w-72 rotate-1"><Card deal={active} dragging /></div> : null}
        </DragOverlay>
      </DndContext>

      {pending ? (
        <CloseDialog
          pending={pending}
          onCancel={() => setPending(null)}
          onConfirm={(close) => {
            move(pending.deal, pending.stage, close);
            setPending(null);
          }}
        />
      ) : null}
    </>
  );
}

export function CloseDialog({ pending, onCancel, onConfirm }: { pending: Pending; onCancel: () => void; onConfirm: (c: { lossReason?: string; closeNote?: string; finalValue?: number }) => void }) {
  const won = pending.stage.kind === "WON";
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [value, setValue] = useState(String(pending.deal.value));
  const valid = won ? value.trim() !== "" && Number(value) >= 0 && note.trim().length >= 3 : reason !== "" && note.trim().length >= 3;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-title"
        className="w-full max-w-md rounded-lg border border-line-strong bg-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onConfirm(won ? { finalValue: Math.round(Number(value)), closeNote: note } : { lossReason: reason, closeNote: note });
        }}
      >
        <h2 id="close-title" className="text-lg font-semibold">{won ? "Close as won" : "Close as lost"}: {pending.deal.name}</h2>
        <p className="mt-1 text-sm text-fg-muted">{pending.deal.companyName}</p>
        <div className="mt-5 grid gap-4">
          {won ? (
            <div>
              <label htmlFor="close-value" className="label">Final value (£)</label>
              <input id="close-value" type="number" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} className="field" required autoFocus />
            </div>
          ) : (
            <div>
              <label htmlFor="close-reason" className="label">Why was it lost?</label>
              <select id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="field" required autoFocus>
                <option value="" disabled>Choose a reason</option>
                {lossReasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="close-note" className="label">{won ? "Why did we win?" : "What happened?"} (a short note)</label>
            <textarea id="close-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="field" required />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className={won ? "btn btn-primary" : "btn btn-danger"} disabled={!valid}>{won ? "Close as won" : "Close as lost"}</button>
        </div>
      </form>
    </div>
  );
}
