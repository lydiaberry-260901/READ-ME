// Fictional activity history for the demo organisation, so the dashboards have something to show.
// Deterministic (a fixed random seed), so every computer gets the same demo. Only touches demo
// users (addresses ending @example.com) and only runs once per organisation.
import type { PrismaClient } from "../src/generated/prisma/client";
import type { CallResult, CustomerGroup, LossReason, NewsStatus, NewsType } from "../src/generated/prisma/enums";

const DAY = 86_400_000;
const MARKER = "Demo activity (fictional)";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const NEWS_SOURCE = "Demo news (fictional)";

/** Fictional news items for the demo companies, so the news screens have something to show. Runs once. */
export async function addDemoNews(prisma: PrismaClient, organisationId: string, now = new Date()) {
  if (await prisma.newsItem.count({ where: { organisationId, source: NEWS_SOURCE } })) return { skipped: true, items: 0 };
  const companies = await prisma.company.findMany({ where: { organisationId, domain: { endsWith: "-demo.example" } }, select: { id: true, domain: true } });
  const byDomain = new Map(companies.map((c) => [c.domain!.replace("-demo.example", ""), c.id]));
  const items: { key: string; days: number; headline: string; summary: string; openingLine: string; newsType: NewsType; relevance: number; status: NewsStatus }[] = [
    { key: "harbourline", days: 1, headline: "Harbourline Real Estate Partners buys two Manchester office buildings", summary: "Harbourline has bought two office buildings in Manchester for its core fund.", openingLine: "Congratulations on the Manchester purchases; new buildings are often the best moment to get energy data in order.", newsType: "PROPERTY_TRANSACTION", relevance: 5, status: "NEW" },
    { key: "harbourline", days: 19, headline: "Harbourline sets out net zero pathway for its UK offices", summary: "Harbourline has published a net zero pathway covering its UK office portfolio.", openingLine: "I read your new net zero pathway and wondered how you plan to track progress building by building.", newsType: "EPC_CRREM", relevance: 4, status: "READ" },
    { key: "northgate", days: 3, headline: "Northgate Pension Property Fund appoints Head of ESG", summary: "Northgate has appointed a new Head of ESG to lead sustainability across the fund.", openingLine: "Congratulations to your new Head of ESG; the first months are usually when the data gaps become clear.", newsType: "NEW_ESG_HIRE", relevance: 5, status: "NEW" },
    { key: "kestrel", days: 6, headline: "Kestrel Urban Logistics starts refit of Birmingham warehouse", summary: "Kestrel has started refurbishing a warehouse in Birmingham.", openingLine: "I saw the Birmingham refit is under way; it is a good time to plan metering before the work finishes.", newsType: "BUILDING_WORK", relevance: 4, status: "NEW" },
    { key: "fernhill", days: 2, headline: "Fernhill Property Management invites tenders for energy reporting", summary: "Fernhill is inviting tenders for energy reporting across its managed buildings.", openingLine: "I noticed your tender for energy reporting and would welcome the chance to respond.", newsType: "TENDER_APPOINTMENT", relevance: 5, status: "ACTED_ON" },
    { key: "calderrowe", days: 11, headline: "Calder and Rowe wins management of Leeds business park", summary: "Calder and Rowe has been appointed to manage a business park in Leeds.", openingLine: "Congratulations on the Leeds appointment; recharging tenants for energy is often the first headache on a new site.", newsType: "TENDER_APPOINTMENT", relevance: 3, status: "NEW" },
    { key: "brightwater", days: 26, headline: "Brightwater Estate Services opens new regional office", summary: "Brightwater has opened a new regional office.", openingLine: "I saw you have opened a new regional office and hope the move went smoothly.", newsType: "OTHER", relevance: 2, status: "READ" },
    { key: "pennant", days: 4, headline: "Pennant Retail Group raises funding to upgrade its stores", summary: "Pennant has raised funding to upgrade its store estate.", openingLine: "I read about the funding for your store upgrades and wondered how energy savings will be measured.", newsType: "FUND_RAISE", relevance: 4, status: "NEW" },
    { key: "pennant", days: 40, headline: "Pennant Retail Group reviews store EPC ratings ahead of new rules", summary: "Pennant is reviewing the EPC ratings of its stores ahead of rule changes.", openingLine: "I saw you are reviewing store EPC ratings and thought a costed action plan might help.", newsType: "NEW_RULES", relevance: 4, status: "ACTED_ON" },
    { key: "meridianlabs", days: 8, headline: "Meridian Labs UK expands laboratory space in Cambridge", summary: "Meridian Labs is taking more laboratory space in Cambridge.", openingLine: "Congratulations on the Cambridge expansion; laboratories bring big energy questions for occupiers.", newsType: "PROPERTY_TRANSACTION", relevance: 3, status: "NEW" },
    { key: "oakbridge", days: 55, headline: "Oakbridge Hotels refurbishes seaside hotel", summary: "Oakbridge has refurbished one of its seaside hotels.", openingLine: "I saw the hotel refurbishment is complete and wondered how energy use has changed since.", newsType: "BUILDING_WORK", relevance: 2, status: "READ" },
  ];
  const data = items
    .filter((i) => byDomain.has(i.key))
    .map((i, n) => {
      const at = new Date(now.getTime() - i.days * DAY);
      const url = `https://news.example/demo/${i.key}-${n + 1}`;
      return {
        organisationId, companyId: byDomain.get(i.key)!, headline: i.headline, source: NEWS_SOURCE, url, urlHash: `demo-${i.key}-${n + 1}`,
        publishedAt: at, createdAt: at, summary: i.summary, openingLine: i.openingLine, newsType: i.newsType, relevance: i.relevance, status: i.status, aiModel: null,
      };
    });
  await prisma.newsItem.createMany({ data });
  return { skipped: false, items: data.length };
}

