// CSV downloads for every list. Uses the same filters and access rules as the list pages,
// streams large lists in batches, and records every download in the audit log.
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { visibleWhere } from "@/lib/permissions";
import { csvResponse, csvStream, fileDate } from "@/lib/csv";
import { formatDate, formatDateTime } from "@/lib/format";
import { companyOrderBy, companyWhere, parseCompanyFilters } from "@/lib/companies/query";
import { contactOrderBy, contactWhere, parseContactFilters } from "@/lib/contacts/query";
import { dealWhere, parseDealFilters } from "@/lib/deals/query";
import { customerGroupLabels, entityTypeLabels, healthFlagLabels, lawfulBasisLabels, lossReasonLabels, outreachReasonLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

const BATCH = 1000;

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const { kind } = await params;
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const logExport = (rows: string) => audit({ organisationId: user.organisationId, userId: user.id, action: `export.${kind}`, details: { filters: search, rows } });

  switch (kind) {
    case "companies": {
      const where = companyWhere(user, { ...parseCompanyFilters(search), page: 1 });
      await logExport("streamed");
      return csvResponse(
        csvStream(["Name", "Website", "Customer group", "Importance", "Score", "Score reason", "Why this company matters to Moca", "Portfolio size", "Head office", "Companies House number", "Owner", "Shared", "Created"], async (page) => {
          const rows = await prisma.company.findMany({ where, orderBy: companyOrderBy(parseCompanyFilters(search)), skip: page * BATCH, take: BATCH, include: { owner: { select: { name: true } } } });
          return rows.map((c) => [c.name, c.website, c.customerGroup ? customerGroupLabels[c.customerGroup] : "", c.importance, c.score, c.scoreReason, c.whyMatters, c.portfolioSize, c.headOffice, c.companiesHouseNumber, c.owner?.name, c.isShared ? "Yes" : "No", formatDate(c.createdAt)]);
        }),
        `companies-${fileDate()}.csv`,
      );
    }
    case "contacts": {
      const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { phoneCheckMaxAgeDays: true } });
      const filters = parseContactFilters(search);
      const where = contactWhere(user, filters, org.phoneCheckMaxAgeDays);
      await logExport("streamed");
      return csvResponse(
        csvStream(["First name", "Last name", "Job title", "Company", "Work email", "Work phone", "Profile link", "Business type", "Lawful reason", "Source", "Date collected", "Privacy notice sent", "TPS and CTPS checked", "Opted out", "Owner"], async (page) => {
          const rows = await prisma.contact.findMany({ where, orderBy: contactOrderBy(filters), skip: page * BATCH, take: BATCH, include: { company: { select: { name: true } }, owner: { select: { name: true } } } });
          return rows.map((c) => [
            c.firstName, c.lastName, c.jobTitle, c.company?.name, c.optedOut ? "" : c.email, c.optedOut ? "" : c.phone, c.linkedinUrl, entityTypeLabels[c.entityType], lawfulBasisLabels[c.lawfulBasis],
            c.source, formatDate(c.collectedAt), formatDate(c.privacyNoticeSentAt, ""), formatDate(c.phoneCheckedAt, ""), c.optedOut ? "Yes" : "No", c.owner?.name,
          ]);
        }),
        `contacts-${fileDate()}.csv`,
      );
    }
    case "deals": {
      const where = dealWhere(user, { ...parseDealFilters(search), view: "list" });
      await logExport("streamed");
      return csvResponse(
        csvStream(["Deal", "Company", "Stage", "Value (£)", "Expected close", "Owner", "Customer group", "Health", "Health score", "Qualification %", "Next step", "Competitor", "Loss reason", "Close note", "Closed"], async (page) => {
          const rows = await prisma.deal.findMany({ where, orderBy: { createdAt: "asc" }, skip: page * BATCH, take: BATCH, include: { company: { select: { name: true } }, stage: { select: { name: true } }, owner: { select: { name: true } } } });
          return rows.map((d) => [
            d.name, d.company.name, d.stage.name, d.value, formatDate(d.expectedCloseDate, ""), d.owner.name, d.customerGroup ? customerGroupLabels[d.customerGroup] : "",
            d.healthFlag ? healthFlagLabels[d.healthFlag] : "", d.healthScore, d.qualificationPct, d.nextStep, d.competitor, d.lossReason ? lossReasonLabels[d.lossReason] : "", d.closeNote, formatDate(d.closedAt, ""),
          ]);
        }),
        `deals-${fileDate()}.csv`,
      );
    }
    case "activities": {
      const owners = user.role === "ADMIN" ? undefined : { in: user.visibleOwnerIds };
      await logExport("streamed");
      return csvResponse(
        csvStream(["When", "Type", "By", "Subject", "Company", "Deal", "Call result"], async (page) => {
          const rows = await prisma.activity.findMany({
            where: { organisationId: user.organisationId, ...(owners ? { userId: owners } : {}) },
            orderBy: { occurredAt: "desc" }, skip: page * BATCH, take: BATCH,
            include: { user: { select: { name: true } }, company: { select: { name: true } }, deal: { select: { name: true } } },
          });
          return rows.map((a) => [formatDateTime(a.occurredAt), a.type, a.user?.name, a.subject, a.company?.name, a.deal?.name, a.callResult]);
        }),
        `activities-${fileDate()}.csv`,
      );
    }
    case "tasks": {
      const owners = user.role === "ADMIN" ? undefined : { in: user.visibleOwnerIds };
      await logExport("streamed");
      return csvResponse(
        csvStream(["Title", "Type", "Priority", "Status", "Due", "Assigned to", "Why it was created", "Suggested action"], async (page) => {
          const rows = await prisma.task.findMany({ where: { organisationId: user.organisationId, ...(owners ? { assigneeId: owners } : {}) }, orderBy: { dueAt: "asc" }, skip: page * BATCH, take: BATCH, include: { assignee: { select: { name: true } } } });
          return rows.map((t) => [t.title, t.type, t.priority, t.status, formatDateTime(t.dueAt, ""), t.assignee.name, t.reason, t.suggestedAction]);
        }),
        `tasks-${fileDate()}.csv`,
      );
    }
    case "news": {
      await logExport("streamed");
      return csvResponse(
        csvStream(["Company", "Headline", "Source", "Link", "Published", "Type", "Relevance", "Summary", "Status"], async (page) => {
          const rows = await prisma.newsItem.findMany({ where: { organisationId: user.organisationId, company: visibleWhere(user) }, orderBy: { publishedAt: "desc" }, skip: page * BATCH, take: BATCH, include: { company: { select: { name: true } } } });
          return rows.map((n) => [n.company.name, n.headline, n.source, n.url, formatDate(n.publishedAt, ""), n.newsType, n.relevance, n.summary, n.status]);
        }),
        `news-${fileDate()}.csv`,
      );
    }
    case "templates": {
      const rows = await prisma.emailTemplate.findMany({ where: { organisationId: user.organisationId }, orderBy: { name: "asc" } });
      await logExport(String(rows.length));
      return csvResponse(
        csvStream(["Name", "Customer group", "Reason", "Subject", "Body", "Marketing email", "In use", "Version"], async (page) =>
          page > 0 ? [] : rows.map((t) => [t.name, t.customerGroup ? customerGroupLabels[t.customerGroup] : "Any", outreachReasonLabels[t.reason], t.subject, t.body, t.isMarketing ? "Yes" : "No", t.active ? "Yes" : "No", t.version]),
        ),
        `email-templates-${fileDate()}.csv`,
      );
    }
    default:
      return new Response("Unknown download.", { status: 404 });
  }
}
