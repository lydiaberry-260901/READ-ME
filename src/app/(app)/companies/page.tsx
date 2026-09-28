import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { companyOrderBy, companyWhere, filtersToQuery, PAGE_SIZE, parseCompanyFilters } from "@/lib/companies/query";
import { customerGroupLabels } from "@/lib/labels";
import { loadPickerOptions } from "@/lib/options";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Pagination } from "@/components/Pagination";
import { BulkBar, SelectAll, type BulkAction } from "@/components/BulkBar";
import { SavedViews } from "@/components/SavedViews";
import { bulkCompanies } from "./actions";

export const metadata = { title: "Companies" };

const FORM_ID = "company-bulk";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseCompanyFilters(await searchParams);
  const where = companyWhere(user, filters);

  const [total, companies, options] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: companyOrderBy(filters),
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        owner: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
        _count: { select: { contacts: true } },
      },
    }),
    loadPickerOptions(user),
  ]);

  const { page: _page, ...filterValues } = filters;
  const currentQuery = filtersToQuery(filterValues);
  const hasFilters = currentQuery !== "";

  const groupOptions = [
    ...Object.entries(customerGroupLabels).map(([value, label]) => ({ value, label })),
    { value: "none", label: "No group" },
  ];
  const bulkActions: BulkAction[] = [
    { value: "aiSummary", label: "Write AI summaries and scores (in the background)" },
    { value: "enrich", label: "Fetch website and Companies House details (in the background)" },
    { value: "addTag", label: "Add a tag", input: { kind: "text", label: "Tag name" } },
    { value: "removeTag", label: "Remove a tag", input: { kind: "select", label: "Choose tag", options: options.tags.map((t) => ({ value: t.id, label: t.name })) } },
    { value: "addToList", label: "Add to a list", input: { kind: "text", label: "List name, new or existing" } },
    { value: "removeFromList", label: "Remove from a list", input: { kind: "select", label: "Choose list", options: options.lists.map((l) => ({ value: l.id, label: l.name })) } },
    { value: "group", label: "Set customer group", input: { kind: "select", label: "Choose group", options: groupOptions } },
    { value: "importance", label: "Set importance", input: { kind: "select", label: "Choose level", options: [{ value: "1", label: "1, most important" }, { value: "2", label: "2" }, { value: "3", label: "3, least important" }] } },
    { value: "owner", label: "Change owner", input: { kind: "select", label: "Choose owner", options: [...options.assignableOwners.map((p) => ({ value: p.id, label: p.name })), ...(user.role === "REP" ? [] : [{ value: "none", label: "No owner" }])] } },
    { value: "share", label: "Share with everyone" },
    { value: "unshare", label: "Make private to owner and their manager" },
  ];

  return (
    <>
      <PageHeader
        title="Companies"
        description="Every company in our prospecting database. Filter, tag and group them, and let the AI explain why each one matters to Moca."
        actions={
          <>
            <Link href="/import" className="btn btn-secondary no-underline">Import a CSV file</Link>
            <Link href="/companies/new" className="btn btn-primary no-underline">Add a company</Link>
          </>
        }
      />

      <SavedViews user={user} entity="companies" currentQuery={currentQuery} />

      <form method="get" className="card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter companies">
        <div className="sm:col-span-2">
          <label htmlFor="f-q" className="label">Search</label>
          <input id="f-q" name="q" defaultValue={filters.q} placeholder="Company name or website" className="field" />
        </div>
        <div>
          <label htmlFor="f-group" className="label">Customer group</label>
          <select id="f-group" name="group" defaultValue={filters.group} className="field">
            <option value="">Any</option>
            {groupOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-score" className="label">Score</label>
          <select id="f-score" name="minScore" defaultValue={filters.minScore} className="field">
            <option value="">Any</option>
            <option value="5">5 only</option>
            <option value="4">4 or more</option>
            <option value="3">3 or more</option>
            <option value="2">2 or more</option>
            <option value="unscored">Not scored yet</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-importance" className="label">Importance</label>
          <select id="f-importance" name="importance" defaultValue={filters.importance} className="field">
            <option value="">Any</option>
            <option value="1">1, most important</option>
            <option value="2">2</option>
            <option value="3">3, least important</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-owner" className="label">Owner</label>
          <select id="f-owner" name="owner" defaultValue={filters.owner} className="field">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">No owner</option>
            {options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-tag" className="label">Tag</label>
          <select id="f-tag" name="tag" defaultValue={filters.tag} className="field">
            <option value="">Any</option>
            {options.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-list" className="label">List</label>
          <select id="f-list" name="list" defaultValue={filters.list} className="field">
            <option value="">Any</option>
            {options.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <div className="mr-auto">
            <label htmlFor="f-sort" className="label">Sort by</label>
            <select id="f-sort" name="sort" defaultValue={filters.sort} className="field w-auto">
              <option value="name">Name</option>
              <option value="score">Highest score</option>
              <option value="importance">Most important</option>
              <option value="updated">Recently changed</option>
            </select>
          </div>
          {hasFilters ? <Link href="/companies" className="btn btn-secondary no-underline">Clear</Link> : null}
          <button type="submit" className="btn btn-primary">Apply filters</button>
        </div>
      </form>

      <section className="card overflow-hidden">
        <BulkBar formId={FORM_ID} actions={bulkActions} action={bulkCompanies} noun="companies" />
        {companies.length === 0 ? (
          <div className="p-6">
            <EmptyState title={hasFilters ? "No companies match these filters" : "No companies yet"}>
              {hasFilters ? "Try clearing some filters." : "Add a company or import a CSV file to get started."}
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line text-fg-muted">
                <tr>
                  <th scope="col" className="w-10 py-2.5 pl-6"><SelectAll formId={FORM_ID} label="Select all companies on this page" /></th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Company</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Score and reason</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Group</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Importance</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Owner</th>
                  <th scope="col" className="px-3 py-2.5 pr-6 font-medium">Contacts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {companies.map((c) => (
                  <tr key={c.id} className="align-top hover:bg-panel-sunk">
                    <td className="py-3 pl-6">
                      <input type="checkbox" name="ids" value={c.id} form={FORM_ID} aria-label={`Select ${c.name}`} className="size-4 accent-green" />
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/companies/${c.id}`} className="font-medium text-fg underline-offset-4 hover:underline">{c.name}</Link>
                      {c.domain ? <p className="text-xs text-fg-muted">{c.domain}</p> : null}
                      {c.tags.length ? (
                        <p className="mt-1 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t.tagId}>{t.tag.name}</Badge>)}</p>
                      ) : null}
                      {c.isShared ? null : <p className="mt-1 text-xs text-fg-muted">Private</p>}
                    </td>
                    <td className="max-w-sm px-3 py-3">
                      <div className="flex items-start gap-2">
                        <ScoreBadge score={c.score} />
                        {c.scoreReason ? <span className="text-xs text-fg-muted">{c.scoreReason}</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">{c.customerGroup ? customerGroupLabels[c.customerGroup] : <span className="text-fg-muted">Not set</span>}</td>
                    <td className="px-3 py-3 tabular-nums">{c.importance}</td>
                    <td className="px-3 py-3">{c.owner?.name ?? <span className="text-fg-muted">No owner</span>}</td>
                    <td className="px-3 py-3 pr-6 tabular-nums">{c._count.contacts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => `/companies${filtersToQuery(filterValues, { page: p })}`} />
      </section>
    </>
  );
}
