// Fetches extra company details and saves them neatly. Failures are saved as messages, never thrown.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { fetchCompaniesHouseDetails, normaliseCompanyNumber } from "./companies-house";
import { fetchWebsiteDetails } from "./website";
import type { CompanyEnrichment } from "./types";

export async function enrichCompany(companyId: string, organisationId: string, userId: string | null) {
  const company = await prisma.company.findFirstOrThrow({ where: { id: companyId, organisationId } });
  const previous = (company.enrichment ?? {}) as CompanyEnrichment;
  const next: CompanyEnrichment = { ...previous };

  if (company.website) next.website = await fetchWebsiteDetails(company.website);
  if (company.companiesHouseNumber) next.companiesHouse = await fetchCompaniesHouseDetails(company.companiesHouseNumber);

  // Only fill in fields that are empty. Never overwrite what a person has entered.
  const fill: Prisma.CompanyUpdateInput = {};
  const ch = next.companiesHouse;
  if (ch?.status === "ok") {
    if (!company.headOffice && ch.locality) fill.headOffice = ch.locality;
    const number = normaliseCompanyNumber(company.companiesHouseNumber);
    if (number && number !== company.companiesHouseNumber) fill.companiesHouseNumber = number;
  }

  const updated = await prisma.company.update({
    where: { id: companyId },
    data: { ...fill, enrichment: next as Prisma.InputJsonValue, enrichedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      organisationId,
      userId,
      action: "company.enriched",
      entityType: "Company",
      entityId: companyId,
      details: { website: next.website?.status ?? null, companiesHouse: next.companiesHouse?.status ?? null },
    },
  });
  return updated;
}
