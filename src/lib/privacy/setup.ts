// Starting points for the privacy centre: the suppliers the CRM uses, and the checklists.
// Supplier entries only say what this CRM sends to each one. Where the data is stored, and whether
// an agreement is in place, are left for a person to confirm, as they depend on the accounts chosen.
import { prisma } from "@/lib/db";

export const DEFAULT_SUPPLIERS = [
  {
    name: "Hostinger",
    purpose: "Hosting the CRM, its worker and its database on a virtual private server.",
    dataShared: "Everything stored in the CRM: business contact details, emails and meetings with contacts, call transcripts, notes and team members' accounts.",
    notes: "Choose a UK or EU data centre for the server, and check the data processing terms in the Hostinger account.",
  },
  {
    name: "Anthropic (Claude AI)",
    purpose: "Writing company summaries, outreach drafts and call scripts, summarising news and reading call transcripts. Every result is a draft for a person.",
    dataShared: "Company information, news headlines, and the text of drafts and call transcripts. Email addresses and phone numbers are removed first, and documents marked as holding personal details are never sent.",
    notes: "Confirm in the commercial terms that data sent through the API is not used to train models, and where it is processed.",
  },
  {
    name: "Email sending service",
    purpose: "Sending alert emails, morning summaries and reminders to our own team.",
    dataShared: "Team members' names and work email addresses, and deal, company and task details in the alerts.",
    notes: "Name the service used (for example Hostinger email) once chosen.",
  },
  {
    name: "GNews (news service)",
    purpose: "Finding news about companies in the CRM.",
    dataShared: "Company names only. No personal data is sent.",
    notes: "Only needed if the news service is switched on in News settings.",
  },
  {
    name: "Google",
    purpose: "Sign in, and Gmail and Google Calendar for team members who connect them.",
    dataShared: "Team members' sign in details. Emails and meetings with contacts are read from, and sent through, each person's own account.",
    notes: "Covered by the Google Workspace data processing terms, if Moca uses Workspace.",
  },
  {
    name: "Microsoft",
    purpose: "Sign in, and Outlook email and calendar for team members who connect them.",
    dataShared: "Team members' sign in details. Emails and meetings with contacts are read from, and sent through, each person's own account.",
    notes: "Covered by the Microsoft 365 data protection terms, if Moca uses Microsoft 365.",
  },
] as const;

/** Adds the standard suppliers the first time the register is opened. Never overwrites edits. */
export async function ensureDefaultSuppliers(organisationId: string) {
  if (await prisma.supplier.count({ where: { organisationId } })) return;
  await prisma.supplier.createMany({ data: DEFAULT_SUPPLIERS.map((s) => ({ organisationId, ...s })), skipDuplicates: true });
}

export type ChecklistState = Record<string, { done: boolean; doneAt?: string; doneById?: string; note?: string }>;

/** Before going live. Items marked "auto" are ticked from the CRM's own settings. */
export const GO_LIVE_CHECKLIST = [
  { key: "lead", label: "Name a data protection lead", auto: true },
  { key: "icoFee", label: "Pay the ICO data protection fee, and record the renewal date", auto: false },
  { key: "lia", label: "Complete the legitimate interests assessment", auto: true },
  { key: "dpia", label: "Complete a data protection impact assessment (a short risk review), including call transcripts and AI use", auto: false },
  { key: "privacyNotice", label: "Publish the privacy notice and add its link in Organisation settings", auto: true },
  { key: "footer", label: "Complete the details for the marketing email footer", auto: true },
  { key: "suppliers", label: "Data processing agreements in place with every supplier", auto: true },
  { key: "retention", label: "Check the retention periods suit Moca", auto: false },
  { key: "admin2step", label: "Two step sign in switched on for every admin (in Google or Microsoft)", auto: false },
  { key: "backups", label: "Encrypted backups set up, and a restore tested", auto: false },
  { key: "breachProcedure", label: "Breach procedure agreed, and the team knows how to report a breach", auto: false },
  { key: "staffGuidance", label: "Staff guidance shared on notes, opt outs and the do not call lists", auto: false },
  { key: "recordingNotice", label: "Call recording notice added to the start of recorded calls", auto: false },
  { key: "tps", label: "Arrange TPS and CTPS checks before cold calls", auto: false },
] as const;

export const BREACH_CHECKLIST = [
  { key: "contain", label: "Contain it: for example reset passwords, recall the email, remove access", auto: false },
  { key: "assess", label: "Work out what data, and how many people, are involved", auto: false },
  { key: "risk", label: "Decide the risk to the people affected", auto: true },
  { key: "ico", label: "Decide whether to tell the ICO, within 72 hours of finding out", auto: true },
  { key: "people", label: "Tell the people affected without delay if the risk to them is high", auto: false },
  { key: "record", label: "Record what happened, its effects and what was done, even if it is not reported", auto: false },
  { key: "prevent", label: "Take steps so it does not happen again", auto: false },
] as const;

export const BREACH_HOURS = 72;
