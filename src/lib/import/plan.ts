// Checks each imported row and works out what should happen to it, including spotting duplicates.
// Pure functions with no database calls, so they are easy to test.
import type { ContactEntityType, CustomerGroup } from "@/generated/prisma/enums";
import { domainFromWebsite, normaliseWebsite } from "@/lib/enrichment/website";
import { normaliseCompanyNumber } from "@/lib/enrichment/companies-house";
import { normaliseEmail } from "@/lib/crypto";
import type { ColumnMapping, ImportFieldKey } from "./fields";

export type RawRow = Record<string, string>;

export type CleanRow = {
  company: {
    name: string;
    website: string | null;
    domain: string | null;
    customerGroup: CustomerGroup | null;
    importance: number | null;
    description: string | null;
    portfolioSize: string | null;
    headOffice: string | null;
    companiesHouseNumber: string | null;
    tags: string[];
  } | null;
  contact: {
    firstName: string;
    lastName: string | null;
    jobTitle: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    entityType: ContactEntityType | null;
  } | null;
};

export type CompanyAction =
  | { kind: "create"; key: string }
  | { kind: "existing"; id: string }
  | { kind: "same_as_row"; key: string; row: number }
  | { kind: "none" };

export type ContactAction =
  | { kind: "create" }
  | { kind: "update"; id: string }
  | { kind: "skip"; reason: string }
  | { kind: "none" };

export type RowPlan = {
  row: number; // 1 based, matching the line in the file after the heading row
  clean: CleanRow;
  company: CompanyAction;
  contact: ContactAction;
  errors: string[];
  warnings: string[];
};

export type ExistingRecords = {
  companiesByDomain: Map<string, string>;
  companiesByName: Map<string, string>;
  contactsByEmail: Map<string, string>;
  /** Normalised emails that are on the opt out list. */
  suppressedEmails: Set<string>;
};

export type PlanOptions = {
  duplicateContacts: "skip" | "update";
};

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "live.co.uk",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com", "btinternet.com", "sky.com", "virginmedia.com",
  "protonmail.com", "proton.me",
]);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True for addresses at free personal email services, which should not be recorded as work emails. */
export function isPersonalEmail(email: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.has(normaliseEmail(email).split("@")[1] ?? "");
}

/** Lower case, without punctuation or endings such as Ltd, Limited, PLC or LLP. Used to match company names. */
export function normaliseCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|ltd|limited|plc|llp|lp|inc|uk|group|holdings)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCustomerGroup(value: string): CustomerGroup | null | "invalid" {
  const v = value.toLowerCase().trim();
  if (!v) return null;
  if (/(asset|esg|fund|investor|investment)/.test(v)) return "ASSET_ESG";
  if (/(property manager|managing agent|agent|property management)/.test(v)) return "PROPERTY_MANAGER";
  if (/(occupier|tenant)/.test(v)) return "OCCUPIER";
  return "invalid";
}

export function parseEntityType(value: string): ContactEntityType | null {
  const v = value.toLowerCase().trim();
  if (!v) return null;
  if (/sole trader|self employed/.test(v)) return "SOLE_TRADER";
  if (/\bllp\b|limited liability partnership/.test(v)) return "LLP";
  if (/partnership/.test(v)) return "PARTNERSHIP";
  if (/public|council|government|nhs|authority/.test(v)) return "PUBLIC_BODY";
  if (/limited|ltd|plc|company/.test(v)) return "LIMITED_COMPANY";
  return "UNKNOWN";
}

function read(raw: RawRow, mapping: ColumnMapping, key: ImportFieldKey): string {
  const col = mapping[key];
  return col ? (raw[col] ?? "").trim() : "";
}

