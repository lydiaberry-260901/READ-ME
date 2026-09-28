"use client";

// A small live indicator showing what the background automations are doing.
// Checks every 15 seconds while the page is visible.
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { AutomationStatus } from "@/lib/automations";

const WORKER_OFFLINE_MINUTES = 30;

function minutesAgo(iso: string | null) {
  return iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60_000) : null;
}

function timeText(iso: string | null) {
  if (!iso) return "not yet";
  const m = minutesAgo(iso)!;
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export function LiveAutomations() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/automations", { cache: "no-store" });
        if (res.ok && !stopped) setStatus(await res.json());
      } catch {
        // Try again next time.
      }
    };
    load();
    const timer = setInterval(load, 15_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const workerAge = minutesAgo(status?.workerLastSeen ?? null);
  const offline = !status || workerAge === null || workerAge > WORKER_OFFLINE_MINUTES;
  const busy = (status?.running ?? 0) + (status?.waiting ?? 0);
  const state = offline ? "offline" : status!.failedToday > 0 ? "failed" : busy > 0 ? "busy" : "idle";
  const text = { offline: "Worker offline", failed: `${status?.failedToday} failed today`, busy: `${busy} running`, idle: "Automations idle" }[state];

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-fg-muted hover:bg-panel hover:text-fg"
      >
        <span
          aria-hidden="true"
          className={clsx(
            "size-2 rounded-full",
            state === "busy" && "live-dot bg-green-text",
            state === "idle" && "bg-green-text",
            state === "failed" && "bg-red-text",
            state === "offline" && "bg-amber",
          )}
        />
        <span className="hidden md:inline">{text}</span>
        <span className="sr-only md:hidden">{text}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-lg border border-line-strong bg-panel p-4 text-sm shadow-2xl">
          <p className="font-semibold">Automations</p>
          <p className="mt-1 text-xs text-fg-muted">
            {offline
              ? "The background worker has not checked in recently. Scheduled jobs will wait until it is running again."
              : `The background worker last checked in ${timeText(status?.workerLastSeen ?? null)}.`}
          </p>
          <ul className="mt-3 divide-y divide-line">
            {(status?.queues ?? []).map((q) => (
              <li key={q.name} className="flex items-center justify-between gap-3 py-2">
                <span>{q.label}</span>
                <span className="text-xs text-fg-muted">
                  {q.running + q.waiting > 0 ? `${q.running} running, ${q.waiting} waiting` : `last done ${timeText(q.lastFinished)}`}
                </span>
              </li>
            ))}
          </ul>
          <a href="/automations" className="mt-3 block text-xs">See all automations</a>
        </div>
      ) : null}
    </div>
  );
}
