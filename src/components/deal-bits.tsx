// Small pieces used on deal cards, the deal list and the deal page.
import clsx from "clsx";
import type { HealthFlag as Flag } from "@/generated/prisma/enums";
import { healthFlagLabels } from "@/lib/labels";

const flagStyles: Record<Flag, { dot: string; text: string; shape: string }> = {
  ON_TRACK: { dot: "bg-green-text", text: "text-green-text", shape: "rounded-full" },
  AT_RISK: { dot: "bg-amber", text: "text-amber-text", shape: "rotate-45 rounded-[1px]" },
  STALLED: { dot: "bg-red-text", text: "text-red-text", shape: "rounded-[1px]" },
};

/** Health flag with a shape as well as a colour (circle, diamond, square), and always the word. */
export function HealthFlag({ flag, score, size = "sm" }: { flag: Flag | null; score?: number | null; size?: "sm" | "md" }) {
  if (!flag) return <span className="text-xs text-fg-muted">Closed</span>;
  const s = flagStyles[flag];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 font-medium", s.text, size === "md" ? "text-sm" : "text-xs")}>
      <span aria-hidden="true" className={clsx("inline-block", s.dot, s.shape, size === "md" ? "size-2.5" : "size-2")} />
      {healthFlagLabels[flag]}
      {score !== undefined && score !== null ? <span className="font-normal text-fg-muted">{score}</span> : null}
    </span>
  );
}

/** Qualification completeness as a thin bar and a percentage. */
export function QualificationMeter({ pct, wide = false }: { pct: number; wide?: boolean }) {
  const tone = pct >= 75 ? "bg-green-text" : pct >= 40 ? "bg-amber" : "bg-red-text";
  return (
    <span className="inline-flex items-center gap-2" title={`Qualification ${pct}% complete`}>
      <span className={clsx("h-1 overflow-hidden rounded-full bg-line", wide ? "w-40" : "w-12")} aria-hidden="true">
        <span className={clsx("block h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-fg-muted">
        <span className="sr-only">Qualification </span>
        {pct}%
      </span>
    </span>
  );
}

export function initials(name: string | null | undefined) {
  return (name ?? "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