export function cleanRow(raw: RawRow, mapping: ColumnMapping): { clean: CleanRow; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (k: ImportFieldKey) => read(raw, mapping, k);

  // Company
  let company: CleanRow["company"] = null;
  const companyName = get("companyName");
  if (companyName) {
    const websiteRaw = get("website");
    const website = websiteRaw ? normaliseWebsite(websiteRaw) : null;
    if (websiteRaw && !website) warnings.push(`The website "${websiteRaw}" does not look right, so it was left out.`);
    const group = parseCustomerGroup(get("customerGroup"));
    if (group === "invalid") warnings.push(`The customer group "${get("customerGroup")}" was not recognised, so it was left blank.`);
    const importanceRaw = get("importance");
    const importance = importanceRaw ? Number(importanceRaw) : null;
    if (importanceRaw && !(importance === 1 || importance === 2 || importance === 3)) warnings.push("Importance must be 1, 2 or 3, so it was left at the usual level.");
    const chRaw = get("companiesHouseNumber");
    const ch = normaliseCompanyNumber(chRaw);
    if (chRaw && !ch) warnings.push(`The Companies House number "${chRaw}" does not look right, so it was left out.`);
    company = {
      name: companyName.slice(0, 200),
      website,
      domain: domainFromWebsite(website),
      customerGroup: group === "invalid" ? null : group,
      importance: importance === 1 || importance === 2 || importance === 3 ? importance : null,
      description: get("description") || null,
      portfolioSize: get("portfolioSize") || null,
      headOffice: get("headOffice") || null,
      companiesHouseNumber: ch,
      tags: get("tags").split(/[;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
    };
  }

  // Contact
  let contact: CleanRow["contact"] = null;
  let firstName = get("firstName");
  let lastName = get("lastName");
  if (!firstName && get("fullName")) {
    const parts = get("fullName").split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }
  const emailRaw = get("email");
  const phone = get("phone");
  if (firstName || emailRaw || phone) {
    let email: string | null = null;
    if (emailRaw) {
      if (!EMAIL_RE.test(emailRaw)) {
        errors.push(`The email address "${emailRaw}" does not look right.`);
      } else if (PERSONAL_EMAIL_DOMAINS.has(normaliseEmail(emailRaw).split("@")[1])) {
        errors.push("This looks like a personal email address. Only work email addresses may be recorded.");
      } else {
        email = normaliseEmail(emailRaw);
      }
    }
    if (!firstName) errors.push("The contact has no first name.");
    if (!email && !phone && errors.length === 0) errors.push("The contact has no work email or phone number.");
    const linkedin = get("linkedinUrl");
    contact = {
      firstName: firstName.slice(0, 100),
      lastName: lastName ? lastName.slice(0, 100) : null,
      jobTitle: get("jobTitle") || null,
      email,
      phone: phone || null,
      linkedinUrl: linkedin && /^https?:\/\//i.test(linkedin) ? linkedin : null,
      entityType: parseEntityType(get("entityType")),
    };
  }

  if (!company && !contact) errors.push("The row has no company name and no contact details.");
  return { clean: { company, contact }, errors, warnings };
}

/** Works out what to do with every row, spotting duplicates within the file and against existing records. */
export function planImport(rows: RawRow[], mapping: ColumnMapping, existing: ExistingRecords, options: PlanOptions): RowPlan[] {
  const companiesInFile = new Map<string, { key: string; row: number }>(); // by domain or name
  const emailsInFile = new Map<string, number>();
  const plans: RowPlan[] = [];

  rows.forEach((raw, i) => {
    const rowNumber = i + 1;
    const { clean, errors, warnings } = cleanRow(raw, mapping);
    let company: CompanyAction = { kind: "none" };
    let contact: ContactAction = { kind: "none" };

    if (clean.company) {
      const nameKey = normaliseCompanyName(clean.company.name);
      const domainKey = clean.company.domain;
      const existingId =
        (domainKey && existing.companiesByDomain.get(domainKey)) || (nameKey && existing.companiesByName.get(nameKey)) || null;
      const inFile = (domainKey && companiesInFile.get(`d:${domainKey}`)) || companiesInFile.get(`n:${nameKey}`);

      if (existingId) {
        company = { kind: "existing", id: existingId };
      } else if (inFile) {
        company = { kind: "same_as_row", key: inFile.key, row: inFile.row };
      } else {
        const key = domainKey ? `d:${domainKey}` : `n:${nameKey}`;
        company = { kind: "create", key };
        if (domainKey) companiesInFile.set(`d:${domainKey}`, { key, row: rowNumber });
        companiesInFile.set(`n:${nameKey}`, { key, row: rowNumber });
      }
    }

    if (clean.contact) {
      const email = clean.contact.email;
      if (errors.length > 0) {
        contact = { kind: "skip", reason: errors[0] };
      } else if (email && existing.suppressedEmails.has(email)) {
        contact = { kind: "skip", reason: "This person has asked not to be contacted, so they were not imported." };
      } else if (email && emailsInFile.has(email)) {
        contact = { kind: "skip", reason: `Same email address as row ${emailsInFile.get(email)}.` };
      } else if (email && existing.contactsByEmail.has(email)) {
        contact =
          options.duplicateContacts === "update"
            ? { kind: "update", id: existing.contactsByEmail.get(email)! }
            : { kind: "skip", reason: "A contact with this email address already exists." };
      } else {
        contact = { kind: "create" };
      }
      if (email && !emailsInFile.has(email)) emailsInFile.set(email, rowNumber);
    }

    plans.push({ row: rowNumber, clean, company, contact, errors, warnings });
  });

  return plans;
}

export function summarisePlan(plans: RowPlan[]) {
  return {
    rows: plans.length,
    companiesToCreate: plans.filter((p) => p.company.kind === "create").length,
    companiesExisting: plans.filter((p) => p.company.kind === "existing").length,
    companiesRepeated: plans.filter((p) => p.company.kind === "same_as_row").length,
    contactsToCreate: plans.filter((p) => p.contact.kind === "create").length,
    contactsToUpdate: plans.filter((p) => p.contact.kind === "update").length,
    contactsSkipped: plans.filter((p) => p.contact.kind === "skip").length,
    rowsWithProblems: plans.filter((p) => p.errors.length > 0 && p.company.kind === "none").length,
  };
}
