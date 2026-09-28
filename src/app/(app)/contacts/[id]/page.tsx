import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { canEdit, canView, visibleWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { entityTypeLabels, lawfulBasisLabels, stakeholderRoleLabels } from "@/lib/labels";
import { formatDate, formatPounds, daysBetween } from "@/lib/format";
import { canColdCall, canEmailForMarketing, privacyNoticeStatus, treatedAsIndividual } from "@/lib/contacts/compliance";
import { loadPickerOptions } from "@/lib/options";
import { londonTodayIso } from "@/lib/dates";
import { Badge, Notice } from "@/components/ui";
import { ContactForm } from "../ContactForm";
import { updateContact, removeContactTag } from "../actions";
import { AddContactTagForm, DateRecordForm, OptOutForm, PhoneCheckForm } from "./panels";

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${ok ? "bg-green-tint text-green-ink" : "bg-amber-tint text-amber-ink"}`}>
        {ok ? "✓" : "!"}
      </span>
      <span>
        <span className="font-medium">{label}</span>
        <span className="sr-only">{ok ? " (done)" : " (needs attention)"}</span>
        {detail ? <span className="block text-ink-muted">{detail}</span> : null}
      </span>
    </li>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, organisationId: user.organisationId },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      dealRoles: { include: { deal: { select: { id: true, name: true, value: true, ownerId: true, isShared: true, organisationId: true, stage: { select: { name: true } } } } } },
    },
  });
  if (!contact || !canView(user, contact)) notFound();

  // Record who viewed personal data.
  await audit({ organisationId: user.organisationId, userId: user.id, action: "contact.viewed", entityType: "Contact", entityId: contact.id });

  const editable = canEdit(user, contact, { sharedIsEditable: true });
  const [org, options, companies] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { phoneCheckMaxAgeDays: true, privacyNoticeUrl: true } }),
    loadPickerOptions(user),
    editable
      ? prisma.company.findMany({ where: visibleWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" }, take: 2000 })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const email = canEmailForMarketing(contact);
  const call = canColdCall(contact, org.phoneCheckMaxAgeDays);
  const notice = privacyNoticeStatus(contact);
  const today = londonTodayIso();
  const owners = [...options.assignableOwners];
  if (contact.owner && !owners.some((o) => o.id === contact.owner!.id)) owners.push({ id: contact.owner.id, name: contact.owner.name ?? contact.owner.email });
  if (contact.company && !companies.some((c) => c.id === contact.company!.id)) companies.push(contact.company);
  const deals = contact.dealRoles.filter((r) => canView(user, r.deal));

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/contacts">Contacts</Link> <span className="text-ink-muted">/ {contact.firstName} {contact.lastName}</span></p>
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold sm:text-3xl">{contact.firstName} {contact.lastName}</h1>
          {contact.optedOut ? <Badge tone="red">Opted out: do not contact</Badge> : null}
        </div>
        <p className="mt-1.5 text-ink-muted">
          {contact.jobTitle ?? "Job title not recorded"}
          {contact.company ? <> at <Link href={`/companies/${contact.company.id}`}>{contact.company.name}</Link></> : null}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {contact.tags.map((t) => (
            <span key={t.tagId} className="inline-flex items-center gap-1">
              <Badge>{t.tag.name}</Badge>
              {editable ? (
                <form action={removeContactTag}>
                  <input type="hidden" name="id" value={contact.id} />
                  <input type="hidden" name="tagId" value={t.tagId} />
                  <button type="submit" aria-label={`Remove tag ${t.tag.name}`} className="text-xs text-ink-muted hover:text-red-ink">×</button>
                </form>
              ) : null}
            </span>
          ))}
          {editable ? <AddContactTagForm id={contact.id} /> : null}
        </div>
      </header>

      {contact.optedOut ? (
        <div className="mb-8">
          <Notice tone="red" title="This person has opted out">
            Opted out on {formatDate(contact.optedOutAt)}. Reason: {contact.doNotContactReason ?? "not recorded"}. Nobody in the team may email or call them.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-6" aria-labelledby="contact-details">
          <h2 id="contact-details" className="mb-5 text-lg font-semibold">Details</h2>
          {editable ? (
            <ContactForm
              contact={{
                id: contact.id, firstName: contact.firstName, lastName: contact.lastName, jobTitle: contact.jobTitle,
                email: contact.email, phone: contact.phone, linkedinUrl: contact.linkedinUrl, companyId: contact.companyId,
                ownerId: contact.ownerId, isShared: contact.isShared, notes: contact.notes, entityType: contact.entityType,
              }}
              isNew={false}
              companies={companies}
              owners={owners}
              allowNoOwner={user.role !== "REP"}
              action={updateContact}
              todayIso={today}
            />
          ) : (
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-ink-muted">Work email</dt><dd>{contact.email ?? "None"}</dd></div>
              <div><dt className="text-ink-muted">Work phone</dt><dd>{contact.phone ?? "None"}</dd></div>
              <div><dt className="text-ink-muted">Profile link</dt><dd>{contact.linkedinUrl ? <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer">{contact.linkedinUrl}</a> : "None"}</dd></div>
              <div><dt className="text-ink-muted">Notes</dt><dd className="whitespace-pre-wrap">{contact.notes ?? "None"}</dd></div>
            </dl>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section className="card p-6" aria-labelledby="dp-heading">
            <h2 id="dp-heading" className="text-lg font-semibold">Data protection</h2>
            <dl className="mt-4 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-ink-muted">Lawful reason</dt><dd>{lawfulBasisLabels[contact.lawfulBasis]}</dd>
              <dt className="text-ink-muted">Source</dt><dd>{contact.source}</dd>
              <dt className="text-ink-muted">Collected on</dt><dd>{formatDate(contact.collectedAt)}</dd>
              <dt className="text-ink-muted">Business type</dt><dd>{entityTypeLabels[contact.entityType]}</dd>
              <dt className="text-ink-muted">Owner</dt><dd>{contact.owner?.name ?? "No owner"}</dd>
            </dl>

            <ul className="mt-5 space-y-4 border-t border-stone pt-5 text-sm">
              <li>
                <ul>
                  <Check
                    ok={notice.state === "sent"}
                    label={notice.state === "sent" ? `Told how we use their data on ${formatDate(contact.privacyNoticeSentAt)}` : "Not yet told how we use their data"}
                    detail={
                      notice.state === "overdue"
                        ? `Overdue: we must tell people within one month of getting their details (${notice.days} days so far). The first email includes the privacy notice.`
                        : notice.state === "due"
                          ? `Must be done within ${notice.daysLeft} days. The first email includes the privacy notice.`
                          : undefined
                    }
                  />
                </ul>
                {editable && notice.state !== "sent" ? <DateRecordForm id={contact.id} kind="notice" todayIso={today} label="Date they were told" button="Record" /> : null}
              </li>
              <li>
                <ul>
                  <Check ok={email.ok} label={email.ok ? "Marketing emails allowed" : "Marketing emails blocked"} detail={email.ok ? "Every marketing email includes who we are, a privacy line and an unsubscribe link." : email.reason} />
                </ul>
                {editable && !contact.optedOut && treatedAsIndividual(contact.entityType) && !contact.consentAt ? (
                  <DateRecordForm id={contact.id} kind="consent" todayIso={today} label="Date they gave consent" button="Record consent" />
                ) : null}
                {contact.consentAt ? <p className="ml-8 mt-1 text-xs text-ink-muted">Consent recorded on {formatDate(contact.consentAt)}.</p> : null}
              </li>
              <li>
                <ul>
                  <Check
                    ok={call.ok}
                    label={call.ok ? "Cold calls allowed" : "Cold calls blocked"}
                    detail={
                      call.ok
                        ? `Checked against the TPS and CTPS do not call lists ${daysBetween(contact.phoneCheckedAt)} days ago. A fresh check is needed after ${org.phoneCheckMaxAgeDays} days.`
                        : call.reason
                    }
                  />
                </ul>
                {editable && contact.phone && !contact.optedOut ? <PhoneCheckForm id={contact.id} /> : null}
              </li>
            </ul>

            {!contact.optedOut ? (
              <div className="mt-6 border-t border-stone pt-5">
                <p className="mb-3 text-sm text-ink-muted">If this person asks us to stop contacting them, record it straight away.</p>
                <OptOutForm id={contact.id} />
              </div>
            ) : null}
            {org.privacyNoticeUrl ? (
              <p className="mt-4 text-xs text-ink-muted">Full privacy notice: <a href={org.privacyNoticeUrl} target="_blank" rel="noopener noreferrer">{org.privacyNoticeUrl}</a></p>
            ) : null}
          </section>

          <section className="section-plain" aria-labelledby="deals-heading">
            <h2 id="deals-heading" className="text-lg font-semibold">Deals</h2>
            {deals.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Not linked to any deals you can see.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone text-sm">
                {deals.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 py-2.5">
                    <span>
                      <span className="font-medium">{r.deal.name}</span>
                      <span className="block text-ink-muted">{r.deal.stage.name}{r.role ? `, ${stakeholderRoleLabels[r.role]}` : ""}</span>
                    </span>
                    <span className="tabular-nums">{formatPounds(r.deal.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
