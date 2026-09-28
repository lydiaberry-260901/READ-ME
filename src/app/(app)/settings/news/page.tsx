import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { newsApiConfigured } from "@/lib/news/sources";
import { aiIsConfigured } from "@/lib/ai";
import type { NewsRunSummary } from "@/lib/news/collect";
import { PageHeader, Notice } from "@/components/ui";
import { CheckNowButton, NewsSettingsForm } from "./NewsSettingsForm";

export const metadata = { title: "News settings" };

export default async function NewsSettingsPage() {
  const user = await requireCapability("settings.manage");
  const [org, watched, paused, withErrors] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { newsSource: true, newsFeeds: true, newsDailyCallLimit: true, newsLastRunAt: true, newsLastRunSummary: true } }),
    prisma.company.count({ where: { organisationId: user.organisationId } }),
    prisma.newsWatch.count({ where: { organisationId: user.organisationId, paused: true } }),
    prisma.newsWatch.findMany({ where: { organisationId: user.organisationId, lastError: { not: null } }, include: { company: { select: { name: true } } }, take: 10 }),
  ]);
  const run = org.newsLastRunSummary as NewsRunSummary | null;

  return (
    <>
      <PageHeader
        title="News settings"
        description="News about companies is looked for every morning at 06:30: companies with importance 1 every day, the rest about once a week. Only the headline, source, link, date and a short AI summary are kept."
      />
      {!aiIsConfigured() ? (
        <div className="mb-8 max-w-2xl">
          <Notice tone="amber" title="The AI is not set up">News is still saved, but without summaries or relevance, and nothing is checked for being about the right company until an AI key is added.</Notice>
        </div>
      ) : null}
      <div className="grid gap-12 xl:grid-cols-[1fr_1fr]">
        <NewsSettingsForm settings={{ newsSource: org.newsSource, newsFeeds: org.newsFeeds, newsDailyCallLimit: org.newsDailyCallLimit }} apiKeySet={newsApiConfigured()} />
        <section aria-labelledby="last-run-heading" className="grid content-start gap-4">
          <div>
            <h2 id="last-run-heading" className="text-sm font-semibold">Last check</h2>
            {org.newsLastRunAt && run ? (
              <dl className="mt-3 grid grid-cols-[12rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-fg-muted">When</dt><dd>{formatDateTime(org.newsLastRunAt)}</dd>
                <dt className="text-fg-muted">Companies checked</dt><dd className="tabular-nums">{run.companiesChecked}</dd>
                {run.source === "API" ? <><dt className="text-fg-muted">Searches used</dt><dd className="tabular-nums">{run.calls} of {org.newsDailyCallLimit}{run.stoppedAtLimit ? ", stopped at the limit" : ""}</dd></> : null}
                <dt className="text-fg-muted">Items naming a company</dt><dd className="tabular-nums">{run.found}</dd>
                <dt className="text-fg-muted">New items saved</dt><dd className="tabular-nums">{run.saved}</dd>
                <dt className="text-fg-muted">Already saved</dt><dd className="tabular-nums">{run.duplicates}</dd>
                <dt className="text-fg-muted">Removed, not about the company</dt><dd className="tabular-nums">{run.removedNotAbout}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-fg-muted">Not run yet.</p>
            )}
            {run?.errors.length ? (
              <div className="mt-4">
                <Notice tone="amber" title="Problems during the last check">
                  <ul className="list-disc pl-5">{run.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>
                </Notice>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-fg-muted">{watched} companies in the CRM, {paused} with news checks paused. Pause a company from its own page.</p>
          {withErrors.length ? (
            <div className="text-sm">
              <h3 className="font-semibold">Companies whose last check had a problem</h3>
              <ul className="mt-1 list-disc pl-5 text-fg-muted">{withErrors.map((w) => <li key={w.id}>{w.company.name}: {w.lastError}</li>)}</ul>
            </div>
          ) : null}
          {org.newsSource !== "OFF" ? <CheckNowButton /> : null}
        </section>
      </div>
    </>
  );
}
