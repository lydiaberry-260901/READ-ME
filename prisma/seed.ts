// Demo data. Every company, person and deal here is FICTIONAL, made up for trying the CRM.
// Websites use the reserved ".example" ending and people use "@example.com" addresses,
// so none of them can belong to a real organisation or person.
//
// Run with: npm run db:seed
// If the database already has data, add --reset to wipe it first (development only):
//   npm run db:seed -- --reset
import "dotenv/config";
import { createClient } from "../src/lib/db";
import { createOrganisation } from "../src/lib/organisation";
import { qualificationCompleteness } from "../src/lib/qualification";
import { recalculateOrganisation } from "../src/lib/deals/recalculate";
import { addDemoActivity, addDemoNews } from "./demo-activity";
import { normaliseEmail, randomToken, suppressionHash, maskEmail } from "../src/lib/crypto";
import type { CustomerGroup, Role, StakeholderRole } from "../src/generated/prisma/enums";

const prisma = createClient();
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);
const DEMO_SOURCE = "Demo data (fictional)";

async function wipe() {
  // Order matters: remove records that point at others first.
  await prisma.$transaction([
    prisma.outreachDraft.deleteMany(),
    prisma.knowledgeDocument.deleteMany(),
    prisma.aiUsage.deleteMany(),
    prisma.importRun.deleteMany(),
    prisma.savedView.deleteMany(),
    prisma.prospectListMember.deleteMany(),
    prisma.prospectList.deleteMany(),
    prisma.companyTag.deleteMany(),
    prisma.contactTag.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.task.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.transcriptSuggestion.deleteMany(),
    prisma.callTranscript.deleteMany(),
    prisma.email.deleteMany(),
    prisma.calendarEvent.deleteMany(),
    prisma.emailAccount.deleteMany(),
    prisma.calendarAccount.deleteMany(),
    prisma.newsItem.deleteMany(),
    prisma.newsWatch.deleteMany(),
    prisma.dealStageHistory.deleteMany(),
    prisma.dealContact.deleteMany(),
    prisma.dealFollower.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.stage.deleteMany(),
    prisma.pipeline.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.company.deleteMany(),
    prisma.battlecard.deleteMany(),
    prisma.emailTemplate.deleteMany(),
    prisma.callScript.deleteMany(),
    prisma.suppression.deleteMany(),
    prisma.invitation.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.user.updateMany({ data: { teamId: null } }),
    prisma.team.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organisation.deleteMany(),
  ]);
}

const USERS: { key: string; name: string; email: string; role: Role; team?: string; jobTitle: string }[] = [
  { key: "admin", name: "Jordan Ellis", email: "demo.admin@example.com", role: "ADMIN", jobTitle: "Head of Sales (demo)" },
  { key: "mgrFunds", name: "Sam Whitfield", email: "demo.manager@example.com", role: "MANAGER", team: "Funds and agents", jobTitle: "Sales Manager (demo)" },
  { key: "rep1", name: "Aisha Rahman", email: "demo.rep1@example.com", role: "REP", team: "Funds and agents", jobTitle: "Account Executive (demo)" },
  { key: "rep2", name: "Tom Hughes", email: "demo.rep2@example.com", role: "REP", team: "Funds and agents", jobTitle: "Account Executive (demo)" },
  { key: "mgrOcc", name: "Nadia Kowalski", email: "demo.manager2@example.com", role: "MANAGER", team: "Occupiers", jobTitle: "Sales Manager (demo)" },
  { key: "rep3", name: "Owen Price", email: "demo.rep3@example.com", role: "REP", team: "Occupiers", jobTitle: "Account Executive (demo)" },
];

type CompanySeed = {
  key: string;
  name: string;
  domain: string;
  group: CustomerGroup;
  importance: number;
  description: string;
  portfolioSize?: string;
  headOffice: string;
  owner: string;
  score?: number;
  scoreReason?: string;
  whyMatters?: string;
  contacts: { first: string; last: string; title: string; phoneChecked?: number; optedOut?: boolean }[];
};

