"use client";

// Filters that apply as soon as they change. The page updates in place, so the charts morph
// from their current shape into the new one rather than starting again.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Option = { value: string; label: string };

export function AnalyticsFilters({ ranges, people, groups, current }: { ranges: Option[]; people: Option[]; groups: Option[]; current: { range: string; person: string; group: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(name: string, value: string, fallback = "") {
    const next = new URLSearchParams(params.toString());
    if (!value || value === fallback) next.delete(name);
    else next.set(name, value);
    const q = next.toString();
    start(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter analytics" aria-busy={pending}>
      <label htmlFor="a-range" className="sr-only">Period</label>
      <select id="a-range" value={current.range} onChange={(e) => set("range", e.target.value, "90")} className="field w-auto py-1.5">
        {ranges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <label htmlFor="a-person" className="sr-only">Person</label>
      <select id="a-person" value={current.person} onChange={(e) => set("person", e.target.value)} className="field w-auto py-1.5">
        <option value="">Everyone you can see</option>
        {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <label htmlFor="a-group" className="sr-only">Customer group</label>
      <select id="a-group" value={current.group} onChange={(e) => set("group", e.target.value)} className="field w-auto py-1.5">
        <option value="">All customer groups</option>
        {groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
      </select>
      <span className={`ml-1 text-xs text-fg-muted transition-opacity ${pending ? "opacity-100" : "opacity-0"}`} role="status">Updating</span>
    </div>
  );
}
