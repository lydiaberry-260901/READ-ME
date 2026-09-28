import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { contactOrderBy, contactWhere, parseContactFilters } from "@/lib/contacts/query";
import { filtersToQuery, PAGE_SIZE } from "@/lib/companies/query";
import { canColdCall, privacyNoticeStatus } from "@/lib/contacts/compliance";
import { customerGroupLabels } from "@/lib/labels";
import { loadPickerOptions } from "@/lib/options";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { Pagination } from "@/components/Pagination";
import { BulkBar, SelectAll, type BulkAction } from "@/components/BulkBar";
import { SavedViews } from "@/components/SavedViews";
import { bulkContacts } from "./actions";

export const metadata = { title: "Contacts" };

const FORM_ID = "contact-bulk";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = parseContactFilters(await searchParams);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { phoneCheckMaxAgeDays: true } });
  const where = contactWhere(user, filters, org.phoneCheckMaxAgeDays);

  const [total, contacts, options] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: contactOrderBy(filters),
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        company: { select: { id: true, name: true, customerGroup: true } },
        owner: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    }),
    loadPickerOptions(user),
  ]);

  const { page: _page, ...filterValues } = filters;
  const currentQuery = filtersToQuery(filterValues);
  const hasFilters = currentQuery !== "";

  const bulkActions: BulkAction[] = [
    { value: "addTag", label: "Add a tag", input: { kind: "text", label: "Tag name" } },
    { value: "removeTag", label: "Remove a tag", input: { kind: "select", label: "Choose tag", options: options.tags.map((t) => ({ value: t.id, label: t.name })) } },
    { value: "addToList", label: "Add to a list", input: { kind: "text", label: "List name, new or existing" } },
    { value: "removeFromList", label: "Remove from a list", input: { kind: "select", label: "Choose list", options: options.lists.map((l) => ({ value: l.id, label: l.name })) } },
    { value: "owner", label: "Change owner", input: { kind: "select", label: "Choose owner", options: [...options.assignableOwners.map((p) => ({ value: p.id, label: p.name })), ...(user.role === "REP" ? [] : [{ value: "none", label: "No owner" }])] } },
    { value: "share", label: "Share with everyone" },
    { value: "unshare", label: "Make private to owner and their manager" },
  ];

  return (
    <>
      <PageHeader
        title="Contacts"
        description="People at the companies we work with. Business details only."
        actions={
          <>
            <Link href="/import" className="btn btn-secondary no-underline">Import a CSV file</Link>
            <Link href="/contacts/new" className="btn btn-primary no-underline">Add a contact</Link>
          </>
        }
      />

      <SavedViews user={user} entity="contacts" currentQuery={currentQuery} />

      <form method="get" className="card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter contacts">
        <div className="sm:col-span-2">
          <label htmlFor="f-q" className="label">Search</label>
          <input id="f-q" name="q" defaultValue={filters.q} placeholder="Name, email, job title or company" className="field" />
        </div>
        <div>
          <label htmlFor="f-group" className="label">Customer group</label>
          <select id="f-group" name="group" defaultValue={filters.group} className="field">
            <option value="">Any</option>
            {Object.entries(customerGroupLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="label">Data protection</label>
          <select id="f-status" name="status" defaultValue={filters.status} className="field">
            <option value="">Anyone</option>
            <option value="can_contact">Can be contacted</option>
            <option value="opted_out">Opted out</option>
            <option value="phone_check_needed">Phone check needed</option>
            <option value="notice_overdue">Privacy notice overdue</option>
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
        <div>
          <label htmlFor="f-sort" className="label">Sort by</label>
          <select id="f-sort" name="sort" defaultValue={filters.sort} className="field">
            <option value="name">Name</option>
            <option value="company">Company</option>
            <option value="updated">Recently changed</option>
          </select>
        </div>
        <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
          {hasFilters ? <Link href="/contacts" className="btn btn-secondary no-underline">Clear</Link> : null}
          <button type="submit" className="btn btn-primary">Apply filters</button>
        </div>
      </form>

      <section className="card overflow-hidden">
        <BulkBar formId={FORM_ID} actions={bulkActions} action={bulkContacts} noun="contacts" />
        {contacts.length === 0 ? (
          <div className="p-6">
            <EmptyState title={hasFilters ? "No contacts match these filters" : "No contacts yet"}>
              {hasFilters ? "Try clearing some filters." : "Add a contact or import a CSV file."}
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line text-fg-muted">
                <tr>
                  <th scope="col" className="w-10 py-2.5 pl-6"><SelectAll formId={FORM_ID} label="Select all contacts on this page" /></th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Company</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Work email</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Contact status</th>
                  <th scope="col" className="px-3 py-2.5 pr-6 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {contacts.map((c) => {
                  const call = canColdCall(c, org.phoneCheckMaxAgeDays);
                  const notice = privacyNoticeStatus(c);
                  return (
                    <tr key={c.id} className="align-top hover:bg-panel-sunk">
                      <td className="py-3 pl-6">
                        <input type="checkbox" name="ids" value={c.id} form={FORM_ID} aria-label={`Select ${c.firstName} ${c.lastName ?? ""}`} className="size-4 accent-green" />
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/contacts/${c.id}`} className="font-medium text-fg underline-offset-4 hover:underline">{c.firstName} {c.lastName}</Link>
                        <p className="text-xs text-fg-muted">{c.jobTitle ?? "Job title not recorded"}</p>
                        {c.tags.length ? <p className="mt-1 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t.tagId}>{t.tag.name}</Badge>)}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        {c.company ? <Link href={`/companies/${c.company.id}`} className="text-fg">{c.company.name}</Link> : <span className="text-fg-muted">None</span>}
                        {c.company?.customerGroup ? <p className="text-xs text-fg-muted">{customerGroupLabels[c.company.customerGroup]}</p> : null}
                      </td>
                      <td className="px-3 py-3">{c.email ?? <span className="text-fg-muted">None</span>}</td>
                      <td className="px-3 py-3">
                        <span className="flex flex-wrap gap-1">
                          {c.optedOut ? <Badge tone="red">Opted out</Badge> : null}
                          {!c.optedOut && c.phone && !call.ok ? <Badge tone="amber">Phone check needed</Badge> : null}
                          {!c.optedOut && notice.state === "overdue" ? <Badge tone="amber">Privacy notice overdue</Badge> : null}
                          {!c.optedOut && (call.ok || !c.phone) && notice.state !== "overdue" ? <Badge tone="green">OK to contact</Badge> : null}
                        </span>
                      </td>
                      <td className="px-3 py-3 pr-6">{c.owner?.name ?? <span className="text-fg-muted">No owner</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => `/contacts${filtersToQuery(filterValues, { page: p })}`} />
      </section>
    </>
  );
}
