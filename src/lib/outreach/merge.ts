// Merge fields: placeholders like {{contact.firstName}} in templates, filled in for each contact.

export const MERGE_FIELDS = [
  { key: "contact.firstName", label: "Contact first name", sample: "Grace" },
  { key: "contact.lastName", label: "Contact last name", sample: "Okafor" },
  { key: "contact.jobTitle", label: "Contact job title", sample: "Head of ESG" },
  { key: "company.name", label: "Company name", sample: "Harbourline Real Estate Partners" },
  { key: "company.summary", label: "Why this company matters to Moca", sample: "Harbourline owns multi let UK offices where EPC ratings affect lettings and value." },
  { key: "news.headline", label: "Latest news headline", sample: "Harbourline completes purchase of a Manchester office building" },
  { key: "sender.name", label: "Your name", sample: "Aisha Rahman" },
  { key: "sender.jobTitle", label: "Your job title", sample: "Account Executive" },
  { key: "sender.email", label: "Your email", sample: "aisha@moca.energy" },
] as const;

export type MergeKey = (typeof MERGE_FIELDS)[number]["key"];
export type MergeValues = Partial<Record<MergeKey, string | null | undefined>>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g;
const KNOWN = new Set<string>(MERGE_FIELDS.map((f) => f.key));

export const sampleMergeValues: MergeValues = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f.sample]));

/** Every placeholder used in the text, in order, without repeats. */
export function findPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** Placeholders that are not real merge fields, usually a typing mistake. */
export function unknownPlaceholders(text: string): string[] {
  return findPlaceholders(text).filter((p) => !KNOWN.has(p));
}

/**
 * Fills in placeholders. Missing values are left visible as [[field]] so nobody sends an email
 * with a gap, and are listed in `missing` so the screen can warn about them.
 */
export function renderTemplate(text: string, values: MergeValues): { text: string; missing: MergeKey[] } {
  const missing = new Set<MergeKey>();
  const out = text.replace(PLACEHOLDER, (whole, key: string) => {
    if (!KNOWN.has(key)) return whole;
    const value = values[key as MergeKey];
    if (value === null || value === undefined || value.trim() === "") {
      missing.add(key as MergeKey);
      return `[[${key}]]`;
    }
    return value.trim();
  });
  return { text: out, missing: [...missing] };
}

export function hasUnfilledGaps(text: string): boolean {
  return /\[\[[a-zA-Z]+\.[a-zA-Z]+\]\]/.test(text);
}
