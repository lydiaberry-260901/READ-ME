// The starter library of email templates and call scripts, added to every new organisation.
// Short, specific and honest. The only figures used are the Moca facts from the project brief:
// more than 5.7 million square feet managed, and about £500,000 saved for Octopus Real Estate
// compared with using a consultant.
import type { PrismaClient } from "@/generated/prisma/client";
import type { CustomerGroup, OutreachReason } from "@/generated/prisma/enums";

type EmailSeed = { name: string; group: CustomerGroup; reason: OutreachReason; subject: string; body: string };
type ScriptSeed = {
  name: string;
  group: CustomerGroup;
  reason: OutreachReason;
  opening: string;
  questions: string[];
  objections: { objection: string; response: string }[];
  ask: string;
};

const signOff = "Best wishes,\n{{sender.name}}\n{{sender.jobTitle}}, Moca";

export const STARTER_EMAILS: EmailSeed[] = [
  // Asset and ESG managers
  {
    name: "EPC risk across the portfolio",
    group: "ASSET_ESG",
    reason: "EPC_RISK",
    subject: "EPC risk across {{company.name}}'s buildings",
    body: `Hello {{contact.firstName}},

With minimum EPC standards tightening, many owners are having to decide which buildings to upgrade first, and how to pay for it without losing income.

Moca uses live energy data to turn that into clear investment priorities and costed action plans for each building. It is powered by Octopus and already manages more than 5.7 million square feet.

Would a 20 minute call to see how it would work for {{company.name}} be useful?

${signOff}`,
  },
  {
    name: "Net zero and CRREM pathways",
    group: "ASSET_ESG",
    reason: "NET_ZERO",
    subject: "Keeping {{company.name}} on its CRREM pathway",
    body: `Hello {{contact.firstName}},

Net zero commitments are easy to set and hard to track building by building. Moca shows where each asset sits against its CRREM pathway using live energy data, and which actions would close the gap, with costs attached.

Octopus Real Estate used Moca in place of a consultant and saved about £500,000.

Could we find 20 minutes to show you what this would look like for your portfolio?

${signOff}`,
  },
  {
    name: "Welcome to a new ESG role",
    group: "ASSET_ESG",
    reason: "NEW_ESG_HIRE",
    subject: "Your new role at {{company.name}}",
    body: `Hello {{contact.firstName}},

Congratulations on your new role. The first months in an ESG post are often spent pulling energy data together before any decisions can be made.

Moca gives you that picture from live data, then turns it into investment priorities and costed action plans you can take to the board. It already covers more than 5.7 million square feet.

If it would help as you plan your first priorities, I would be glad to show you how it works.

${signOff}`,
  },

  // Property managers
  {
    name: "Winning management tenders",
    group: "PROPERTY_MANAGER",
    reason: "TENDER",
    subject: "Something extra for {{company.name}}'s next tender",
    body: `Hello {{contact.firstName}},

Landlords increasingly ask managing agents how they will cut energy costs and carbon, not just how they will run the building.

Moca gives your team live energy data, costed action plans and automated tenant energy billing, which you can offer as part of your service and as a new source of income.

Would it be worth a short call before your next tender goes in?

${signOff}`,
  },
  {
    name: "Automated tenant energy billing",
    group: "PROPERTY_MANAGER",
    reason: "GENERAL_INTRO",
    subject: "Taking the admin out of tenant energy recharges",
    body: `Hello {{contact.firstName}},

Recharging tenants for energy is often slow, manual work that eats into margins and leads to queries.

Moca automates tenant billing from live energy data, so recharges are accurate and quicker to produce. It is powered by Octopus and manages more than 5.7 million square feet.

Could I show you how it would fit with {{company.name}}'s current process?

${signOff}`,
  },
  {
    name: "New buildings under management",
    group: "PROPERTY_MANAGER",
    reason: "ACQUISITION",
    subject: "New buildings at {{company.name}}",
    body: `Hello {{contact.firstName}},

I saw the news: {{news.headline}}. New buildings usually bring a fresh round of energy questions from owners and tenants.

Moca gives you live energy data for each building from the start, with costed action plans and automated tenant billing.

Would a short call to talk it through be useful?

${signOff}`,
  },

  // Occupiers
  {
    name: "One view of energy across every site",
    group: "OCCUPIER",
    reason: "GENERAL_INTRO",
    subject: "Energy across all of {{company.name}}'s sites",
    body: `Hello {{contact.firstName}},

When energy data sits with different landlords and suppliers, it is hard to see which sites cost the most and where savings would come from.

Moca brings live energy data from every site into one place, with clear priorities and costed actions. It is powered by Octopus and manages more than 5.7 million square feet.

Would a 20 minute call to see it be useful?

${signOff}`,
  },
  {
    name: "Credible carbon and ESOS plans",
    group: "OCCUPIER",
    reason: "NET_ZERO",
    subject: "Carbon and ESOS plans for {{company.name}}",
    body: `Hello {{contact.firstName}},

ESOS and SECR reporting, and net zero targets, all need plans that stand up to scrutiny, site by site.

Moca uses live energy data to build those plans, with costed actions and measurable results, and gives you better evidence when talking to landlords about improvements.

Could we set up a short call to show you how it works?

${signOff}`,
  },
  {
    name: "Energy at new sites",
    group: "OCCUPIER",
    reason: "ACQUISITION",
    subject: "Your new sites and their energy",
    body: `Hello {{contact.firstName}},

I saw the news: {{news.headline}}. New sites are the easiest time to get energy data and costs under control.

Moca gives you live energy data across old and new sites in one place, with clear priorities and costed actions.

Would it be worth a short call to talk about it?

${signOff}`,
  },
];

