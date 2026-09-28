// Runs a CSV import against the database: loads existing records to check for duplicates,
// then creates companies and contacts with the data protection details the import requires.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ContactEntityType, CustomerGroup, LawfulBasis } from "@/generated/prisma/enums";
import { suppressionHash } from "@/lib/crypto";
import type { Actor } from "@/lib/permissions";
import { canEdit } from "@/lib/permissions";
import type { ColumnMapping } from "./fields";
import { normaliseCompanyName, planImport, summarisePlan, type RawRow, type RowPlan } from "./plan";

export const MAX_IMPORT_ROWS = 5000;

export type ImportSettings = {
  fileName: string;
  source: string; // required: where the data came from
  collectedAt: Date;
  lawfulBasis: LawfulBasis;
  defaultEntityType: ContactEntityType;
  defaultCustomerGroup: CustomerGroup | null;
  ownerId: string;
  isShared: boolean;
  duplicateContacts: "skip" | "update";
};

async function loadExisting(organisationId: string, rows: RawRow[], mapping: ColumnMapping) {
  const emails = new Set<string>();
  const emailCol = mapping.email;
  if (emailCol) {
    for (const r of rows) {
      const e = (r[emailCol] ?? "").trim().toLowerCase();
      if (e) emails.add(e);
    }
  }

  const [companies, contacts, suppressions] = await Promise.all([
    prisma.company.findMany({ where: { organisationId }, select: { id: true, name: true, domain: true } }),
    emails.size
      ? prisma.contact.findMany({ where: { organisationId, emailNormalised: { in: [...emails] } }, select: { id: true, emailNormalised: true } })
      : Promise.resolve([]),
    emails.size
      ? prisma.suppression.findMany({
          where: { organisationId, emailHash: { in: [...emails].map((e) => suppressionHash(e)) } },
          select: { emailHash: true },
        })
      : Promise.resolve([]),
  ]);

  const suppressedHashes = new Set(suppressions.map((s) => s.emailHash));
  return {
    companiesByDomain: new Map(companies.filter((c) => c.domain).map((c) => [c.domain!, c.id])),
    companiesByName: new Map(companies.map((c) => [normaliseCompanyName(c.name), c.id])),
    contactsByEmail: new Map(contacts.map((c) => [c.emailNormalised!, c.id])),
    suppressedEmails: new Set([...emails].filter((e) => suppressedHashes.has(suppressionHash(e)))),
  };
}

/** Checks the file without saving anything, so the person can see what will happen. */
export async function previewImport(organisationId: string, rows: RawRow[], mapping: ColumnMapping, duplicateContacts: "skip" | "update") {
  const existing = await loadExisting(organisationId, rows, mapping);
  const plans = planImport(rows, mapping, existing, { duplicateContacts });
  return { plans, summary: summarisePlan(plans) };
}

export type ImportReportLine = { row: number; company: string; contact: string; notes: string[] };