const COMPANIES: CompanySeed[] = [
  {
    key: "harbourline", name: "Harbourline Real Estate Partners", domain: "harbourline-demo.example", group: "ASSET_ESG", importance: 1,
    description: "Fictional fund manager holding UK offices and light industrial units with several tenants per building.",
    portfolioSize: "14 buildings, about 1.9 million sq ft", headOffice: "London", owner: "rep1", score: 5,
    scoreReason: "UK owner of multi let buildings with EPC exposure across the portfolio.",
    whyMatters: "Harbourline owns multi let UK offices where EPC ratings affect lettings and value. Moca could help prioritise upgrades and automate tenant energy recharging. (Fictional demo summary.)",
    contacts: [
      { first: "Grace", last: "Okafor", title: "Head of ESG", phoneChecked: 5 },
      { first: "Martin", last: "Leigh", title: "Fund Director", phoneChecked: 40 },
    ],
  },
  {
    key: "northgate", name: "Northgate Pension Property Fund", domain: "northgate-demo.example", group: "ASSET_ESG", importance: 1,
    description: "Fictional pension fund property arm with a net zero commitment and older office stock.",
    portfolioSize: "22 buildings", headOffice: "Leeds", owner: "rep2", score: 4,
    scoreReason: "Net zero commitment and older stock suggest CRREM risk, but decision making is slow.",
    whyMatters: "Northgate has a public net zero target and older offices likely to fall behind CRREM pathways. Costed action plans could help it decide where to invest first. (Fictional demo summary.)",
    contacts: [
      { first: "Helen", last: "Barker", title: "Sustainability Manager" },
      { first: "Rajesh", last: "Menon", title: "Asset Manager", phoneChecked: 12 },
    ],
  },
  {
    key: "kestrel", name: "Kestrel Urban Logistics", domain: "kestrel-demo.example", group: "ASSET_ESG", importance: 2,
    description: "Fictional owner of urban warehouses let to delivery firms.",
    headOffice: "Birmingham", owner: "rep1",
    contacts: [{ first: "Daniel", last: "Frost", title: "Portfolio Manager" }],
  },
  {
    key: "fernhill", name: "Fernhill Property Management", domain: "fernhill-demo.example", group: "PROPERTY_MANAGER", importance: 1,
    description: "Fictional managing agent looking after shopping centres and offices for several landlords.",
    portfolioSize: "60 managed buildings", headOffice: "Manchester", owner: "rep2", score: 4,
    scoreReason: "Managing agent competing for tenders where tenant billing could set it apart.",
    whyMatters: "Fernhill competes for management tenders and bills many tenants for energy. Automated tenant billing could cut admin and support its bids. (Fictional demo summary.)",
    contacts: [
      { first: "Chloe", last: "Adams", title: "Director of Property Management", phoneChecked: 3 },
      { first: "Ben", last: "Nwosu", title: "Service Charge Manager" },
    ],
  },
  {
    key: "calder", name: "Calder and Rowe Managing Agents", domain: "calderrowe-demo.example", group: "PROPERTY_MANAGER", importance: 2,
    description: "Fictional regional managing agent with a mixed office and retail book.",
    headOffice: "Bristol", owner: "mgrFunds",
    contacts: [{ first: "Lucy", last: "Tran", title: "Operations Director", optedOut: true }],
  },
  {
    key: "brightwater", name: "Brightwater Estate Services", domain: "brightwater-demo.example", group: "PROPERTY_MANAGER", importance: 3,
    description: "Fictional small managing agent focused on residential blocks with some commercial units.",
    headOffice: "Cardiff", owner: "rep2",
    contacts: [{ first: "Iwan", last: "Morgan", title: "Partner" }],
  },
  {
    key: "pennant", name: "Pennant Retail Group", domain: "pennant-demo.example", group: "OCCUPIER", importance: 1,
    description: "Fictional retailer with stores across the UK, most of them leased.",
    portfolioSize: "120 stores", headOffice: "Nottingham", owner: "rep3", score: 5,
    scoreReason: "Occupier with many sites that needs a single view of energy and credible ESOS plans.",
    whyMatters: "Pennant runs many leased stores and must report under ESOS and SECR. A single view of energy across sites could cut costs and strengthen its position with landlords. (Fictional demo summary.)",
    contacts: [
      { first: "Farah", last: "Iqbal", title: "Energy Manager", phoneChecked: 8 },
      { first: "Peter", last: "Doyle", title: "Chief Financial Officer" },
    ],
  },
  {
    key: "meridian", name: "Meridian Labs UK", domain: "meridianlabs-demo.example", group: "OCCUPIER", importance: 2,
    description: "Fictional science company with laboratories on six leased sites.",
    portfolioSize: "6 sites", headOffice: "Cambridge", owner: "rep3", score: 3,
    scoreReason: "Several energy heavy sites, but a small number of them.",
    whyMatters: "Meridian runs energy heavy laboratories where grid capacity limits could slow growth. Moca could help it plan and cut costs. (Fictional demo summary.)",
    contacts: [{ first: "Sophie", last: "Klein", title: "Facilities Director" }],
  },
  {
    key: "oakbridge", name: "Oakbridge Hotels", domain: "oakbridge-demo.example", group: "OCCUPIER", importance: 3,
    description: "Fictional hotel group with leased and owned hotels.",
    headOffice: "Edinburgh", owner: "mgrOcc",
    contacts: [{ first: "Callum", last: "Reid", title: "Head of Operations" }],
  },
];

