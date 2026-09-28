// Extra company details saved in Company.enrichment.

export type WebsiteDetails = {
  status: "ok" | "blocked_by_robots" | "failed";
  fetchedAt: string;
  url?: string;
  title?: string;
  description?: string;
  textExcerpt?: string;
  error?: string;
};

export type CompaniesHouseDetails = {
  status: "ok" | "not_found" | "failed" | "not_configured";
  fetchedAt: string;
  companyNumber?: string;
  companyName?: string;
  companyStatus?: string;
  companyType?: string;
  incorporatedOn?: string;
  sicCodes?: string[];
  registeredOffice?: string;
  locality?: string;
  error?: string;
};

export type CompanyEnrichment = {
  website?: WebsiteDetails;
  companiesHouse?: CompaniesHouseDetails;
};