export async function runImport(actor: Actor, rows: RawRow[], mapping: ColumnMapping, settings: ImportSettings) {
  const { organisationId } = actor;
  const existing = await loadExisting(organisationId, rows, mapping);
  const plans = planImport(rows, mapping, existing, { duplicateContacts: settings.duplicateContacts });

  const createdCompanyIds = new Map<string, string>(); // plan key to new company id
  const report: ImportReportLine[] = [];
  const counts = { companiesCreated: 0, companiesMatched: 0, contactsCreated: 0, contactsUpdated: 0, skipped: 0, failed: 0 };
  const tagCache = new Map<string, string>();

  async function tagId(tx: Prisma.TransactionClient, name: string) {
    const key = name.toLowerCase();
    if (tagCache.has(key)) return tagCache.get(key)!;
    const tag = await tx.tag.upsert({
      where: { organisationId_name: { organisationId, name } },
      update: {},
      create: { organisationId, name },
    });
    tagCache.set(key, tag.id);
    return tag.id;
  }

  // Save in batches so one bad row cannot undo the whole file.
  const BATCH = 100;
  for (let start = 0; start < plans.length; start += BATCH) {
    const batch = plans.slice(start, start + BATCH);
    await prisma.$transaction(async (tx) => {
      for (const plan of batch) {
        report.push(await applyRow(tx, plan));
      }
    }, { timeout: 60_000 });
  }

  async function applyRow(tx: Prisma.TransactionClient, plan: RowPlan): Promise<ImportReportLine> {
    const line: ImportReportLine = { row: plan.row, company: "", contact: "", notes: [...plan.warnings] };
    let companyId: string | null = null;

    try {
      const c = plan.clean.company;
      if (plan.company.kind === "create" && c) {
        const created = await tx.company.create({
          data: {
            organisationId,
            name: c.name,
            website: c.website,
            domain: c.domain,
            customerGroup: c.customerGroup ?? settings.defaultCustomerGroup,
            importance: c.importance ?? 2,
            description: c.description,
            portfolioSize: c.portfolioSize,
            headOffice: c.headOffice,
            companiesHouseNumber: c.companiesHouseNumber,
            ownerId: settings.ownerId,
            isShared: settings.isShared,
          },
        });
        companyId = created.id;
        createdCompanyIds.set(plan.company.key, created.id);
        counts.companiesCreated++;
        line.company = "Created";
      } else if (plan.company.kind === "same_as_row") {
        companyId = createdCompanyIds.get(plan.company.key) ?? null;
        line.company = `Same company as row ${plan.company.row}`;
      } else if (plan.company.kind === "existing") {
        companyId = plan.company.id;
        counts.companiesMatched++;
        line.company = "Already in the CRM, linked";
      }

      // Tags are only added to companies this import created, never to existing records.
      if (companyId && c?.tags.length && plan.company.kind === "create") {
        for (const t of c.tags) {
          const id = await tagId(tx, t);
          await tx.companyTag.upsert({ where: { companyId_tagId: { companyId, tagId: id } }, update: {}, create: { companyId, tagId: id } });
        }
      }

      const p = plan.clean.contact;
      if (plan.contact.kind === "create" && p) {
        await tx.contact.create({
          data: {
            organisationId,
            companyId,
            firstName: p.firstName,
            lastName: p.lastName,
            jobTitle: p.jobTitle,
            email: p.email,
            emailNormalised: p.email,
            phone: p.phone,
            linkedinUrl: p.linkedinUrl,
            ownerId: settings.ownerId,
            isShared: settings.isShared,
            lawfulBasis: settings.lawfulBasis,
            source: settings.source,
            collectedAt: settings.collectedAt,
            entityType: p.entityType ?? settings.defaultEntityType,
          },
        });
        counts.contactsCreated++;
        line.contact = "Created";
      } else if (plan.contact.kind === "update" && p) {
        const current = await tx.contact.findUniqueOrThrow({ where: { id: plan.contact.id } });
        if (!canEdit(actor, current, { sharedIsEditable: true })) {
          counts.skipped++;
          line.contact = "Skipped";
          line.notes.push("A contact with this email already exists and you cannot change it.");
        } else {
          // Only fill in empty fields. Never overwrite what someone has entered.
          await tx.contact.update({
            where: { id: current.id },
            data: {
              companyId: current.companyId ?? companyId,
              lastName: current.lastName ?? p.lastName,
              jobTitle: current.jobTitle ?? p.jobTitle,
              phone: current.phone ?? p.phone,
              linkedinUrl: current.linkedinUrl ?? p.linkedinUrl,
            },
          });
          counts.contactsUpdated++;
          line.contact = "Existing contact, empty fields filled in";
        }
      } else if (plan.contact.kind === "skip") {
        counts.skipped++;
        line.contact = "Skipped";
        line.notes.push(plan.contact.reason);
      }

      if (plan.company.kind === "none" && plan.contact.kind === "none") {
        counts.failed++;
        line.notes.push(...plan.errors);
      }
    } catch (error) {
      counts.failed++;
      line.notes.push("This row could not be saved.");
      console.error(error);
    }
    return line;
  }

  const run = await prisma.importRun.create({
    data: {
      organisationId,
      userId: actor.id,
      fileName: settings.fileName,
      source: settings.source,
      rowCount: rows.length,
      ...counts,
      report: report as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.auditLog.create({
    data: {
      organisationId,
      userId: actor.id,
      action: "import.completed",
      entityType: "ImportRun",
      entityId: run.id,
      details: { fileName: settings.fileName, source: settings.source, rows: rows.length, ...counts },
    },
  });
  return { runId: run.id, counts, report };
}
