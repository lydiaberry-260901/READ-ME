// Looks up a company on Companies House (the UK register of companies), using its public API.
// Only the company record is saved. Officers and people with significant control are not fetched.
import type { CompaniesHouseDetails } from "./types";

const API = "https://api.company-information.service.gov.uk";

/** Companies House numbers are 8 characters, for example 01234567 or SC123456. */
export function normaliseCompanyNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(cleaned)) return null;
  return /^\d+$/.test(cleaned) ? cleaned.padStart(8, "0") : cleaned;
}

function titleCase(s: string) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchCompaniesHouseDetails(rawNumber: string): Promise<CompaniesHouseDetails> {
  const fetchedAt = new Date().toISOString();
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return { status: "not_configured", fetchedAt, error: "Companies House lookup is not set up yet (COMPANIES_HOUSE_API_KEY)." };
  const number = normaliseCompanyNumber(rawNumber);
  if (!number) return { status: "failed", fetchedAt, error: "That Companies House number does not look right." };

  try {
    const response = await fetch(`${API}/company/${encodeURIComponent(number)}`, {
      headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return { status: "not_found", fetchedAt, companyNumber: number, error: "No company with that number was found." };
    if (response.status === 429) return { status: "failed", fetchedAt, companyNumber: number, error: "Companies House is busy. Please try again in a few minutes." };
    if (!response.ok) return { status: "failed", fetchedAt, companyNumber: number, error: `Companies House replied with error ${response.status}.` };

    const data = (await response.json()) as {
      company_name?: string;
      company_status?: string;
      type?: string;
      date_of_creation?: string;
      sic_codes?: string[];
      registered_office_address?: Record<string, string | undefined>;
    };
    const addr = data.registered_office_address ?? {};
    const registeredOffice = [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code, addr.country]
      .filter(Boolean)
      .join(", ");
    return {
      status: "ok",
      fetchedAt,
      companyNumber: number,
      companyName: data.company_name,
      companyStatus: data.company_status ? titleCase(data.company_status) : undefined,
      companyType: data.type ? titleCase(data.type) : undefined,
      incorporatedOn: data.date_of_creation,
      sicCodes: data.sic_codes ?? [],
      registeredOffice: registeredOffice || undefined,
      locality: addr.locality,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Companies House took too long to reply." : "Companies House could not be reached.";
    return { status: "failed", fetchedAt, companyNumber: number, error: message };
  }
}
