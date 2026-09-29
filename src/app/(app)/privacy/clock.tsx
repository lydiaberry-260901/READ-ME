"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

const HOUR = 3_600_000;

/**
 * The 72 hour clock for deciding whether to tell the ICO about a breach. Counts down live, and
 * shows the time as overdue once it has passed. Always written out, never colour alone.
 */
export function BreachClock({ discoveredAt, decided, size = "md" }: { discoveredAt: string; decided: boolean; size?: "sm" | "md" | "lg" }) {
  const deadline = new Date(discoveredAt).getTime() + 72 * HOUR;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (decided) return <span className="text-sm text-green-text">Decision recorded</span>;
  if (now === null) return <span className={clsx("tabular-nums text-fg-muted", size === "lg" ? "text-4xl font-semibold" : "text-sm")}>...</span>;

  const left = deadline - now;
  const abs = Math.abs(left);
  const h = Math.floor(abs / HOUR);
  const m = Math.floor((abs % HOUR) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const text = `${h}:${String(m).padStart(2, "0")}${size === "lg" ? `:${String(s).padStart(2, "0")}` : ""}`;
  const used = Math.min(1, Math.max(0, 1 - left / (72 * HOUR)));
  const tone = left < 0 ? "text-red-text" : left < 24 * HOUR ? "text-amber-text" : "text-fg";

  return (
    <span className="inline-grid gap-1.5" role="timer" aria-live="off" aria-label={left < 0 ? `72 hours passed ${h} hours ago` : `${h} hours ${m} minutes left to decide whether to tell the ICO`}>
      <span className={clsx("font-semibold tabular-nums", tone, size === "lg" ? "text-4xl" : size === "md" ? "text-xl" : "text-sm")}>
        {left < 0 ? `${text} over` : `${text} left`}
      </span>
      {size !== "sm" ? (
        <span className="block h-1.5 w-48 overflow-hidden rounded-full bg-panel-sunk" aria-hidden="true">
          <span className={clsx("block h-full rounded-full", left < 0 ? "bg-red-text" : left < 24 * HOUR ? "bg-amber" : "bg-green-text")} style={{ width: `${Math.round(used * 100)}%` }} />
        </span>
      ) : null}
    </span>
  );
}

/** Days left on a request, written out. */
export function DaysLeft({ days }: { days: number }) {
  const tone = days < 0 ? "text-red-text" : days <= 7 ? "text-amber-text" : "text-fg-muted";
  return <span className={clsx("text-xs font-medium tabular-nums", tone)}>{days < 0 ? `${-days} ${-days === 1 ? "day" : "days"} overdue` : days === 0 ? "Due today" : `${days} ${days === 1 ? "day" : "days"} left`}</span>;
}
