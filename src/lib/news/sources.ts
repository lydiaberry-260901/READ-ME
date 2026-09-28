// Where news comes from: a news service (GNews) or RSS news feeds chosen by an admin.
// Only headlines, links, dates, sources and the short description the service provides are read.
// Articles themselves are never fetched, so paywalls and site rules are never worked around.
import { providerFetch } from "@/lib/integrations/http";
import { safeFetch, USER_AGENT } from "@/lib/enrichment/safe-fetch";
import { isAllowedByRobots } from "@/lib/enrichment/robots";

export type SourceItem = { headline: string; description: string | null; url: string; source: string; publishedAt: Date | null };

export function newsApiConfigured() {
  return Boolean(process.env.NEWS_API_KEY);
}

/** Searches the news service for any of the terms, in UK English news since a date. One request. */
export async function searchNewsService(terms: string[], since: Date): Promise<SourceItem[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new Error("The news service is not set up (NEWS_API_KEY).");
  const q = terms.slice(0, 3).map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ").slice(0, 200);
  const params = new URLSearchParams({ q, lang: "en", country: "gb", max: "10", in: "title,description", sortby: "publishedAt", from: since.toISOString(), apikey: key });
  const res = await providerFetch(`https://gnews.io/api/v4/search?${params}`);
  const json = (await res.json()) as { articles?: { title: string; description?: string; url: string; publishedAt?: string; source?: { name?: string } }[] };
  return (json.articles ?? []).map((a) => ({
    headline: a.title,
    description: a.description ?? null,
    url: a.url,
    source: a.source?.name ?? new URL(a.url).hostname,
    publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
  }));
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    // Feeds often carry escaped HTML in descriptions, which only becomes tags once decoded.
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
}

/** Reads the items from an RSS or Atom feed. */
export function parseFeed(xml: string, feedUrl: string): SourceItem[] {
  const channelTitle = tag(xml.split(/<item[\s>]|<entry[\s>]/i)[0] ?? "", "title") ?? new URL(feedUrl).hostname;
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks
    .map((b) => {
      const link = tag(b, "link") || b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] || "";
      const date = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date");
      const published = date ? new Date(date) : null;
      return {
        headline: tag(b, "title") ?? "",
        description: tag(b, "description") ?? tag(b, "summary"),
        url: link.trim(),
        source: tag(b, "source") ?? channelTitle,
        publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
      };
    })
    .filter((i) => i.headline && /^https?:\/\//.test(i.url));
}

/** Fetches one feed, following the site's robots.txt rules, with time and size limits. */
export async function readFeed(url: string): Promise<SourceItem[]> {
  const origin = new URL(url);
  try {
    const robots = await safeFetch(new URL("/robots.txt", origin).toString(), { timeoutMs: 5000, maxBytes: 200_000, accept: "text/plain" });
    if (robots.status === 200 && !isAllowedByRobots(robots.body, USER_AGENT, origin.pathname)) {
      throw new Error("The site asks automated visitors not to read this feed.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The site asks")) throw error;
    // No robots.txt: feeds are published to be read.
  }
  const res = await safeFetch(url, { timeoutMs: 10_000, maxBytes: 3_000_000, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
  if (res.status >= 400) throw new Error(`The feed replied with error ${res.status}.`);
  return parseFeed(res.body, url);
}
