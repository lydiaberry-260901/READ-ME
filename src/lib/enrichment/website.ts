// Reads the public home page of a company's website, following the site's robots.txt rules.
// Saves only the page title, description and a short text excerpt.
import { isAllowedByRobots } from "./robots";
import { safeFetch, USER_AGENT } from "./safe-fetch";
import { redactPersonalDetails, truncate } from "@/lib/text";
import type { WebsiteDetails } from "./types";

// Wait at least this long between visits to the same website.
const MIN_GAP_MS = 10_000;
const lastVisit = new Map<string, number>();

async function politeWait(host: string) {
  const last = lastVisit.get(host) ?? 0;
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastVisit.set(host, Date.now());
}

export function normaliseWebsite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes(".")) return null;
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return null;
  }
}

/** Cleaned domain used to spot duplicate companies: lower case, without "www." */
export function domainFromWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalised = normaliseWebsite(input);
  if (!normalised) return null;
  return new URL(normalised).hostname.replace(/^www\./, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : undefined;
}

export function extractPageDetails(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: title ? truncate(decodeEntities(title).replace(/\s+/g, " ").trim(), 200) : undefined,
    description: truncate(metaContent(html, "description") ?? metaContent(html, "og:description") ?? "", 500) || undefined,
    textExcerpt: text ? truncate(redactPersonalDetails(text), 2500) : undefined,
  };
}

export async function fetchWebsiteDetails(website: string): Promise<WebsiteDetails> {
  const fetchedAt = new Date().toISOString();
  const normalised = normaliseWebsite(website);
  if (!normalised) return { status: "failed", fetchedAt, error: "The website address does not look right." };
  const home = new URL(normalised);

  try {
    await politeWait(home.hostname);
    // Follow the site's rules for automated visitors. If robots.txt cannot be read, treat everything as allowed,
    // which is the usual convention.
    try {
      const robots = await safeFetch(new URL("/robots.txt", home).toString(), { timeoutMs: 5000, maxBytes: 200_000, accept: "text/plain" });
      if (robots.status === 200 && !isAllowedByRobots(robots.body, USER_AGENT, home.pathname || "/")) {
        return { status: "blocked_by_robots", fetchedAt, url: home.toString(), error: "The website asks automated visitors not to read this page, so we did not." };
      }
    } catch {
      // No robots.txt, or it could not be reached.
    }

    const page = await safeFetch(home.toString());
    if (page.status >= 400) return { status: "failed", fetchedAt, url: page.url, error: `The website replied with error ${page.status}.` };
    if (!page.contentType.includes("html")) return { status: "failed", fetchedAt, url: page.url, error: "The website did not return a web page." };
    return { status: "ok", fetchedAt, url: page.url, ...extractPageDetails(page.body) };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "The website took too long to reply." : error instanceof Error ? error.message : "The website could not be read.";
    return { status: "failed", fetchedAt, url: home.toString(), error: message };
  }
}
