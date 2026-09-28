import Link from "next/link";
import { requireUser } from "@/lib/session";
import { loadDeals, parseDealFilters } from "@/lib/deals/query";
import { filtersToQuery } from "@/lib/companies/query";
import { customerGroupLabels } from "@/lib/labels";
import { loadPickerOptions } from "@/lib/options";
import { HealthFlag, QualificationMeter } from "@/components/deal-bits";
import { AnimatedNumber } from "@/components/motion";
import { EmptyState } from "@/components/ui";
import { DealBoard } from "./DealBoard";

export const metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseDealFilters(await searchParams);
  const [{ stages, deals }, options] = await Promise.all([loadDeals(user, filters), loadPickerOptions(user)]);

  const open = deals.filter((d) => d.stageKind === "OPEN");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const atRisk = open.filter((d) => d.healthFlag === "AT_RISK").length;
  const stalled = open.filter((d) => d.healthFlag === "STALLED").length;
  const { view, ...rest } = filters;
  const other = view === "board" ? "list" : "board";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Deals</h1>
          <p className="mt-1 text-sm text-fg-muted">Drag a deal to change its stage. Closing as won or lost asks for the details.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/deals${filtersToQuery({ ...rest, view: other })}`} className="btn btn-secondary no-underline">
            {view === "board" ? "Show as a list" : "Show as a board"}
          </Link>
          <Link href="/deals/new" className="btn btn-primary no-underline">New deal</Link>
        </div>
      </div>

      <section aria-label="Pipeline figures" className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          { label: "Open pipeline", value: <AnimatedNumber value={openValue} format="pounds" /> },
          { label: "Open deals", value: <AnimatedNumber value={open.length} /> },
          { label: "At risk", value: <AnimatedNumber value={atRisk} />, tone: atRisk ? "text-amber-text" : "" },
          { label: "Stalled", value: <AnimatedNumber value={stalled} />, tone: stalled ? "text-red-text" : "" },
        ].map((k) => (
          <div key={k.label} className="bg-panel px-5 py-4">
            <p className="text-xs text-fg-muted">{k.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${k.tone ?? ""}`}>{k.value}</p>
          </div>
        ))}
      </section>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter deals">
        <input type="hidden" name="view" value={view} />
        <div>
          <label htmlFor="d-q" className="sr-only">Search deals</label>
          <input id="d-q" name="q" defaultValue={filters.q} placeholder="Deal or company" className="field w-52 py-1.5" />
        </div>
        <div>
          <label htmlFor="d-owner" className="sr-only">Owner</label>
          <select id="d-owner" name="owner" defaultValue={filters.owner} className="field w-auto py-1.5">
            <option value="">Any owner</option>
            <option value="me">Me</option>
            {options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="d-group" className="sr-only">Customer group</label>
          <select id="d-group" name="group" defaultValue={filters.group} className="field w-auto py-1.5">
            <option value="">Any customer group</option>
            {Object.entries(customerGroupLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="d-health" className="sr-only">Health</label>
          <select id="d-health" name="health" defaultValue={filters.health} className="field w-auto py-1.5">
            <option value="">Any health</option>
            <option value="ON_TRACK">On track</option>
            <option value="AT_RISK">At risk</option>
            <option value="STALLED">Stalled</option>
          </select>
        </div>
        <button type="submit" className="btn btn-secondary py-1.5">Apply</button>
        {filtersToQuery(rest) ? <Link href={`/deals?view=${view}`} className="self-center text-sm">Clear</Link> : null}
      </form>

      {view === "board" ? (
        <DealBoard key={JSON.stringify(filters)} stages={stages} deals={deals} />
      ) : deals.length === 0 ? (
        <EmptyState title="No deals match these filters" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-panel-sunk text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Deal</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Stage</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Value</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Health</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Qualification</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Days in stage</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Owner</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Expected close</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-panel">
              {[...deals].sort((a, b) => (a.healthScore ?? 999) - (b.healthScore ?? 999)).map((d) => (
                <tr key={d.id} className="hover:bg-panel-raised">
                  <td className="px-4 py-2.5">
                    <Link href={`/deals/${d.id}`} className="font-medium text-fg">{d.name}</Link>
                    <p className="text-xs text-fg-muted">{d.companyName}</p>
                  </td>
                  <td className="px-3 py-2.5">{d.stageName}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(d.value)}</td>
                  <td className="px-3 py-2.5"><HealthFlag flag={d.healthFlag} score={d.healthScore} /></td>
                  <td className="px-3 py-2.5"><QualificationMeter pct={d.qualificationPct} /></td>
                  <td className="px-3 py-2.5 tabular-nums">{d.daysInStage}</td>
                  <td className="px-3 py-2.5">{d.ownerName}</td>
                  <td className="px-4 py-2.5">{d.expectedClose ?? "Not set"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
