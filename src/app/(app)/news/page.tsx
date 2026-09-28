import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can, visibleWhere } from "@/lib/permissions";
import { newsTypeLabels } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { addDays, isoDay, mondayOf, startOfLondonDay } from "@/lib/calendar-view";
import type { Prisma } from "@/generated/prisma/client";
import type { NewsStatus, NewsType } from "@/generated/prisma/enums";
import type { NewsRunSummary } from "@/lib/news/collect";
import { AnimatedNumber } from "@/components/motion";
import { EmptyState, Notice } from "@/components/ui";
import { NewsList } from "@/components/NewsList";
import { Pagination } from "@/components/Pagination";
import { NewsCharts } from "./NewsCharts";

export const metadata = { title: "News" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PAGE_SIZE = 25;
const PERIODS = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months" } as const;
const sourceLabels = { OFF: "Off", API: "News service", FEEDS: "News feeds" } as const;

export default async function NewsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const p = await searchParams;
  const type = one(p.type) in newsTypeLabels ? (one(p.type) as NewsType) : null;
  const status = ["NEW", "READ", "ACTED_ON"].includes(one(p.status)) ? (one(p.status) as NewsStatus) : null;
  const minRelevance = Math.min(5, Math.max(0, Number(one(p.relevance)) || 0));
  const period = (one(p.period) in PERIODS ? one(p.period) : "30") as keyof typeof PERIODS;
  const q = one(p.q).trim().slice(0, 100);
  const page = Math.max(1, Number(one(p.page)) || 1);

  const now = new Date();
  const since = startOfLondonDay(addDays(isoDay(now), -Number(period) + 1));
  const base: Prisma.NewsItemWhereInput = {
    organisationId: user.organisationId,
    createdAt: { gte: since },
    company: { AND: [visibleWhere(user), ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : [])] },
  };
  const where: Prisma.NewsItemWhereInput = {
    ...base,
    ...(type ? { newsType: type } : {}),
    ...(status ? { status } : {}),
    ...(minRelevance ? { relevance: { gte: minRelevance } } : {}),
  };
  const twelveWeeksAgo = startOfLondonDay(addDays(mondayOf(isoDay(now)), -77));

  const [items, total, inPeriod, weekly, org] = await Promise.all([
    prisma.newsItem.findMany({
      where,
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.newsItem.count({ where }),
    prisma.newsItem.findMany({ where: base, select: { newsType: true, relevance: true, status: true } }),
    prisma.newsItem.findMany({ where: { organisationId: user.organisationId, createdAt: { gte: twelveWeeksAgo }, company: visibleWhere(user) }, select: { createdAt: true } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { newsSource: true, newsLastRunAt: true, newsLastRunSummary: true } }),
  ]);

  const newCount = inPeriod.filter((n) => n.status === "NEW").length;
  const relevantNew = inPeriod.filter((n) => n.status === "NEW" && (n.relevance ?? 0) >= 4).length;
  const actedOn = inPeriod.filter((n) => n.status === "ACTED_ON").length;
  const byType = (Object.keys(newsTypeLabels) as NewsType[])
    .map((t) => ({ type: newsTypeLabels[t], items: inPeriod.filter((n) => (n.newsType ?? "OTHER") === t).length, relevant: inPeriod.filter((n) => (n.newsType ?? "OTHER") === t && (n.relevance ?? 0) >= 4).length }))
    .filter((t) => t.items > 0)
    .sort((a, b) => b.items - a.items);
  const byWeek = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(mondayOf(isoDay(now)), (i - 11) * 7);
    const from = startOfLondonDay(start).getTime();
    const to = startOfLondonDay(addDays(start, 7)).getTime();
    return { week: formatDate(new Date(`${start}T12:00:00Z`)).slice(0, 5), items: weekly.filter((w) => w.createdAt.getTime() >= from && w.createdAt.getTime() < to).length };
  });
  const run = org.newsLastRunSummary as NewsRunSummary | null;

  const filterHref = (changes: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    const current = { type: type ?? "", status: status ?? "", relevance: minRelevance || "", period, q, page: "" };
    for (const [k, v] of Object.entries({ ...current, ...changes })) if (v !== null && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/news?${s}` : "/news";
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">News</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            News about companies in the CRM, checked each morning at 06:30. Only the headline, source, link, date and a short AI summary are kept. Very relevant news becomes a task on the owner&apos;s daily list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, "settings.manage") ? <Link href="/settings/news" className="btn btn-secondary py-1.5 no-underline">News settings</Link> : null}
          <a href="/api/export/news" className="btn btn-secondary py-1.5 no-underline">Download CSV</a>
        </div>
      </header>

      {org.newsSource === "OFF" ? (
        <Notice tone="amber" title="News checks are switched off">
          {can(user, "settings.manage") ? <>Choose a news service or news feeds in <Link href="/settings/news">news settings</Link> to start.</> : "An admin can switch them on in news settings."}
        </Notice>
      ) : null}

      <section aria-label="News at a glance" className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">New, not yet read</p><p className="mt-1 text-3xl font-semibold"><AnimatedNumber value={newCount} /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">New and very relevant</p><p className="mt-1 text-3xl font-semibold text-green-text"><AnimatedNumber value={relevantNew} /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Acted on</p><p className="mt-1 text-3xl font-semibold"><AnimatedNumber value={actedOn} /></p></div>
        <div className="bg-panel px-5 py-4">
          <p className="text-xs text-fg-muted">Last check</p>
          <p className="mt-1 text-sm">{org.newsLastRunAt ? formatDateTime(org.newsLastRunAt) : "Not run yet"}</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Source: {sourceLabels[org.newsSource as keyof typeof sourceLabels] ?? org.newsSource}
            {run ? `. ${run.companiesChecked} companies checked, ${run.saved} new items${run.errors.length ? `, ${run.errors.length} problems` : ""}.` : ""}
          </p>
        </div>
      </section>

      <NewsCharts byType={byType} byWeek={byWeek} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-panel px-5 py-4">
        <div>
          <label htmlFor="n-q" className="label">Company</label>
          <input id="n-q" name="q" defaultValue={q} placeholder="Company name" className="field py-1.5" />
        </div>
        <div>
          <label htmlFor="n-type" className="label">Type</label>
          <select id="n-type" name="type" defaultValue={type ?? ""} className="field py-1.5">
            <option value="">All types</option>
            {(Object.keys(newsTypeLabels) as NewsType[]).map((t) => <option key={t} value={t}>{newsTypeLabels[t]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="n-rel" className="label">Relevance</label>
          <select id="n-rel" name="relevance" defaultValue={String(minRelevance || "")} className="field py-1.5">
            <option value="">Any</option>
            <option value="3">3 or more</option>
            <option value="4">4 or more</option>
            <option value="5">5 only</option>
          </select>
        </div>
        <div>
          <label htmlFor="n-status" className="label">Status</label>
          <select id="n-status" name="status" defaultValue={status ?? ""} className="field py-1.5">
            <option value="">Any</option>
            <option value="NEW">New</option>
            <option value="READ">Read</option>
            <option value="ACTED_ON">Acted on</option>
          </select>
        </div>
        <div>
          <label htmlFor="n-period" className="label">Period</label>
          <select id="n-period" name="period" defaultValue={period} className="field py-1.5">
            {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary py-1.5">Show</button>
        <Link href="/news" className="text-sm text-fg-muted">Clear</Link>
      </form>

      {items.length === 0 ? (
        <EmptyState title="No news matches">Try a longer period or fewer filters.</EmptyState>
      ) : (
        <section className="rounded-lg border border-line bg-panel" aria-label="News items">
          <NewsList items={items} showCompany />
        </section>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(n) => filterHref({ page: n > 1 ? n : null })} />
    </div>
  );
}
