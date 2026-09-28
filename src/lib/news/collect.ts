// The daily news run. For each organisation that has turned news on, it looks for news about
// companies that are due a check (most important companies every day, the rest about once a week),
// saves only the headline, source, link and date, and asks the AI for a one line summary.
// Items the AI says are not about the company are removed straight away.
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AiNotConfiguredError, aiIsConfigured } from "@/lib/ai";
import { headlineKey, mentionsCompany, searchTerms, urlHash } from "./match";
import { readFeed, searchNewsService, newsApiConfigured, type SourceItem } from "./sources";
import { reviewNewsItem } from "./review";

const DAY = 24 * 60 * 60 * 1000;
/** Companies that are not most important are checked when their last check was longer ago than this. */
const WEEKLY_GAP = 6.5 * DAY;
const DAILY_GAP = 20 * 60 * 60 * 1000;
/** The same story from another source within this many days is not saved twice. */
const SAME_STORY_DAYS = 14;
/** How far back to look the first time a company is checked. */
const FIRST_LOOK_DAYS = 14;
/** Descriptions waiting for an AI review are deleted after this long, even if the AI is never set up. */
const REVIEW_TEXT_DAYS = 7;

export type NewsRunSummary = {
  at: string;
  source: "API" | "FEEDS";
  companiesChecked: number;
  calls: number;
  found: number;
  saved: number;
  removedNotAbout: number;
  duplicates: number;
  errors: string[];
  stoppedAtLimit: boolean;
};

type Deps = {
  searchService: typeof searchNewsService;
  readFeed: typeof readFeed;
  sleep: (ms: number) => Promise<void>;
  gapMs: number;
};

const defaultDeps: Deps = {
  searchService: searchNewsService,
  readFeed,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  gapMs: 1000,
};

export function isDue(importance: number, lastCheckedAt: Date | null, now: Date) {
  if (!lastCheckedAt) return true;
  const gap = importance === 1 ? DAILY_GAP : WEEKLY_GAP;
  return now.getTime() - lastCheckedAt.getTime() >= gap;
}

/** Runs the news check for every organisation with news turned on, or for one organisation. */
export async function runNewsCollection(opts: { now?: Date; organisationId?: string; deps?: Partial<Deps> } = {}) {
  const now = opts.now ?? new Date();
  const deps = { ...defaultDeps, ...opts.deps };
  const orgs = await prisma.organisation.findMany({
    where: { newsSource: { in: ["API", "FEEDS"] }, ...(opts.organisationId ? { id: opts.organisationId } : {}) },
    select: { id: true, newsSource: true, newsFeeds: true, newsDailyCallLimit: true },
  });
  const summaries: Record<string, NewsRunSummary> = {};
  for (const org of orgs) {
    const summary = await collectForOrganisation(org as { id: string; newsSource: "API" | "FEEDS"; newsFeeds: string[]; newsDailyCallLimit: number }, now, deps);
    await prisma.organisation.update({ where: { id: org.id }, data: { newsLastRunAt: now, newsLastRunSummary: summary } });
    logger.info("News collected", { organisationId: org.id, ...summary, errors: summary.errors.length });
    summaries[org.id] = summary;
  }
  return summaries;
}

