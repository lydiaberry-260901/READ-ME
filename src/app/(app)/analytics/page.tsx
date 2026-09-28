import { requireUser } from "@/lib/session";
import { customerGroupLabels } from "@/lib/labels";
import { loadAnalytics, parseAnalyticsFilters, RANGES } from "@/lib/analytics/load";
import { filtersToQuery } from "@/lib/companies/query";
import { formatDate } from "@/lib/format";
import { Dashboard } from "./Dashboard";
import { AnalyticsFilters } from "./Filters";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseAnalyticsFilters(await searchParams);
  const data = await loadAnalytics(user, filters);
  const query = filtersToQuery({ range: filters.range === "90" ? "" : filters.range, person: filters.person, group: filters.group });
  const scope = user.role === "ADMIN" ? "everyone" : user.role === "MANAGER" ? "you and your team" : "your own work and deals";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {formatDate(filters.from)} to {formatDate(filters.to)}, covering {scope}.
          </p>
        </div>
        <AnalyticsFilters
          ranges={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          people={data.people.map((p) => ({ value: p.id, label: p.name }))}
          groups={Object.entries(customerGroupLabels).map(([value, label]) => ({ value, label }))}
          current={{ range: filters.range, person: filters.person, group: filters.group }}
        />
      </div>
      <Dashboard data={data} query={query} />
    </>
  );
}
