import Link from "next/link";
import clsx from "clsx";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { lawfulBasisLabels } from "@/lib/labels";
import { goLiveChecklist } from "@/lib/privacy/checklist";
import { ensureDefaultSuppliers } from "@/lib/privacy/setup";
import type { LawfulBasis } from "@/generated/prisma/enums";
import { AssessmentForm } from "../forms";
import { toggleChecklist } from "../actions";

export const metadata = { title: "Records and checklist" };

type Lia = { purpose?: string; necessity?: string; balance?: string; safeguards?: string; outcome?: string; reviewedAt?: string; reviewedById?: string };

const STARTING_LIA = {
  purpose: "",
  necessity: "",
  balance: "",
  safeguards:
    "Only business details are collected (name, job title, work email, work phone, company, public professional profile). Every first email includes who we are, why we hold the details, where they came from and how to object. Every marketing email has a working unsubscribe link, and opt outs are honoured straight away for everyone. Phone numbers are checked against the TPS and CTPS before cold calls. Data is kept for limited periods and deleted after admin approval. Access is limited by role and views are recorded.",
  outcome: "",
};

export default async function RecordsPage() {
  const user = await requireCapability("privacy.access");
  const orgId = user.organisationId;
  await ensureDefaultSuppliers(orgId);
  const [org, checklist, suppliers, contacts, byBasis, emails, meetings, transcripts, news, users, suppressed, requests, breaches, reviewer] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: orgId } }),
    goLiveChecklist(orgId),
    prisma.supplier.findMany({ where: { organisationId: orgId }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.contact.count({ where: { organisationId: orgId } }),
    prisma.contact.groupBy({ by: ["lawfulBasis"], where: { organisationId: orgId }, _count: { _all: true } }),
    prisma.email.count({ where: { organisationId: orgId } }),
    prisma.calendarEvent.count({ where: { organisationId: orgId, contactId: { not: null } } }),
    prisma.callTranscript.count({ where: { organisationId: orgId } }),
    prisma.newsItem.count({ where: { organisationId: orgId } }),
    prisma.user.count({ where: { organisationId: orgId } }),
    prisma.suppression.count({ where: { organisationId: orgId } }),
    prisma.dataRequest.count({ where: { organisationId: orgId } }),
    prisma.breach.count({ where: { organisationId: orgId } }),
    Promise.resolve(null as null | { name: string | null }),
  ]);
  const lia = { ...STARTING_LIA, ...((org.legitimateInterestsAssessment ?? {}) as Lia) };
  const liaReviewer = lia.reviewedById ? await prisma.user.findUnique({ where: { id: lia.reviewedById }, select: { name: true } }) : reviewer;
  const lead = org.dataProtectionLeadId ? await prisma.user.findUnique({ where: { id: org.dataProtectionLeadId }, select: { name: true, email: true } }) : null;
  const basis = byBasis.map((b) => `${lawfulBasisLabels[b.lawfulBasis as LawfulBasis]} (${b._count._all})`).join(", ") || "None yet";
  const all = suppliers.map((s) => s.name);
  const pick = (...names: string[]) => all.filter((n) => names.some((x) => n.startsWith(x))).join(", ") || "None";

  const rows = [
    {
      what: "Business contacts", count: contacts,
      data: "Name, job title, work email, work phone, company, public professional profile link, business notes, where the details came from, marketing and do not call checks.",
      why: "Finding and contacting businesses that may benefit from Moca, and managing the relationship.",
      basis, who: "Reps: their own and shared contacts. Managers: their team's. Admins: all.",
      keep: `Deleted after ${org.retainContactsMonths} months with no activity, once an admin approves.`,
      shared: pick("Hostinger", "Google", "Microsoft", "Email sending"),
    },
    {
      what: "Emails with contacts", count: emails,
      data: "Addresses, subject and a short extract. The full text only for emails sent from the CRM. Never attachments.",
      why: "Keeping a record of conversations against the right contact and deal.",
      basis: "Legitimate interests", who: "As for the contact and deal they are saved against.",
      keep: "Deleted with the contact.", shared: pick("Hostinger", "Google", "Microsoft"),
    },
    {
      what: "Meetings with contacts", count: meetings,
      data: "Title, time, place and attendees' email addresses.",
      why: "Planning meetings and keeping the calendar in step.",
      basis: "Legitimate interests", who: "The person whose calendar it is, and people who can see the deal.",
      keep: "Unlinked from the person when their contact is deleted.", shared: pick("Hostinger", "Google", "Microsoft"),
    },
    {
      what: "Call transcripts", count: transcripts,
      data: "What was said on sales calls, whether the person was told the call was recorded, and the AI's summary.",
      why: "Accurate notes, follow ups and deal records.",
      basis: "Legitimate interests, with a recording notice at the start of each call",
      who: "The person who added it and their manager, people who can see the deal or contact, and admins. Every view is recorded.",
      keep: `${org.retainTranscriptsMonths} months, or sooner if deleted.`, shared: `${pick("Hostinger", "Anthropic")} (email addresses and phone numbers removed before AI use)`,
    },
    {
      what: "News about companies", count: news,
      data: "Headline, source, link, date and a short summary. Usually about companies, sometimes naming people in public roles.",
      why: "Knowing when to get in touch.",
      basis: "Legitimate interests", who: "Anyone who can see the company.",
      keep: `${org.retainNewsMonths} months.`, shared: pick("Hostinger", "Anthropic", "GNews"),
    },
    {
      what: "Team members", count: users,
      data: "Name, work email, role, team, sign in details and a log of important actions.",
      why: "Running the CRM securely and giving each person the right access.",
      basis: "Legitimate interests, as part of their work", who: "Admins.",
      keep: "While they use the CRM. Accounts are switched off when they leave.", shared: pick("Hostinger", "Google", "Microsoft", "Email sending"),
    },
    {
      what: "Do not contact list", count: suppressed,
      data: "A scrambled copy of an email address or phone number (it cannot be read back), a masked hint and the reason.",
      why: "Making sure people who opted out are never contacted again, even after their record is deleted.",
      basis: "Legitimate interests (respecting their objection)", who: "Checked automatically; admins see the hints.",
      keep: "For as long as we contact people, so the opt out keeps working.", shared: pick("Hostinger"),
    },
    {
      what: "Requests and breach records", count: requests + breaches,
      data: "Who asked, what they asked, what was done; what went wrong and the decisions made.",
      why: "Showing we handle people's rights and incidents properly.",
      basis: "Legal obligation", who: "The data protection lead and admins.",
      keep: "Kept as a record.", shared: pick("Hostinger"),
    },
  ];

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Records and checklist</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          What personal data we hold, why, who can see it, how long it is kept and who it is shared with. Filled in automatically from the CRM, and correct as of {formatDateTime(new Date())}.
        </p>
        <p className="mt-2 text-sm">Data protection lead: {lead ? `${lead.name ?? lead.email}` : <span className="text-amber-text">not named yet (set under Keeping data)</span>}</p>
      </header>

      <section aria-labelledby="ropa-heading" className="grid gap-3">
        <h2 id="ropa-heading" className="text-lg font-semibold">What we hold</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-panel">
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-fg-muted">
              <tr>
                {["Records", "What is held", "Why", "Lawful basis", "Who can see it", "How long", "Shared with"].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {rows.map((r) => (
                <tr key={r.what}>
                  <th scope="row" className="px-4 py-3 font-medium">{r.what}<span className="block text-xs font-normal tabular-nums text-fg-muted">{r.count.toLocaleString("en-GB")} held</span></th>
                  <td className="px-4 py-3 text-fg-muted">{r.data}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.why}</td>
                  <td className="px-4 py-3">{r.basis}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.who}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.keep}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.shared}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-muted">
          No sensitive information (such as health, politics, religion or family) is collected. No decisions about people are made by machine alone: AI scores are about companies, and a person reviews every AI draft and approves every suggested change. Supplier details are in the <Link href="/privacy/suppliers">supplier register</Link>.
        </p>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="checklist-heading" className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line px-5 py-3">
            <h2 id="checklist-heading" className="text-sm font-semibold">Before going live: {checklist.done} of {checklist.total} done</h2>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-sunk" aria-hidden="true">
              <div className="h-full rounded-full bg-green-text transition-[width] duration-700" style={{ width: `${Math.round((checklist.done / checklist.total) * 100)}%` }} />
            </div>
          </div>
          <ul className="divide-y divide-line">
            {checklist.items.map((c) => (
              <li key={c.key} className="flex items-start gap-3 px-5 py-3 text-sm">
                {c.auto ? (
                  <span aria-hidden="true" className={clsx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold", c.done ? "bg-green-tint text-green-text" : "bg-amber-tint text-amber-text")}>{c.done ? "✓" : "!"}</span>
                ) : (
                  <form action={toggleChecklist}>
                    <input type="hidden" name="key" value={c.key} />
                    <input type="hidden" name="done" value={String(!c.done)} />
                    <button type="submit" aria-label={`${c.done ? "Untick" : "Tick"}: ${c.label}`} className={clsx("mt-0.5 grid size-5 place-items-center rounded-full border-2 text-xs font-bold", c.done ? "border-green-text bg-green-tint text-green-text" : "border-line-strong hover:border-green-text")}>{c.done ? "✓" : ""}</button>
                  </form>
                )}
                <span>
                  {c.label}
                  <span className="sr-only">{c.done ? " (done)" : " (not done)"}</span>
                  {c.detail ? <span className="block text-xs text-fg-muted">{c.detail}</span> : c.doneAt ? <span className="block text-xs text-fg-muted">Ticked {formatDate(c.doneAt)}</span> : c.auto ? null : <span className="block text-xs text-fg-muted">Tick when done.</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-fg-muted">
            Reminders are emailed for the ICO fee renewal and the impact assessment review, using the dates under <Link href="/privacy/retention">Keeping data</Link>.
          </p>
        </section>

        <section aria-labelledby="lia-heading" className="card p-6">
          <h2 id="lia-heading" className="text-lg font-semibold">Legitimate interests assessment</h2>
          <p className="mt-1 text-sm text-fg-muted">
            The written reasoning for relying on legitimate interests for business to business prospecting. Answer the three tests in your own words. {lia.reviewedAt ? `Last saved ${formatDateTime(lia.reviewedAt)}${liaReviewer?.name ? ` by ${liaReviewer.name}` : ""}.` : "Not written yet."}
          </p>
          <div className="mt-5">
            <AssessmentForm a={{ purpose: lia.purpose ?? "", necessity: lia.necessity ?? "", balance: lia.balance ?? "", safeguards: lia.safeguards ?? "", outcome: lia.outcome ?? "" }} />
          </div>
        </section>
      </div>

      <section aria-labelledby="security-heading" className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel p-5">
          <h2 id="security-heading" className="text-sm font-semibold">How the data is protected</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
            <li>Sign in only with Google or Microsoft work accounts, and only by invitation.</li>
            <li>Access by role: reps, managers and admins each see only what they need.</li>
            <li>Email and calendar sign in details are stored encrypted. The do not contact list holds only scrambled copies.</li>
            <li>Every view of a contact or transcript, and every download, is recorded in the <Link href="/privacy/access-log">access log</Link>.</li>
            <li>Personal details are removed before anything is sent to the AI where possible.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-line bg-panel p-5">
          <h2 className="text-sm font-semibold">Cookies</h2>
          <p className="mt-2 text-sm text-fg-muted">
            The CRM uses only essential cookies: one to keep people signed in, and short lived ones that protect sign in and connecting email or calendar. There are no analytics or advertising cookies, so no cookie banner is needed. If analytics are ever added, they must ask for permission first.
          </p>
        </div>
      </section>
    </>
  );
}
