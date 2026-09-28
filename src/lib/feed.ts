// The live feed on the home page: recent business events across the CRM, in plain English.
// Built from the audit log, showing only events about records the person may see, and never
// naming individual contacts.
import { prisma } from "@/lib/db";
import { canView, type Actor } from "@/lib/permissions";

const FEED_ACTIONS = [
  "deal.stage_changed",
  "deal.created",
  "company.created",
  "company.ai_summary_generated",
  "company.enriched",
  "import.completed",
  "outreach.email_drafted",
  "outreach.ai_email_drafted",
  "outreach.ai_script_drafted",
  "outreach.script_drafted",
  "outreach.call_ready",
  "knowledge.uploaded",
  "contact.opted_out",
];

export type FeedItem = { id: string; at: string; kind: "deal" | "company" | "outreach" | "data" | "privacy"; text: string; href: string | null };

export async function getFeed(actor: Actor, limit = 20): Promise<FeedItem[]> {
  const logs = await prisma.auditLog.findMany({
    where: { organisationId: actor.organisationId, action: { in: FEED_ACTIONS } },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    include: { user: { select: { name: true } } },
  });
  const dealIds = logs.filter((l) => l.entityType === "Deal" && l.entityId).map((l) => l.entityId!);
  const companyIds = logs.filter((l) => l.entityType === "Company" && l.entityId).map((l) => l.entityId!);
  const [deals, companies] = await Promise.all([
    prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, name: true, organisationId: true, ownerId: true, isShared: true } }),
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true, organisationId: true, ownerId: true, isShared: true } }),
  ]);
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const items: FeedItem[] = [];
  for (const l of logs) {
    const who = l.user?.name ?? "The CRM";
    const details = (l.details ?? {}) as Record<string, unknown>;
    let item: Omit<FeedItem, "id" | "at"> | null = null;

    if (l.entityType === "Deal") {
      const d = dealById.get(l.entityId ?? "");
      if (!d || !canView(actor, d)) continue;
      item =
        l.action === "deal.stage_changed"
          ? { kind: "deal", text: `${who} moved ${d.name} from ${details.from} to ${details.to}`, href: `/deals/${d.id}` }
          : { kind: "deal", text: `${who} created the deal ${d.name}`, href: `/deals/${d.id}` };
    } else if (l.entityType === "Company") {
      const c = companyById.get(l.entityId ?? "");
      if (!c || !canView(actor, c)) continue;
      const text =
        l.action === "company.ai_summary_generated" ? `AI scored ${c.name} at ${details.score} out of 5`
          : l.action === "company.enriched" ? `Public details fetched for ${c.name}`
            : `${who} added ${c.name}`;
      item = { kind: "company", text, href: `/companies/${c.id}` };
    } else if (l.action === "import.completed") {
      item = { kind: "data", text: `${who} imported ${details.rows} rows from ${details.fileName}`, href: null };
    } else if (l.action.startsWith("outreach.")) {
      const what = l.action.includes("script") ? "a call script" : "an email";
      const text = l.action === "outreach.call_ready" ? `${who} marked a call ready after the phone check` : `${who} ${l.action.includes("ai_") ? "drafted with AI" : "drafted"} ${what}`;
      item = { kind: "outreach", text, href: null };
    } else if (l.action === "knowledge.uploaded") {
      item = { kind: "data", text: `${who} added ${details.fileName} to the knowledge library`, href: "/knowledge" };
    } else if (l.action === "contact.opted_out") {
      item = { kind: "privacy", text: "A contact opted out. Everyone is now blocked from contacting them.", href: null };
    }
    if (item) items.push({ id: l.id, at: l.createdAt.toISOString(), ...item });
    if (items.length >= limit) break;
  }
  return items;
}