type DealSeed = {
  company: string;
  name: string;
  stage: string;
  value: number;
  owner: string;
  closeInDays: number;
  daysInStage: number;
  lastActivityDaysAgo: number;
  nextStep?: string;
  isShared?: boolean;
  competitor?: string;
  qualification: Partial<Record<"metric" | "economicBuyer" | "decisionCriteria" | "decisionProcess" | "paperProcess" | "identifiedPain" | "champion" | "competition", string>>;
  stakeholders: { contact: string; role?: StakeholderRole }[];
};

const DEALS: DealSeed[] = [
  {
    company: "harbourline", name: "Harbourline portfolio energy platform", stage: "Proposal", value: 48000, owner: "rep1",
    closeInDays: 30, daysInStage: 9, lastActivityDaysAgo: 2, nextStep: "Walk through the costed action plan with the fund director",
    competitor: "Traditional energy consultant",
    qualification: {
      metric: "Lift 5 buildings from EPC E to C before lease renewals",
      economicBuyer: "Fund Director",
      decisionCriteria: "Cost per building, speed to first results",
      identifiedPain: "EPC risk on buildings with leases ending soon",
      champion: "Head of ESG",
      competition: "Traditional energy consultant",
    },
    stakeholders: [{ contact: "Grace Okafor", role: "CHAMPION" }, { contact: "Martin Leigh", role: "ECONOMIC_BUYER" }],
  },
  {
    company: "northgate", name: "Northgate CRREM pathway pilot", stage: "Demo", value: 30000, owner: "rep2",
    closeInDays: 60, daysInStage: 35, lastActivityDaysAgo: 19, nextStep: "Book a follow up demo for the asset team",
    qualification: { identifiedPain: "Older offices likely to miss CRREM targets", metric: "Carbon intensity per square metre" },
    stakeholders: [{ contact: "Helen Barker", role: "USER" }],
  },
  {
    company: "kestrel", name: "Kestrel warehouse metering", stage: "Contacted", value: 12000, owner: "rep1",
    closeInDays: 90, daysInStage: 6, lastActivityDaysAgo: 6, nextStep: "Call to agree a first meeting",
    qualification: {}, stakeholders: [{ contact: "Daniel Frost" }],
  },
  {
    company: "fernhill", name: "Fernhill tenant billing rollout", stage: "Negotiation", value: 65000, owner: "rep2",
    closeInDays: 14, daysInStage: 4, lastActivityDaysAgo: 1, nextStep: "Send revised contract to procurement",
    isShared: true, competitor: "In house spreadsheets",
    qualification: {
      metric: "Cut service charge admin time by half", economicBuyer: "Director of Property Management",
      decisionCriteria: "Accuracy of recharges, tenant portal", decisionProcess: "Board sign off after legal review",
      paperProcess: "Supplier security questionnaire and legal review", identifiedPain: "Manual recharging across 60 buildings",
      champion: "Service Charge Manager", competition: "In house spreadsheets",
    },
    stakeholders: [
      { contact: "Chloe Adams", role: "ECONOMIC_BUYER" },
      { contact: "Ben Nwosu", role: "CHAMPION" },
    ],
  },
  {
    company: "brightwater", name: "Brightwater energy review", stage: "Prospect", value: 6000, owner: "rep2",
    closeInDays: 120, daysInStage: 20, lastActivityDaysAgo: 30, qualification: {}, stakeholders: [],
  },
  {
    company: "pennant", name: "Pennant multi site energy view", stage: "Conversation", value: 90000, owner: "rep3",
    closeInDays: 75, daysInStage: 12, lastActivityDaysAgo: 3, nextStep: "Share ESOS case study",
    qualification: { identifiedPain: "No single view of energy across 120 stores", champion: "Energy Manager", metric: "Energy cost per store" },
    stakeholders: [{ contact: "Farah Iqbal", role: "CHAMPION" }],
  },
  {
    company: "meridian", name: "Meridian grid capacity planning", stage: "Proposal", value: 22000, owner: "rep3",
    closeInDays: 21, daysInStage: 28, lastActivityDaysAgo: 16, nextStep: "Chase decision on proposal",
    qualification: { identifiedPain: "Grid capacity limits at the main laboratory", decisionProcess: "Facilities director then finance" },
    stakeholders: [{ contact: "Sophie Klein", role: "INFLUENCER" }],
  },
  {
    company: "oakbridge", name: "Oakbridge hotels energy audit", stage: "Won", value: 18000, owner: "mgrOcc",
    closeInDays: -10, daysInStage: 10, lastActivityDaysAgo: 10,
    qualification: { metric: "Energy cost per room night", economicBuyer: "Head of Operations", identifiedPain: "Rising energy bills", champion: "Head of Operations" },
    stakeholders: [{ contact: "Callum Reid", role: "ECONOMIC_BUYER" }],
  },
  {
    company: "calder", name: "Calder and Rowe billing trial", stage: "Lost", value: 9000, owner: "mgrFunds",
    closeInDays: -30, daysInStage: 30, lastActivityDaysAgo: 30, qualification: { identifiedPain: "Slow manual billing" },
    stakeholders: [{ contact: "Lucy Tran" }],
  },
];

