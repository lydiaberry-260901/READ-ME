import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { headlineKey, mentionsCompany, normaliseUrl, searchTerms, urlHash } from "@/lib/news/match";
import { parseFeed } from "@/lib/news/sources";
import { makeNewsChecker } from "@/lib/news/review";
import { isDue } from "@/lib/news/collect";
import { AiAnswerError } from "@/lib/ai";

describe("matching news to companies", () => {
  it("searches for the name without legal endings, plus other names", () => {
    expect(searchTerms("Harbourline Real Estate Partners Limited", ["Harbourline REP"])).toEqual(["Harbourline Real Estate Partners", "Harbourline REP"]);
  });

  it("drops names that are too common to mean anything", () => {
    expect(searchTerms("Holdings", ["UK"])).toEqual([]);
  });

  it("matches the whole name, not part of another word", () => {
    const terms = searchTerms("Kestrel Urban Logistics");
    expect(mentionsCompany("Kestrel Urban Logistics buys a warehouse", terms)).toBe(true);
    expect(mentionsCompany("kestrel urban logistics buys a warehouse", terms)).toBe(true);
    expect(mentionsCompany("Kestrel Urban Logisticsplus launches", terms)).toBe(false);
  });

  it("needs the capital letter for a one word name, avoiding ordinary words", () => {
    expect(mentionsCompany("Pennant opens new stores", ["Pennant"])).toBe(true);
    expect(mentionsCompany("The club raised a pennant after the win", ["Pennant"])).toBe(false);
  });

  it("ignores very short one word names", () => {
    expect(mentionsCompany("BRE publishes guidance", ["BRE"])).toBe(false);
  });
});

describe("spotting the same story twice", () => {
  it("ignores tracking parts of a link", () => {
    expect(normaliseUrl("https://WWW.Example.com/story/?utm_source=x&id=4&fbclid=abc#top")).toBe("https://example.com/story/?id=4");
    expect(urlHash("https://example.com/a?utm_medium=email")).toBe(urlHash("https://www.example.com/a"));
  });

  it("gives the same headline key to the same story from different sources", () => {
    expect(headlineKey("Harbourline buys two Manchester offices - Property Week")).toBe(headlineKey("Harbourline Buys Two Manchester Offices"));
  });
});

