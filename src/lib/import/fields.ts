// The fields a CSV file can be matched to. Only business details are offered, never sensitive ones.

export const IMPORT_FIELDS = [
  { key: "companyName", label: "Company name", group: "Company", hints: ["company", "company name", "organisation", "organization", "account", "account name", "business"] },
  { key: "website", label: "Website", group: "Company", hints: ["website", "web", "url", "domain", "site", "company website"] },
  { key: "customerGroup", label: "Customer group", group: "Company", hints: ["customer group", "segment", "group", "type", "category"] },
  { key: "importance", label: "Importance (1 to 3)", group: "Company", hints: ["importance", "priority", "tier"] },
  { key: "description", label: "Description", group: "Company", hints: ["description", "about", "company description"] },
  { key: "portfolioSize", label: "Portfolio size", group: "Company", hints: ["portfolio", "portfolio size", "sq ft", "size", "aum"] },
  { key: "headOffice", label: "Head office", group: "Company", hints: ["head office", "hq", "headquarters", "city", "location"] },
  { key: "companiesHouseNumber", label: "Companies House number", group: "Company", hints: ["companies house", "company number", "crn", "registration number", "company reg"] },
  { key: "tags", label: "Tags (separated by ;)", group: "Company", hints: ["tags", "tag", "labels"] },
  { key: "firstName", label: "First name", group: "Contact", hints: ["first name", "firstname", "given name", "forename"] },
  { key: "lastName", label: "Last name", group: "Contact", hints: ["last name", "lastname", "surname", "family name"] },
  { key: "fullName", label: "Full name (if not split)", group: "Contact", hints: ["name", "full name", "contact name", "contact"] },
  { key: "jobTitle", label: "Job title", group: "Contact", hints: ["job title", "title", "position", "role"] },
  { key: "email", label: "Work email", group: "Contact", hints: ["email", "e-mail", "email address", "work email"] },
  { key: "phone", label: "Work phone", group: "Contact", hints: ["phone", "telephone", "tel", "mobile", "work phone", "direct dial"] },
  { key: "linkedinUrl", label: "Public professional profile link", group: "Contact", hints: ["linkedin", "linkedin url", "profile", "profile url"] },
  { key: "entityType", label: "Business type (limited company, sole trader...)", group: "Contact", hints: ["entity type", "business type", "legal form", "company type"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Suggests which CSV column fits each field, from the column headings. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const match =
      headers.find((h) => !used.has(h) && field.hints.some((hint) => clean(h) === clean(hint))) ??
      headers.find((h) => !used.has(h) && field.hints.some((hint) => clean(hint).length > 3 && clean(h).includes(clean(hint))));
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  }
  // "Name" alone is ambiguous when the file also has first and last names.
  if (mapping.fullName && mapping.firstName) delete mapping.fullName;
  return mapping;
}
