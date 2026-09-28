"use client";

// The live feed: checks for new events every 20 seconds while the page is visible.
// New items fade in at the top; nothing else moves.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { FeedItem } from "@/lib/feed";
import { chartPalette, colours } from "@/design/tokens";

// Each kind of event has its own marker colour, from the design settings.
const kindColours: Record<FeedItem["kind"], string> = {
  deal: colours.greenText,
  company: chartPalette[0],
  outreach: chartPalette[2],
  data: colours.fgMuted,
  privacy: colours.amber,
};

function ago(iso: string, now: number) {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function LiveFeed({ initial }: { initial: FeedItem[] }) {
  const [items, setItems] = useState(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const known = useRef(new Set(initial.map((i) => i.id)));

  useEffect(() => {
    const load = async () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        if (!res.ok) return;
        const next = ((await res.json()) as { items: FeedItem[] }).items;
        const added = next.filter((i) => !known.current.has(i.id)).map((i) => i.id);
        added.forEach((id) => known.current.add(id));
        setFresh(new Set(added));
        setItems(next);
      } catch {
        // Try again next time.
      }
    };
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, []);

  if (items.length === 0) return <p className="px-5 py-8 text-center text-sm text-fg-muted">Nothing has happened yet. Events appear here as the team works.</p>;

  return (
    <ol className="divide-y divide-line" aria-live="polite" aria-relevant="additions">
      {items.map((i) => (
        <li key={i.id} className={clsx("flex gap-3 px-5 py-3 text-sm", fresh.has(i.id) && "animate-[moca-in_600ms_ease-out]")}>
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: kindColours[i.kind] }} />
          <div className="min-w-0 flex-1">
            {i.href ? <Link href={i.href} className="text-fg no-underline hover:underline">{i.text}</Link> : <p className="text-fg">{i.text}</p>}
            <p className="text-xs text-fg-muted">{ago(i.at, now)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