async function collectForOrganisation(
  org: { id: string; newsSource: "API" | "FEEDS"; newsFeeds: string[]; newsDailyCallLimit: number },
  now: Date,
  deps: Deps,
): Promise<NewsRunSummary> {
  const summary: NewsRunSummary = { at: now.toISOString(), source: org.newsSource, companiesChecked: 0, calls: 0, found: 0, saved: 0, removedNotAbout: 0, duplicates: 0, errors: [], stoppedAtLimit: false };

  // Finish reviews left over from earlier runs, and delete descriptions that have waited too long.
  await reviewWaiting(org.id, summary);
  await prisma.newsItem.updateMany({ where: { organisationId: org.id, reviewText: { not: null }, createdAt: { lt: new Date(now.getTime() - REVIEW_TEXT_DAYS * DAY) } }, data: { reviewText: null } });

  const companies = await prisma.company.findMany({
    where: { organisationId: org.id, OR: [{ newsWatch: { is: null } }, { newsWatch: { is: { paused: false } } }] },
    select: { id: true, name: true, alternativeNames: true, importance: true, newsWatch: { select: { lastCheckedAt: true, searchTerms: true } } },
    orderBy: [{ importance: "asc" }, { name: "asc" }],
  });
  const due = companies
    .filter((c) => isDue(c.importance, c.newsWatch?.lastCheckedAt ?? null, now))
    .sort((a, b) => (a.newsWatch?.lastCheckedAt?.getTime() ?? 0) - (b.newsWatch?.lastCheckedAt?.getTime() ?? 0) || a.importance - b.importance);

  // With feeds, every feed is read once and each item is matched against the companies.
  let feedItems: SourceItem[] = [];
  if (org.newsSource === "FEEDS") {
    for (const feed of org.newsFeeds) {
      try {
        feedItems.push(...(await deps.readFeed(feed)));
      } catch (error) {
        summary.errors.push(`${feed}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const seen = new Set<string>();
    feedItems = feedItems.filter((i) => (seen.has(urlHash(i.url)) ? false : (seen.add(urlHash(i.url)), true)));
  } else if (!newsApiConfigured()) {
    summary.errors.push("The news service is chosen in settings, but its key (NEWS_API_KEY) is not set on the server.");
    return summary;
  }

  for (const company of due) {
    const terms = company.newsWatch?.searchTerms.length ? company.newsWatch.searchTerms : searchTerms(company.name, company.alternativeNames);
    const since = company.newsWatch?.lastCheckedAt ? new Date(company.newsWatch.lastCheckedAt.getTime() - DAY) : new Date(now.getTime() - FIRST_LOOK_DAYS * DAY);
    let items: SourceItem[];
    let error: string | null = null;

    if (org.newsSource === "API") {
      if (summary.calls >= org.newsDailyCallLimit) {
        summary.stoppedAtLimit = true;
        break;
      }
      if (summary.calls > 0) await deps.sleep(deps.gapMs);
      summary.calls++;
      try {
        items = await deps.searchService(terms, since);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        items = [];
        summary.errors.push(`${company.name}: ${error}`);
      }
    } else {
      items = feedItems.filter((i) => !i.publishedAt || i.publishedAt >= since);
    }

    // Keep only items that really name the company in the headline or description.
    const matching = items.filter((i) => mentionsCompany(`${i.headline} ${i.description ?? ""}`, terms));
    summary.found += matching.length;
    for (const item of matching) await saveItem(org.id, company.id, item, now, summary);

    summary.companiesChecked++;
    await prisma.newsWatch.upsert({
      where: { companyId: company.id },
      create: { organisationId: org.id, companyId: company.id, frequency: company.importance === 1 ? "DAILY" : "WEEKLY", lastCheckedAt: now, lastError: error },
      update: { frequency: company.importance === 1 ? "DAILY" : "WEEKLY", lastCheckedAt: now, lastError: error },
    });
  }

  await reviewWaiting(org.id, summary);
  return summary;
}

async function saveItem(organisationId: string, companyId: string, item: SourceItem, now: Date, summary: NewsRunSummary) {
  const hash = urlHash(item.url);
  const key = headlineKey(item.headline);
  const duplicate = await prisma.newsItem.findFirst({
    where: {
      organisationId,
      companyId,
      OR: [{ urlHash: hash }, ...(key ? [{ headlineKey: key, createdAt: { gte: new Date(now.getTime() - SAME_STORY_DAYS * DAY) } }] : [])],
    },
    select: { id: true },
  });
  if (duplicate) {
    summary.duplicates++;
    return;
  }
  try {
    await prisma.newsItem.create({
      data: {
        organisationId,
        companyId,
        headline: item.headline.slice(0, 300),
        source: item.source.slice(0, 120),
        url: item.url,
        urlHash: hash,
        headlineKey: key || null,
        publishedAt: item.publishedAt,
        reviewText: item.description?.slice(0, 1000) ?? "",
      },
    });
    summary.saved++;
  } catch (error) {
    // Another run saved the same link at the same moment.
    if ((error as { code?: string }).code === "P2002") summary.duplicates++;
    else throw error;
  }
}

/** Asks the AI to review items that are waiting. Items it says are not about the company are removed. */
async function reviewWaiting(organisationId: string, summary: NewsRunSummary) {
  if (!aiIsConfigured()) return;
  const waiting = await prisma.newsItem.findMany({
    where: { organisationId, reviewText: { not: null }, summary: null },
    include: { company: { select: { name: true, customerGroup: true, description: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const item of waiting) {
    try {
      const { result, model } = await reviewNewsItem({ organisationId, company: item.company, headline: item.headline, source: item.source, description: item.reviewText || null });
      if (!result.aboutCompany) {
        await prisma.newsItem.delete({ where: { id: item.id } });
        summary.removedNotAbout++;
        continue;
      }
      await prisma.newsItem.update({
        where: { id: item.id },
        data: { summary: result.summary, openingLine: result.openingLine, relevance: result.relevance, newsType: result.newsType, aiModel: model, reviewText: null },
      });
    } catch (error) {
      if (error instanceof AiNotConfiguredError) return;
      summary.errors.push(`AI review of "${item.headline.slice(0, 60)}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