const BATTLECARDS = [
  {
    competitorName: "Traditional energy consultant",
    comparison:
      "Consultants produce one off reports. Moca uses live energy data to keep investment priorities and costed action plans up to date, and measures results. Moca saved Octopus Real Estate about £500,000 compared with using a consultant.",
    objections: [
      { objection: "We already have a consultant we trust.", response: "Moca can work alongside them. Live data makes their advice easier to act on and to measure." },
      { objection: "A report is cheaper.", response: "A report is out of date quickly. Compare the cost of ongoing data led decisions with repeated reports." },
    ],
  },
  {
    competitorName: "In house spreadsheets",
    comparison:
      "Spreadsheets depend on a few people and manual data entry. Moca automates tenant billing and keeps an audit trail, which reduces admin and errors.",
    objections: [
      { objection: "Our spreadsheets work fine.", response: "Ask how long each recharge cycle takes and how often tenants query bills." },
    ],
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The demo data script must never run against the live database.");
  }
  const reset = process.argv.includes("--reset");
  const existing = await prisma.organisation.count();
  if (existing > 0 && !reset) {
    console.log("The database already has data. To wipe it and load demo data, run: npm run db:seed -- --reset");
    return;
  }
  if (reset) {
    console.log("Wiping existing data (development only)...");
    await wipe();
  }

  const org = await createOrganisation(prisma, "Moca");
  const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { organisationId: org.id, isDefault: true }, include: { stages: true } });
  const stageByName = new Map(pipeline.stages.map((s) => [s.name, s]));

  // People and teams
  const userIds = new Map<string, string>();
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: { organisationId: org.id, name: u.name, email: u.email, role: u.role, jobTitle: u.jobTitle, lastSignInAt: daysAgo(1) },
    });
    userIds.set(u.key, user.id);
  }
  const teams = new Map<string, string>();
  for (const [teamName, managerKey] of [["Funds and agents", "mgrFunds"], ["Occupiers", "mgrOcc"]] as const) {
    const team = await prisma.team.create({ data: { organisationId: org.id, name: teamName, managerId: userIds.get(managerKey)! } });
    teams.set(teamName, team.id);
  }
  for (const u of USERS) {
    if (u.team) await prisma.user.update({ where: { id: userIds.get(u.key)! }, data: { teamId: teams.get(u.team)! } });
  }

  // Let the real admin join this organisation on first sign in with Google or Microsoft.
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    await prisma.invitation.create({
      data: {
        organisationId: org.id, email: normaliseEmail(adminEmail), role: "ADMIN", token: randomToken(),
        invitedById: userIds.get("admin")!, expiresAt: daysAhead(30),
      },
    });
  }

  // Companies and contacts
  const companyIds = new Map<string, string>();
  const contactIds = new Map<string, string>();
  for (const c of COMPANIES) {
    const company = await prisma.company.create({
      data: {
        organisationId: org.id, name: c.name, website: `https://www.${c.domain}`, domain: c.domain,
        customerGroup: c.group, importance: c.importance, description: c.description, portfolioSize: c.portfolioSize,
        headOffice: c.headOffice, ownerId: userIds.get(c.owner)!, score: c.score, scoreReason: c.scoreReason,
        whyMatters: c.whyMatters, aiModel: c.whyMatters ? "Demo data (not AI written)" : null,
        aiGeneratedAt: c.whyMatters ? daysAgo(7) : null, lastActivityAt: daysAgo(5),
      },
    });
    companyIds.set(c.key, company.id);
    for (const p of c.contacts) {
      const email = `${p.first}.${p.last}@${c.domain}`.toLowerCase();
      const contact = await prisma.contact.create({
        data: {
          organisationId: org.id, companyId: company.id, firstName: p.first, lastName: p.last, jobTitle: p.title,
          email, emailNormalised: email, phone: "01632 960" + String(100 + contactIds.size).slice(-3),
          ownerId: userIds.get(c.owner)!, source: DEMO_SOURCE, collectedAt: daysAgo(60), privacyNoticeSentAt: daysAgo(50),
          entityType: "LIMITED_COMPANY",
          phoneCheckedAt: p.phoneChecked !== undefined ? daysAgo(p.phoneChecked) : null,
          phoneCheckResult: p.phoneChecked !== undefined ? "CLEAR" : null,
          optedOut: p.optedOut ?? false, optedOutAt: p.optedOut ? daysAgo(20) : null,
          doNotContactReason: p.optedOut ? "Asked us to stop contacting them (fictional)" : null,
          lastActivityAt: daysAgo(10),
        },
      });
      contactIds.set(`${p.first} ${p.last}`, contact.id);
      if (p.optedOut) {
        await prisma.suppression.create({
          data: { organisationId: org.id, emailHash: suppressionHash(email), hint: maskEmail(email), reason: "Opted out (fictional demo entry)" },
        });
      }
    }
  }

  // Deals
  for (const d of DEALS) {
    const stage = stageByName.get(d.stage)!;
    const prospect = stageByName.get("Prospect")!;
    const company = COMPANIES.find((c) => c.key === d.company)!;
    const closed = stage.kind !== "OPEN";
    const deal = await prisma.deal.create({
      data: {
        organisationId: org.id, pipelineId: pipeline.id, stageId: stage.id, companyId: companyIds.get(d.company)!,
        ownerId: userIds.get(d.owner)!, name: d.name, value: d.value, customerGroup: company.group,
        expectedCloseDate: daysAhead(d.closeInDays), nextStep: d.nextStep, stageEnteredAt: daysAgo(d.daysInStage),
        isShared: d.isShared ?? false, competitor: d.competitor, ...d.qualification,
        qualificationPct: qualificationCompleteness(d.qualification),
        lastActivityAt: daysAgo(d.lastActivityDaysAgo),
        closedAt: closed ? daysAgo(d.daysInStage) : null,
        finalValue: stage.kind === "WON" ? d.value : null,
        lossReason: stage.kind === "LOST" ? "TIMING" : null,
        closeNote: stage.kind === "WON" ? "Clear savings case for the operations team (fictional)." : stage.kind === "LOST" ? "Not a priority this year (fictional)." : null,
        singleThreadedSince: d.stakeholders.length === 1 && !closed ? daysAgo(d.daysInStage + 5) : null,
        createdAt: daysAgo(d.daysInStage + 20),
      },
    });
    await prisma.dealStageHistory.create({ data: { dealId: deal.id, toStageId: prospect.id, movedById: userIds.get(d.owner)!, movedAt: daysAgo(d.daysInStage + 20) } });
    if (stage.id !== prospect.id) {
      await prisma.dealStageHistory.create({
        data: {
          dealId: deal.id, fromStageId: prospect.id, toStageId: stage.id, movedById: userIds.get(d.owner)!,
          movedAt: daysAgo(d.daysInStage), secondsInPreviousStage: 20 * 86_400,
        },
      });
    }
    for (const s of d.stakeholders) {
      await prisma.dealContact.create({ data: { dealId: deal.id, contactId: contactIds.get(s.contact)!, role: s.role } });
    }
    await prisma.activity.create({
      data: {
        organisationId: org.id, type: "NOTE", userId: userIds.get(d.owner)!, occurredAt: daysAgo(d.lastActivityDaysAgo),
        subject: "Demo note", body: "Fictional note added by the demo data script.",
        companyId: companyIds.get(d.company)!, dealId: deal.id,
      },
    });
  }

  for (const b of BATTLECARDS) {
    await prisma.battlecard.create({ data: { organisationId: org.id, ...b, updatedById: userIds.get("admin")! } });
  }

  await prisma.task.create({
    data: {
      organisationId: org.id, assigneeId: userIds.get("rep1")!, title: "Call Grace Okafor about the proposal",
      type: "CALL", priority: "HIGH", dueAt: daysAhead(1), reason: "Demo task (fictional).", origin: "MANUAL",
      companyId: companyIds.get("harbourline")!, contactId: contactIds.get("Grace Okafor")!,
    },
  });

  await addDemoActivity(prisma, org.id);
  await addDemoNews(prisma, org.id);
  await recalculateOrganisation(org.id);

  console.log(`Demo data loaded: ${USERS.length} users, ${COMPANIES.length} companies, ${contactIds.size} contacts, ${DEALS.length} deals.`);
  if (adminEmail) console.log(`${adminEmail} is invited as an Admin and can sign in with Google or Microsoft.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