export const STARTER_SCRIPTS: ScriptSeed[] = [
  {
    name: "EPC risk call",
    group: "ASSET_ESG",
    reason: "EPC_RISK",
    opening:
      "Hello {{contact.firstName}}, it is {{sender.name}} from Moca. We help property owners use live energy data to decide which buildings to upgrade first for EPC. Have you got two minutes?",
    questions: [
      "How are you deciding which buildings to upgrade first as EPC standards tighten?",
      "Where does your energy data for each building come from today?",
      "Who else is involved when you decide where to invest?",
    ],
    objections: [
      { objection: "We already use a consultant.", response: "Many owners do. Moca uses live data, so priorities stay up to date between reports. Octopus Real Estate used it in place of a consultant and saved about £500,000." },
      { objection: "It is not a priority this year.", response: "Understood. Would it help to see where your buildings stand now, so you can plan ahead when it is?" },
    ],
    ask: "Could we book 30 minutes next week to look at a few of your buildings together?",
  },
  {
    name: "Net zero and CRREM call",
    group: "ASSET_ESG",
    reason: "NET_ZERO",
    opening:
      "Hello {{contact.firstName}}, it is {{sender.name}} from Moca. We help funds track net zero and CRREM progress building by building using live energy data. Is now a bad time?",
    questions: [
      "How do you currently track each asset against its CRREM pathway?",
      "Which buildings worry you most for net zero?",
      "How do you cost the actions needed to close the gap?",
    ],
    objections: [
      { objection: "We report on this already.", response: "That makes sense. Moca adds live data and costed actions, so the report turns into a plan." },
      { objection: "Send me something by email.", response: "Happy to. What would be most useful to you: an example action plan, or how the data is collected?" },
    ],
    ask: "Would you be open to a 30 minute demo with your asset team?",
  },
  {
    name: "Tender support call",
    group: "PROPERTY_MANAGER",
    reason: "TENDER",
    opening:
      "Hello {{contact.firstName}}, it is {{sender.name}} from Moca. We help managing agents offer energy services that stand out in tenders. Have you got a couple of minutes?",
    questions: [
      "What are landlords asking about energy and carbon in your recent tenders?",
      "How do you handle tenant energy recharges today?",
      "Would new services and income from energy be of interest to the business?",
    ],
    objections: [
      { objection: "Our clients handle energy themselves.", response: "Some do. Others want their agent to take it on, and Moca lets you offer that without adding admin." },
      { objection: "We do not have time for another system.", response: "Moca automates tenant billing, so the aim is to take work away rather than add it." },
    ],
    ask: "Could we book a short call before your next tender deadline?",
  },
  {
    name: "Tenant billing introduction call",
    group: "PROPERTY_MANAGER",
    reason: "GENERAL_INTRO",
    opening:
      "Hello {{contact.firstName}}, it is {{sender.name}} from Moca. We automate tenant energy billing for managing agents using live energy data. Is it a good time for two minutes?",
    questions: [
      "How long does a round of tenant energy recharges take your team?",
      "How often do tenants query their energy bills?",
      "Who looks after service charges and energy recharges at {{company.name}}?",
    ],
    objections: [
      { objection: "Our spreadsheets work fine.", response: "They often do until something changes. Moca keeps an accurate record from live data and saves the manual steps." },
      { objection: "We are tied into a supplier.", response: "Moca works with the energy data, so it does not depend on changing supplier." },
    ],
    ask: "Would a 20 minute walkthrough with the person who runs recharges be useful?",
  },
  {
    name: "Multi site energy call",
    group: "OCCUPIER",
    reason: "GENERAL_INTRO",
    opening:
      "Hello {{contact.firstName}}, it is {{sender.name}} from Moca. We help companies with several sites see all their energy in one place. Have you got a moment?",
    questions: [
      "How do you see energy use across all your sites today?",
      "Which sites cost the most to run, and do you know why?",
      "How do you work with landlords on energy improvements?",
    ],
    objections: [
      { objection: "Our landlords handle energy.", response: "Often they do. Moca gives you your own view, which helps when you ask landlords for improvements." },
      { objection: "We have too many other projects.", response: "Understood. Seeing where the biggest costs are can help decide which projects come first." },
    ],
    ask: "Could we book 30 minutes to look at a few of your sites together?",
  },
  {
    name: "Carbon and ESOS plans call",
    group: "OCCUPIER",
    reason: "NET_ZERO",
    opening:
      "Hello {{contact.firstName}}, it is {{sender.name}} from Moca. We help occupiers build credible carbon and ESOS plans from live energy data. Is now convenient?",
    questions: [
      "How are you preparing for your next ESOS or SECR report?",
      "What does your net zero plan look like site by site?",
      "Who signs off spending on energy and carbon projects?",
    ],
    objections: [
      { objection: "We use a consultant for ESOS.", response: "Moca can support that work with live data, so actions are tracked and measured after the report." },
      { objection: "Budget is tight.", response: "That is exactly why costed actions help: you can see which ones pay back first." },
    ],
    ask: "Would you be open to a short demo with whoever leads your ESOS work?",
  },
];

