// Deciding whether a story is about a company, and spotting the same story twice.
import { createHash } from "node:crypto";

// Words too common to identify a company on their own.
const GENERIC = new Set(["group", "holdings", "partners", "property", "properties", "estates", "capital", "investments", "management", "services", "limited", "ltd", "plc", "uk", "the"]);

/** The names to search for: the company name without legal endings, plus any other names it is known by. */
export function searchTerms(name: string, alternativeNames: string[] = []): string[] {
  const clean = (s: string) => s.replace(/\b(limited|ltd\.?|plc|llp)\b/gi, "").replace(/\s+/g, " ").trim();
  const terms = [clean(name), ...alternativeNames.map(clean)].filter((t) => t.length >= 3);
  return [...new Set(terms)].filter((t) => !GENERIC.has(t.toLowerCase()));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when the text names the company as a whole phrase. Single short common words are ignored,
 * which avoids obvious wrong matches such as a company called "Pennant" matching any pennant.
 */
export function mentionsCompany(text: string, terms: string[]): boolean {
  return terms.some((term) => {
    const words = term.split(/\s+/);
    if (words.length === 1 && term.length < 5) return false;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "iu");
    // A single word must appear with its capital letter, so "pennant" in ordinary text does not count.
    if (words.length === 1) return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "u").test(text);
    return re.test(text);
  });
}

/** The link without tracking parts, so the same story from a newsletter and a feed matches. */
export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|cmpid)/i.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

export function urlHash(url: string): string {
  return createHash("sha256").update(normaliseUrl(url)).digest("hex");
}

/** A simplified headline, so the same story from different sources can be spotted. */
export function headlineKey(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/\s[-|:]\s.*$/, "") // drop " - Source name" endings
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|to|of|in|on|for|and|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
