import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { canEdit, canView, visibleWhere } from "@/lib/permissions";
import { customerGroupLabels, newsTypeLabels } from "@/lib/labels";
import type { NewsType } from "@/generated/prisma/enums";
import { NewsList } from "@/components/NewsList";
import { setNewsPaused } from "../../news/actions";
import { formatDate, formatDateTime, formatPounds } from "@/lib/format";
import { loadPickerOptions } from "@/lib/options";
import { aiIsConfigured } from "@/lib/ai";
import type { CompanyEnrichment } from "@/lib/enrichment/types";
import { Badge, EmptyState, Notice } from "@/components/ui";
import { ScoreBadge } from "@/components/ScoreBadge";
import { CompanyForm } from "../CompanyForm";
import { updateCompany, removeCompanyTag } from "../actions";
import { AddTagForm, EditSummary, EnrichButton, GenerateSummaryButton } from "./panels";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const company = await prisma.company.findFirst({
    where: { id, organisationId: user.organisationId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
    },
  });
  if (!company || !canView(user, company)) notFound();

  const editable = canEdit(user, company, { sharedIsEditable: true });
  const newsType = one((await searchParams).newsType);
  const [contacts, deals, options, editor, news, newsWatch, newsSource] = await Promise.all([
    prisma.contact.findMany({
      where: { AND: [visibleWhere(user), { companyId: company.id }] },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true, optedOut: true },
    }),
    prisma.deal.findMany({
      where: { AND: [visibleWhere(user), { companyId: company.id }] },
      include: { stage: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    loadPickerOptions(user),
    company.aiEditedById ? prisma.user.findUnique({ where: { id: company.aiEditedById }, select: { name: true } }) : null,
    prisma.newsItem.findMany({
      where: { organisationId: user.organisationId, companyId: company.id, ...(newsType in newsTypeLabels ? { newsType: newsType as NewsType } : {}) },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 15,
    }),
    prisma.newsWatch.findUnique({ where: { companyId: company.id } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { newsSource: true } }).then((o) => o.newsSource),
  ]);

  const enrichment = (company.enrichment ?? {}) as CompanyEnrichment;
  const aiFacts = (company.aiKeyFacts ?? {}) as { keyFacts?: string[]; missingInformation?: string[]; promptVersion?: string };
  const owners = [...options.assignableOwners];
  if (company.owner && !owners.some((o) => o.id === company.owner!.id)) owners.push({ id: company.owner.id, name: company.owner.name ?? company.owner.email });
  const suggestedDiffers = company.aiSuggestedGroup && company.aiSuggestedGroup !== company.customerGroup;

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/companies">Companies</Link> <span className="text-fg-muted">/ {company.name}</span></p>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{company.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            {company.website ? <a href={company.website} target="_blank" rel="noopener noreferrer">{company.domain ?? company.website}</a> : <span>No website</span>}
            <span>{company.customerGroup ? customerGroupLabels[company.customerGroup] : "No customer group"}</span>
            <span>Importance {company.importance}</span>
            <span>Owner: {company.owner?.name ?? "No owner"}</span>
            {company.isShared ? <span>Shared</span> : <span>Private</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {company.tags.map((t) => (
              <span key={t.tagId} className="inline-flex items-center gap-1">
                <Badge>{t.tag.name}</Badge>
                {editable ? (
                  <form action={removeCompanyTag}>
                    <input type="hidden" name="id" value={company.id} />
                    <input type="hidden" name="tagId" value={t.tagId} />
                    <button type="submit" aria-label={`Remove tag ${t.tag.name}`} className="text-xs text-fg-muted hover:text-red-text">×</button>
                  </form>
                ) : null}
              </span>
            ))}
            {editable ? <AddTagForm id={company.id} /> : null}
          </div>
        </div>
        <ScoreBadge score={company.score} size="lg" />
      </header>

      {/* Why this company matters to Moca */}
      <section className="card relative overflow-hidden p-6" aria-labelledby="why-heading">
        <span className="absolute inset-y-0 left-0 w-1 bg-amber" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 id="why-heading" className="text-lg font-semibold">Why this company matters to Moca</h2>
            {company.whyMatters ? (
              <>
                <p className="mt-3 text-base leading-relaxed">{company.whyMatters}</p>
                <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <ScoreBadge score={company.score} />
                  <span>{company.scoreReason}</span>
                </p>
              </>
            ) : (
              <p className="mt-3 text-fg-muted">
                Not written yet. The AI uses only the details saved on this page, and never invents facts.
                For a better result, fetch the website and Companies House details first.
              </p>
            )}
          </div>
          {editable ? (
            <div className="flex flex-wrap gap-2">
              <GenerateSummaryButton id={company.id} hasSummary={Boolean(company.whyMatters)} aiReady={aiIsConfigured()} />
              {company.whyMatters ? <EditSummary id={company.id} whyMatters={company.whyMatters} score={company.score} scoreReason={company.scoreReason ?? ""} /> : null}
            </div>
          ) : null}
        </div>

        {aiFacts.keyFacts?.length || aiFacts.missingInformation?.length ? (
          <div className="mt-5 grid gap-5 border-t border-line pt-5 md:grid-cols-2">
            {aiFacts.keyFacts?.length ? (
              <div>
                <h3 className="text-sm font-semibold">Key facts found</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{aiFacts.keyFacts.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            ) : null}
            {aiFacts.missingInformation?.length ? (
              <div>
                <h3 className="text-sm font-semibold">Not known yet</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">{aiFacts.missingInformation.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {suggestedDiffers ? (
          <div className="mt-5">
            <Notice tone="amber" title="The AI suggests a different customer group">
              Suggested: {customerGroupLabels[company.aiSuggestedGroup!]}. Change it in the details below if you agree.
            </Notice>
          </div>
        ) : null}

        {company.aiGeneratedAt ? (
          <p className="mt-5 text-xs text-fg-muted">
            Written by {company.aiModel} on {formatDateTime(company.aiGeneratedAt)}
            {aiFacts.promptVersion ? `, using ${aiFacts.promptVersion}` : ""}.
            {company.aiEditedAt ? ` Edited by ${editor?.name ?? "a team member"} on ${formatDateTime(company.aiEditedAt)}.` : " Not yet checked by a person."}
          </p>
        ) : null}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-6" aria-labelledby="details-heading">
          <h2 id="details-heading" className="mb-5 text-lg font-semibold">Company details</h2>
          {editable ? (
            <CompanyForm
              company={{
                id: company.id, name: company.name, website: company.website, customerGroup: company.customerGroup,
                importance: company.importance, description: company.description, portfolioSize: company.portfolioSize,
                headOffice: company.headOffice, companiesHouseNumber: company.companiesHouseNumber,
                alternativeNames: company.alternativeNames, ownerId: company.ownerId, isShared: company.isShared,
              }}
              owners={owners} allowNoOwner={user.role !== "REP"} action={updateCompany} submitLabel="Save details" />
          ) : (
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-fg-muted">Description</dt><dd>{company.description ?? "Not recorded"}</dd></div>
              <div><dt className="text-fg-muted">Portfolio size</dt><dd>{company.portfolioSize ?? "Not recorded"}</dd></div>
              <div><dt className="text-fg-muted">Head office</dt><dd>{company.headOffice ?? "Not recorded"}</dd></div>
              <div><dt className="text-fg-muted">Companies House number</dt><dd>{company.companiesHouseNumber ?? "Not recorded"}</dd></div>
            </dl>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section className="section-plain" aria-labelledby="extra-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="extra-heading" className="text-lg font-semibold">Public details</h2>
                <p className="text-sm text-fg-muted">From the company's website and Companies House.</p>
              </div>
              {editable ? (
                <EnrichButton
                  id={company.id}
                  disabledReason={!company.website && !company.companiesHouseNumber ? "Add a website or Companies House number first." : undefined}
                />
              ) : null}
            </div>
            {!enrichment.website && !enrichment.companiesHouse ? (
              <p className="mt-4 text-sm text-fg-muted">Nothing fetched yet.</p>
            ) : (
              <div className="mt-4 space-y-5 text-sm">
                {enrichment.companiesHouse ? (
                  <div>
                    <h3 className="font-semibold">Companies House</h3>
                    {enrichment.companiesHouse.status === "ok" ? (
                      <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
                        <dt className="text-fg-muted">Registered name</dt><dd>{enrichment.companiesHouse.companyName}</dd>
                        <dt className="text-fg-muted">Status</dt><dd>{enrichment.companiesHouse.companyStatus}</dd>
                        <dt className="text-fg-muted">Type</dt><dd>{enrichment.companiesHouse.companyType}</dd>
                        <dt className="text-fg-muted">Incorporated</dt><dd>{formatDate(enrichment.companiesHouse.incorporatedOn)}</dd>
                        <dt className="text-fg-muted">Industry codes</dt><dd>{enrichment.companiesHouse.sicCodes?.join(", ") || "None listed"}</dd>
                        <dt className="text-fg-muted">Registered office</dt><dd>{enrichment.companiesHouse.registeredOffice}</dd>
                      </dl>
                    ) : (
                      <p className="mt-1 text-amber-text">{enrichment.companiesHouse.error}</p>
                    )}
                    <p className="mt-1 text-xs text-fg-muted">Checked {formatDateTime(enrichment.companiesHouse.fetchedAt)}</p>
                  </div>
                ) : null}
                {enrichment.website ? (
                  <div>
                    <h3 className="font-semibold">Website</h3>
                    {enrichment.website.status === "ok" ? (
                      <>
                        {enrichment.website.title ? <p className="mt-1 font-medium">{enrichment.website.title}</p> : null}
                        {enrichment.website.description ? <p className="mt-1">{enrichment.website.description}</p> : null}
                      </>
                    ) : (
                      <p className="mt-1 text-amber-text">{enrichment.website.error}</p>
                    )}
                    <p className="mt-1 text-xs text-fg-muted">Checked {formatDateTime(enrichment.website.fetchedAt)}</p>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="section-plain" aria-labelledby="contacts-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="contacts-heading" className="text-lg font-semibold">Contacts</h2>
              <Link href={`/contacts/new?companyId=${company.id}`} className="btn btn-secondary py-1.5 no-underline">Add a contact</Link>
            </div>
            {contacts.length === 0 ? (
              <p className="mt-4 text-sm text-fg-muted">No contacts you can see.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line text-sm">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span>
                      <Link href={`/contacts/${c.id}`} className="font-medium text-fg">{c.firstName} {c.lastName}</Link>
                      <span className="block text-fg-muted">{c.jobTitle ?? "Job title not recorded"}</span>
                    </span>
                    {c.optedOut ? <Badge tone="red">Opted out</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section-plain" aria-labelledby="deals-heading">
            <h2 id="deals-heading" className="text-lg font-semibold">Deals</h2>
            {deals.length === 0 ? (
              <div className="mt-4"><EmptyState title="No deals you can see" /></div>
            ) : (
              <ul className="mt-4 divide-y divide-line text-sm">
                {deals.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span>
                      <span className="font-medium">{d.name}</span>
                      <span className="block text-fg-muted">{d.stage.name}, owned by {d.owner.name}</span>
                    </span>
                    <span className="tabular-nums">{formatPounds(d.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="card mt-8" aria-labelledby="news-heading">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="news-heading" className="text-lg font-semibold">News</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              {newsSource === "OFF"
                ? "News checks are switched off for the organisation."
                : newsWatch?.paused
                  ? "News checks are paused for this company."
                  : `Checked ${company.importance === 1 ? "every morning" : "about once a week"}${newsWatch?.lastCheckedAt ? `, last on ${formatDateTime(newsWatch.lastCheckedAt)}` : ", not checked yet"}.`}
            </p>
            {newsWatch?.lastError ? <p className="mt-1 text-xs text-amber-text">Last check had a problem: {newsWatch.lastError}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex gap-2">
              <label htmlFor="c-news-type" className="sr-only">Type of news</label>
              <select id="c-news-type" name="newsType" defaultValue={newsType} className="field w-auto py-1.5 text-sm">
                <option value="">All types</option>
                {(Object.keys(newsTypeLabels) as NewsType[]).map((t) => <option key={t} value={t}>{newsTypeLabels[t]}</option>)}
              </select>
              <button type="submit" className="btn btn-secondary py-1.5">Show</button>
            </form>
            {editable ? (
              <form action={setNewsPaused}>
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="paused" value={String(!newsWatch?.paused)} />
                <button type="submit" className="btn btn-secondary py-1.5">{newsWatch?.paused ? "Restart news checks" : "Pause news checks"}</button>
              </form>
            ) : null}
          </div>
        </div>
        {news.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">No news found{newsType ? " of this type" : ""} yet.</p>
        ) : (
          <NewsList items={news} />
        )}
      </section>
    </>
  );
}