export async function addDemoActivity(prisma: PrismaClient, organisationId: string, now = new Date()) {
  if (await prisma.activity.count({ where: { organisationId, subject: MARKER } })) return { skipped: true };
  const rand = seeded(20260928);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

  const reps = await prisma.user.findMany({ where: { organisationId, email: { endsWith: "@example.com" }, active: true } });
  const companies = await prisma.company.findMany({ where: { organisationId }, include: { contacts: { select: { id: true } } } });
  const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { organisationId, isDefault: true }, include: { stages: { orderBy: { position: "asc" } } } });
  const open = pipeline.stages.filter((s) => s.kind === "OPEN");
  const won = pipeline.stages.find((s) => s.kind === "WON")!;
  const lost = pipeline.stages.find((s) => s.kind === "LOST")!;
  const templates = await prisma.emailTemplate.findMany({ where: { organisationId }, select: { id: true } });
  const results: CallResult[] = ["CONNECTED", "CONNECTED", "NO_ANSWER", "VOICEMAIL", "NO_ANSWER"];

  // Twelve weeks of calls, logged emails and meetings for each demo person.
  const activities = [];
  for (const rep of reps) {
    const pace = rep.role === "REP" ? 1 : 0.4;
    for (let d = 84; d >= 1; d--) {
      const date = new Date(now.getTime() - d * DAY);
      const weekday = date.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const company = pick(companies);
      const contactId = company.contacts.length ? pick(company.contacts).id : null;
      const at = (h: number) => new Date(date.getTime() - date.getUTCHours() * 3_600_000 + h * 3_600_000);
      const calls = Math.round(rand() * 4 * pace);
      for (let i = 0; i < calls; i++) {
        activities.push({ organisationId, type: "CALL" as const, userId: rep.id, occurredAt: at(9 + i), subject: MARKER, callResult: pick(results), companyId: company.id, contactId, durationSeconds: 60 + Math.round(rand() * 600) });
      }
      const emails = Math.round(rand() * 3 * pace);
      for (let i = 0; i < emails; i++) {
        activities.push({ organisationId, type: "EMAIL" as const, userId: rep.id, occurredAt: at(13 + i), subject: MARKER, companyId: company.id, contactId, emailTemplateId: templates.length ? pick(templates).id : null });
      }
      if (rand() < 0.18 * pace) {
        activities.push({ organisationId, type: "MEETING" as const, userId: rep.id, occurredAt: at(15), subject: MARKER, companyId: company.id, contactId });
      }
    }
  }
  await prisma.activity.createMany({ data: activities });

  // Closed deals over the last six months, with realistic stage histories and loss reasons.
  const groups: CustomerGroup[] = ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER"];
  const reasons: LossReason[] = ["BUDGET", "TIMING", "TIMING", "NO_DECISION", "LOST_TO_COMPETITOR", "NO_ECONOMIC_BUYER", "PRODUCT_FIT", "OTHER"];
  const owners = reps.filter((r) => r.role !== "ADMIN");
  for (let i = 0; i < 18; i++) {
    const company = pick(companies);
    const isWon = rand() < 0.42;
    const value = Math.round((5 + rand() * 70) * 1000);
    const created = new Date(now.getTime() - (60 + rand() * 120) * DAY);
    let t = created.getTime();
    const deal = await prisma.deal.create({
      data: {
        organisationId, pipelineId: pipeline.id, stageId: isWon ? won.id : lost.id, companyId: company.id, ownerId: pick(owners).id,
        name: `${company.name.split(" ")[0]} ${pick(["energy review", "billing pilot", "portfolio platform", "metering project", "carbon plan"])} (demo)`,
        value, finalValue: isWon ? Math.round(value * (0.9 + rand() * 0.2)) : null, customerGroup: company.customerGroup ?? pick(groups),
        lossReason: isWon ? null : pick(reasons), closeNote: isWon ? "Fictional demo win." : "Fictional demo loss.",
        qualificationPct: isWon ? 75 + Math.round(rand() * 25) : Math.round(rand() * 60), createdAt: created, isShared: true,
      },
    });
    await prisma.dealStageHistory.create({ data: { dealId: deal.id, toStageId: open[0].id, movedAt: new Date(t) } });
    // Walk through some open stages, spending a few weeks in each.
    const reach = isWon ? open.length : 1 + Math.floor(rand() * (open.length - 1));
    for (let s = 1; s < reach; s++) {
      const days = 4 + rand() * 20;
      await prisma.dealStageHistory.create({ data: { dealId: deal.id, fromStageId: open[s - 1].id, toStageId: open[s].id, movedAt: new Date(t + days * DAY), secondsInPreviousStage: Math.round(days * 86_400) } });
      t += days * DAY;
    }
    const lastDays = 3 + rand() * 15;
    const closedAt = new Date(Math.min(t + lastDays * DAY, now.getTime() - DAY));
    await prisma.dealStageHistory.create({ data: { dealId: deal.id, fromStageId: open[reach - 1].id, toStageId: isWon ? won.id : lost.id, movedAt: closedAt, secondsInPreviousStage: Math.round(lastDays * 86_400) } });
    await prisma.deal.update({ where: { id: deal.id }, data: { closedAt, stageEnteredAt: closedAt, lastActivityAt: closedAt } });
  }
  return { skipped: false, activities: activities.length };
}