describe("reading news feeds", () => {
  it("reads RSS items with their dates and sources", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Trade press</title>
      <item><title><![CDATA[Pennant Retail Group raises funding]]></title><link>https://example.com/a</link><pubDate>Mon, 28 Sep 2026 07:00:00 GMT</pubDate><description>&lt;p&gt;Money for stores&lt;/p&gt;</description></item>
      <item><title>No link here</title></item>
    </channel></rss>`;
    const items = parseFeed(xml, "https://example.com/feed");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ headline: "Pennant Retail Group raises funding", url: "https://example.com/a", source: "Trade press", description: "Money for stores" });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-09-28T07:00:00.000Z");
  });

  it("reads Atom entries", () => {
    const xml = `<feed><title>Atom news</title><entry><title>Kestrel starts refit</title><link href="https://example.com/b"/><updated>2026-09-27T10:00:00Z</updated><summary>Work begins</summary></entry></feed>`;
    expect(parseFeed(xml, "https://example.com/atom")[0]).toMatchObject({ headline: "Kestrel starts refit", url: "https://example.com/b", source: "Atom news" });
  });
});

describe("checking the AI's review", () => {
  const source = "Headline: Pennant raises £20m to upgrade 40 stores";
  const good = { aboutCompany: true, relevance: 4, newsType: "FUND_RAISE", summary: "Pennant raised £20m to upgrade 40 stores.", openingLine: "I saw the news about upgrading 40 stores." };

  it("accepts a sound answer", () => {
    expect(makeNewsChecker(source)(good)).toMatchObject({ relevance: 4, newsType: "FUND_RAISE" });
  });

  it("rejects figures that were not in the news", () => {
    expect(() => makeNewsChecker(source)({ ...good, summary: "Pennant raised £25m." })).toThrow(AiAnswerError);
  });

  it("rejects a relevance outside 1 to 5", () => {
    expect(() => makeNewsChecker(source)({ ...good, relevance: 7 })).toThrow(AiAnswerError);
  });

  it("removes dashes used as punctuation", () => {
    expect(makeNewsChecker(source)({ ...good, summary: "Pennant raised money - for stores." }).summary).not.toMatch(/\s-\s/);
  });
});

describe("when a company is due a check", () => {
  const now = new Date("2026-09-28T05:30:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it("checks the most important companies every day and the rest weekly", () => {
    expect(isDue(1, null, now)).toBe(true);
    expect(isDue(1, hoursAgo(24), now)).toBe(true);
    expect(isDue(1, hoursAgo(2), now)).toBe(false);
    expect(isDue(2, hoursAgo(24 * 3), now)).toBe(false);
    expect(isDue(3, hoursAgo(24 * 7), now)).toBe(true);
  });
});

// Database tests: the whole daily run with a pretend news service and a pretend AI.
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { runNewsCollection } from "@/lib/news/collect";
import { setAiProviderForTests, type AiProvider } from "@/lib/ai";
import { ClaudeProvider } from "@/lib/ai/claude";
import type { SourceItem } from "@/lib/news/sources";

describe.skipIf(!hasTestDb)("the daily news run", () => {
  const now = new Date("2026-09-28T05:30:00Z");
  let orgId = "";
  let reviewed: string[] = [];

  const fakeAi: AiProvider = {
    name: "fake",
    isConfigured: () => true,
    async generateStructured(req) {
      reviewed.push(req.user);
      const aboutCompany = !req.user.includes("pennant flag");
      return { data: { aboutCompany, relevance: 4, newsType: "FUND_RAISE", summary: "Pennant raised money for its stores.", openingLine: "I saw the news about your stores." }, model: "fake-model", inputTokens: 10, outputTokens: 10 };
    },
  };

  const story = (headline: string, url: string, description = "Money for stores"): SourceItem => ({ headline, url, description, source: "Example News", publishedAt: new Date("2026-09-27T09:00:00Z") });

  beforeEach(async () => {
    await resetTestDb();
    reviewed = [];
    setAiProviderForTests(fakeAi);
    process.env.NEWS_API_KEY = "test-key";
    const org = await createOrganisation(testDb, "Moca");
    orgId = org.id;
    await testDb.organisation.update({ where: { id: orgId }, data: { newsSource: "API", newsDailyCallLimit: 10 } });
  });
  afterAll(() => {
    setAiProviderForTests(new ClaudeProvider());
    delete process.env.NEWS_API_KEY;
  });

  const deps = (results: Record<string, SourceItem[]>, calls: string[] = []) => ({
    gapMs: 0,
    sleep: async () => {},
    searchService: async (terms: string[]) => {
      calls.push(terms[0]);
      return results[terms[0]] ?? [];
    },
  });

  it("saves only headline, source, link, date and an AI summary, and deletes the service's description after review", async () => {
    await testDb.company.create({ data: { organisationId: orgId, name: "Pennant Retail Group", importance: 1 } });
    await runNewsCollection({ now, deps: deps({ "Pennant Retail Group": [story("Pennant Retail Group raises funding", "https://example.com/a?utm_source=x")] }) });
    const items = await testDb.newsItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ headline: "Pennant Retail Group raises funding", source: "Example News", summary: "Pennant raised money for its stores.", relevance: 4, newsType: "FUND_RAISE", reviewText: null, status: "NEW" });
    const org = await testDb.organisation.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.newsLastRunAt?.toISOString()).toBe(now.toISOString());
    expect(org.newsLastRunSummary).toMatchObject({ companiesChecked: 1, calls: 1, saved: 1 });
  });

  it("removes items the AI says are about someone else, and skips items that do not name the company", async () => {
    await testDb.company.create({ data: { organisationId: orgId, name: "Pennant Retail Group", importance: 1 } });
    await runNewsCollection({
      now,
      deps: deps({
        "Pennant Retail Group": [
          story("Pennant Retail Group pennant flag sale", "https://example.com/flag"),
          story("Retail sales rise in September", "https://example.com/other", "Shops did well"),
        ],
      }),
    });
    expect(await testDb.newsItem.count()).toBe(0);
    expect(reviewed).toHaveLength(1);
  });

  it("never saves the same story twice, by link or by headline", async () => {
    await testDb.company.create({ data: { organisationId: orgId, name: "Pennant Retail Group", importance: 1 } });
    const first = deps({ "Pennant Retail Group": [story("Pennant Retail Group raises funding", "https://example.com/a")] });
    await runNewsCollection({ now, deps: first });
    const later = new Date(now.getTime() + 24 * 3_600_000);
    await runNewsCollection({
      now: later,
      deps: deps({ "Pennant Retail Group": [story("Pennant Retail Group raises funding", "https://www.example.com/a?utm_medium=email"), story("Pennant Retail Group raises funding - Other Paper", "https://other.example.com/x")] }),
    });
    expect(await testDb.newsItem.count()).toBe(1);
    const org = await testDb.organisation.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.newsLastRunSummary).toMatchObject({ duplicates: 2, saved: 0 });
  });

  it("keeps to the daily search limit and skips paused companies", async () => {
    await testDb.organisation.update({ where: { id: orgId }, data: { newsDailyCallLimit: 2 } });
    for (const name of ["Alpha Estates One", "Bravo Estates Two", "Charlie Estates Three"]) await testDb.company.create({ data: { organisationId: orgId, name, importance: 1 } });
    const paused = await testDb.company.create({ data: { organisationId: orgId, name: "Delta Estates Four", importance: 1 } });
    await testDb.newsWatch.create({ data: { organisationId: orgId, companyId: paused.id, paused: true } });
    const calls: string[] = [];
    await runNewsCollection({ now, deps: deps({}, calls) });
    expect(calls).toHaveLength(2);
    expect(calls).not.toContain("Delta Estates Four");
    const org = await testDb.organisation.findUniqueOrThrow({ where: { id: orgId } });
    expect(org.newsLastRunSummary).toMatchObject({ stoppedAtLimit: true, calls: 2 });
  });

  it("checks less important companies weekly, not daily", async () => {
    await testDb.company.create({ data: { organisationId: orgId, name: "Oakbridge Hotels", importance: 3 } });
    const calls: string[] = [];
    await runNewsCollection({ now, deps: deps({}, calls) });
    await runNewsCollection({ now: new Date(now.getTime() + 24 * 3_600_000), deps: deps({}, calls) });
    await runNewsCollection({ now: new Date(now.getTime() + 7 * 24 * 3_600_000), deps: deps({}, calls) });
    expect(calls).toEqual(["Oakbridge Hotels", "Oakbridge Hotels"]);
  });

  it("records a failed search on the company without stopping the run", async () => {
    const a = await testDb.company.create({ data: { organisationId: orgId, name: "Alpha Estates One", importance: 1 } });
    await testDb.company.create({ data: { organisationId: orgId, name: "Bravo Estates Two", importance: 1 } });
    const calls: string[] = [];
    await runNewsCollection({
      now,
      deps: {
        gapMs: 0,
        sleep: async () => {},
        searchService: async (terms: string[]) => {
          calls.push(terms[0]);
          if (terms[0] === "Alpha Estates One") throw new Error("The news service is busy.");
          return [];
        },
      },
    });
    expect(calls).toHaveLength(2);
    expect((await testDb.newsWatch.findUniqueOrThrow({ where: { companyId: a.id } })).lastError).toBe("The news service is busy.");
  });

  it("does nothing for organisations that have news switched off", async () => {
    await testDb.organisation.update({ where: { id: orgId }, data: { newsSource: "OFF" } });
    await testDb.company.create({ data: { organisationId: orgId, name: "Pennant Retail Group", importance: 1 } });
    const calls: string[] = [];
    await runNewsCollection({ now, deps: deps({}, calls) });
    expect(calls).toHaveLength(0);
  });
});