/** Adds the starter library to an organisation. Skips anything already there with the same name. */
export async function installStarterLibrary(db: Pick<PrismaClient, "emailTemplate" | "callScript">, organisationId: string) {
  const [emails, scripts] = await Promise.all([
    db.emailTemplate.findMany({ where: { organisationId }, select: { name: true } }),
    db.callScript.findMany({ where: { organisationId }, select: { name: true } }),
  ]);
  const haveEmails = new Set(emails.map((e) => e.name));
  const haveScripts = new Set(scripts.map((s) => s.name));
  const newEmails = STARTER_EMAILS.filter((e) => !haveEmails.has(e.name));
  const newScripts = STARTER_SCRIPTS.filter((s) => !haveScripts.has(s.name));
  if (newEmails.length) {
    await db.emailTemplate.createMany({
      data: newEmails.map((e) => ({ organisationId, name: e.name, customerGroup: e.group, reason: e.reason, subject: e.subject, body: e.body, isMarketing: true })),
    });
  }
  if (newScripts.length) {
    await db.callScript.createMany({
      data: newScripts.map((s) => ({
        organisationId, name: s.name, customerGroup: s.group, reason: s.reason, opening: s.opening, questions: s.questions, objections: s.objections, ask: s.ask,
      })),
    });
  }
  return { emails: newEmails.length, scripts: newScripts.length };
}
