import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { canEdit, canView } from "@/lib/permissions";
import { formatDate, formatDateTime, formatPounds } from "@/lib/format";
import { callOutcomeLabels, lossReasonLabels, stakeholderRoleLabels } from "@/lib/labels";
import { QUALIFICATION_FIELDS } from "@/lib/qualification";
import { SuggestionCard } from "../../transcripts/forms";
import { calculateHealth, wholeDays } from "@/lib/deals/health";
import { averageDaysByStage } from "@/lib/deals/recalculate";
import { loadPickerOptions } from "@/lib/options";
import { HealthFlag } from "@/components/deal-bits";
import { Badge, Notice } from "@/components/ui";
import { AddStakeholder, DealBasicsForm, NoteForm, QualificationForm, StageMover, StakeholderRow } from "./DealPanels";
import { dropStakeholder, toggleFollow } from "../actions";

type TimelineItem = { at: Date; kind: string; title: string; detail?: string | null; who?: string | null; href?: string };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { id, organisationId: user.organisationId },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true } },
      stage: true,
      pipeline: { include: { stages: { where: { archived: false }, orderBy: { position: "asc" } } } },
      contacts: { include: { contact: { select: { id: true, firstName: true, lastName: true, jobTitle: true, optedOut: true, ownerId: true, isShared: true, organisationId: true } } }, orderBy: { addedAt: "asc" } },
      followers: { select: { userId: true } },
      organisation: { select: { singleThreadedDays: true } },
    },
  });
  if (!deal || !canView(user, deal)) notFound();
  const editable = canEdit(user, deal, { sharedIsEditable: false });
  const now = new Date();

  const [averages, activities, history, emails, events, transcripts, battlecard, companyContacts, options] = await Promise.all([
    averageDaysByStage(user.organisationId),
    prisma.activity.findMany({ where: { dealId: deal.id }, include: { user: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 100 }),
    prisma.dealStageHistory.findMany({ where: { dealId: deal.id }, include: { fromStage: { select: { name: true } }, toStage: { select: { name: true } }, movedBy: { select: { name: true } } }, orderBy: { movedAt: "desc" } }),
    prisma.email.findMany({ where: { dealId: deal.id }, orderBy: { sentAt: "desc" }, take: 50 }),
    prisma.calendarEvent.findMany({ where: { dealId: deal.id, cancelled: false }, orderBy: { startAt: "desc" }, take: 50 }),
    prisma.callTranscript.findMany({ where: { dealId: deal.id }, select: { id: true, callAt: true, createdAt: true, summary: true, outcome: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    deal.competitor
      ? prisma.battlecard.findFirst({ where: { organisationId: user.organisationId, competitorName: { equals: deal.competitor.trim(), mode: "insensitive" } } })
      : null,
    prisma.contact.findMany({ where: { organisationId: user.organisationId, companyId: deal.companyId }, select: { id: true, firstName: true, lastName: true, ownerId: true, isShared: true, organisationId: true }, orderBy: { firstName: "asc" } }),
    loadPickerOptions(user),
  ]);
  const suggestions = await prisma.transcriptSuggestion.findMany({
    where: { dealId: deal.id, status: "PENDING" },
    include: { transcript: { select: { id: true, title: true, callAt: true, createdAt: true } } },
    orderBy: [{ kind: "desc" }, { createdAt: "asc" }],
  });
  const stageName = (stageId: string | null) => deal.pipeline.stages.find((s) => s.id === stageId)?.name ?? "an unknown stage";
  const fieldLabel = (key: string | null) => QUALIFICATION_FIELDS.find((f) => f.key === key)?.label ?? "Deal stage";

  const engaged = deal.contacts.filter((c) => c.engaged).length;
  const isOpen = deal.stage.kind === "OPEN";
  const health = calculateHealth({
    qualificationPct: deal.qualificationPct,
    engagedStakeholders: engaged,
    daysInStage: wholeDays(deal.stageEnteredAt, now) ?? 0,
    averageDaysInStage: averages.get(deal.stageId) ?? null,
    daysSinceActivity: wholeDays(deal.lastActivityAt, now),
    noActivityDays: deal.stage.noActivityDays,
  });
  const singleDays = wholeDays(deal.singleThreadedSince, now);
  const singleWarning = isOpen && singleDays !== null && singleDays > deal.organisation.singleThreadedDays;
  const following = deal.followers.some((f) => f.userId === user.id);
  const onDeal = new Set(deal.contacts.map((c) => c.contactId));
  const addable = companyContacts.filter((c) => !onDeal.has(c.id) && canView(user, c)).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName ?? ""}`.trim() }));
  const owners = [...options.people];

  const timeline: TimelineItem[] = [
    // Calls with a transcript are shown once, as the transcript.
    ...activities.filter((a) => !a.transcriptId).map((a) => ({ at: a.occurredAt, kind: { CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note" }[a.type], title: a.subject ?? { CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note" }[a.type], detail: a.body, who: a.user?.name })),
    ...history.map((h) => ({ at: h.movedAt, kind: "Stage", title: h.fromStage ? `Moved from ${h.fromStage.name} to ${h.toStage.name}` : `Created in ${h.toStage.name}`, who: h.movedBy?.name })),
    ...emails.map((e) => ({ at: e.sentAt, kind: "Email", title: e.subject ?? "Email", detail: e.snippet, who: e.direction === "SENT" ? "Sent" : `Received from ${e.fromAddress}` })),
    ...events.map((e) => ({ at: e.startAt, kind: "Meeting", title: e.title, detail: e.location })),
    ...transcripts.map((t) => ({ at: t.callAt ?? t.createdAt, kind: "Call transcript", title: t.outcome ? `Call: ${callOutcomeLabels[t.outcome]}` : "Call transcript", detail: t.summary, href: `/transcripts/${t.id}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const boardDeal = {
    id: deal.id, name: deal.name, companyName: deal.company.name, value: deal.value, ownerName: deal.owner.name, stageId: deal.stageId,
    expectedClose: null, daysInStage: 0, nextStep: deal.nextStep, healthFlag: deal.healthFlag, healthScore: deal.healthScore, qualificationPct: deal.qualificationPct, canMove: editable,
  };

  return (
    <>
      <p className="mb-3 text-sm"><Link href="/deals">Deals</Link> <span className="text-fg-muted">/ {deal.name}</span></p>

      <header className="mb-6 grid gap-6 border-b border-line pb-6 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm"><Link href={`/companies/${deal.company.id}`}>{deal.company.name}</Link></p>
          <h1 className="mt-1 text-3xl font-semibold">{deal.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-2xl font-semibold tabular-nums">{formatPounds(deal.value)}</span>
            <HealthFlag flag={deal.healthFlag} score={deal.healthScore} size="md" />
            <span className="text-fg-muted">Owner: {deal.owner.name ?? deal.owner.email}</span>
            <span className="text-fg-muted">Expected close {formatDate(deal.expectedCloseDate)}</span>
            <span className="text-fg-muted">{wholeDays(deal.stageEnteredAt, now)} days in {deal.stage.name}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <StageMover deal={boardDeal} stages={deal.pipeline.stages.map((s) => ({ id: s.id, name: s.name, colour: s.colour, kind: s.kind }))} disabled={!editable} />
          <Link href={`/calendar/new?dealId=${deal.id}${deal.contacts[0] ? `&contactId=${deal.contacts[0].contactId}` : ""}`} className="btn btn-secondary py-1.5 no-underline">Book a meeting</Link>
          <Link href={`/transcripts/new?dealId=${deal.id}${deal.contacts[0] ? `&contactId=${deal.contacts[0].contactId}` : ""}`} className="btn btn-secondary py-1.5 no-underline">Add a call</Link>
          <form action={toggleFollow}>
            <input type="hidden" name="dealId" value={deal.id} />
            <input type="hidden" name="follow" value={String(!following)} />
            <button type="submit" className="btn btn-secondary py-1.5">{following ? "Stop following" : "Follow"}</button>
          </form>
        </div>
      </header>

      <div className="mb-6 grid gap-3">
        {!editable ? <Notice>You can see this deal but only its owner, their manager or an admin can change it.</Notice> : null}
        {singleWarning ? (
          <Notice tone="amber" title="Single threaded">
            Only one person at {deal.company.name} has been engaged for {singleDays} days. Bring in someone else, ideally whoever signs off the spend.
          </Notice>
        ) : null}
        {deal.stage.kind === "LOST" ? (
          <Notice tone="red" title="Closed as lost">
            {deal.lossReason ? lossReasonLabels[deal.lossReason] : "No reason recorded"}. {deal.closeNote} (Closed {formatDate(deal.closedAt)})
          </Notice>
        ) : null}
        {deal.stage.kind === "WON" ? (
          <Notice tone="green" title={`Won for ${formatPounds(deal.finalValue ?? deal.value)}`}>
            {deal.closeNote} (Closed {formatDate(deal.closedAt)})
          </Notice>
        ) : null}
      </div>

      {suggestions.length ? (
        <section className="mb-8 rounded-lg border border-green/40 bg-panel" aria-labelledby="call-suggestions-heading">
          <div className="border-b border-line px-5 py-3">
            <h2 id="call-suggestions-heading" className="text-sm font-semibold">Suggested from calls: {suggestions.length} waiting for a decision</h2>
            <p className="mt-0.5 text-xs text-fg-muted">The AI picked these out of call transcripts. The deal only changes when you approve each one.</p>
          </div>
          <ul className="divide-y divide-line">
            {suggestions.map((s) => (
              <SuggestionCard
                  key={s.id}
                  source={<>From <Link href={`/transcripts/${s.transcript.id}`}>{s.transcript.title ?? "a call"}</Link> on {formatDate(s.transcript.callAt ?? s.transcript.createdAt)}</>}
                  id={s.id}
                  kind={s.kind}
                  label={s.kind === "STAGE_CHANGE" ? "Move to a new stage" : fieldLabel(s.field)}
                  current={s.kind === "STAGE_CHANGE" ? stageName(s.currentValue) : s.currentValue}
                  proposed={s.kind === "STAGE_CHANGE" ? stageName(s.proposedValue) : s.proposedValue}
                  evidence={s.evidence}
                  canDecide={editable}
                />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid content-start gap-8">
          <section className="card p-5" aria-labelledby="qual-heading">
            <h2 id="qual-heading" className="mb-3 text-lg font-semibold">Qualification</h2>
            <QualificationForm
              dealId={deal.id}
              pct={deal.qualificationPct}
              disabled={!editable}
              values={{ metric: deal.metric, economicBuyer: deal.economicBuyer, decisionCriteria: deal.decisionCriteria, decisionProcess: deal.decisionProcess, paperProcess: deal.paperProcess, identifiedPain: deal.identifiedPain, champion: deal.champion, competition: deal.competition }}
            />
          </section>

          <section className="card p-5" aria-labelledby="people-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="people-heading" className="text-lg font-semibold">People involved</h2>
              <span className="text-sm text-fg-muted">{engaged} engaged</span>
            </div>
            {deal.contacts.length === 0 ? (
              <p className="text-sm text-fg-muted">Nobody is linked to this deal yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {deal.contacts.map((dc) => (
                  <li key={dc.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div>
                      <Link href={`/contacts/${dc.contact.id}`} className="font-medium text-fg">{dc.contact.firstName} {dc.contact.lastName}</Link>
                      <p className="text-xs text-fg-muted">
                        {dc.contact.jobTitle ?? "Job title not recorded"}
                        {dc.role ? `, ${stakeholderRoleLabels[dc.role]}` : ""}
                        {dc.contact.optedOut ? ", opted out" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StakeholderRow dealId={deal.id} contactId={dc.contactId} role={dc.role} engaged={dc.engaged} disabled={!editable} />
                      {editable ? (
                        <form action={dropStakeholder}>
                          <input type="hidden" name="dealId" value={deal.id} />
                          <input type="hidden" name="contactId" value={dc.contactId} />
                          <button type="submit" className="text-xs text-red-text hover:underline" aria-label={`Remove ${dc.contact.firstName} from this deal`}>Remove</button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {editable ? <div className="mt-4 border-t border-line pt-4"><AddStakeholder dealId={deal.id} contacts={addable} /></div> : null}
          </section>

          <section aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="mb-3 text-lg font-semibold">Timeline</h2>
            {editable ? <div className="card mb-5 p-5"><NoteForm dealId={deal.id} /></div> : null}
            {timeline.length === 0 ? (
              <p className="text-sm text-fg-muted">Nothing has happened on this deal yet.</p>
            ) : (
              <ol className="relative border-l border-line pl-5">
                {timeline.map((t, i) => (
                  <li key={i} className="relative pb-5">
                    <span aria-hidden="true" className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-canvas bg-fg-muted" />
                    <p className="text-xs text-fg-muted">{formatDateTime(t.at)}, {t.kind}{t.who ? `, ${t.who}` : ""}</p>
                    <p className="mt-0.5 text-sm font-medium">{t.href ? <Link href={t.href} className="text-fg">{t.title}</Link> : t.title}</p>
                    {t.detail ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg-muted">{t.detail}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-8">
          {isOpen ? (
            <section className="card p-5" aria-labelledby="health-heading">
              <h2 id="health-heading" className="text-lg font-semibold">Health</h2>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-4xl font-semibold tabular-nums">{health.score}</span>
                <span className="text-sm text-fg-muted">out of 100</span>
                <span className="ml-auto"><HealthFlag flag={health.flag} size="md" /></span>
              </div>
              <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
                <dt className="text-fg-muted">Qualification</dt><dd className="tabular-nums">{health.parts.qualification} / 35</dd>
                <dt className="text-fg-muted">People engaged</dt><dd className="tabular-nums">{health.parts.stakeholders} / 25</dd>
                <dt className="text-fg-muted">Time in this stage</dt><dd className="tabular-nums">{health.parts.stageTime} / 20</dd>
                <dt className="text-fg-muted">Recent activity</dt><dd className="tabular-nums">{health.parts.recency} / 20</dd>
              </dl>
              {health.reasons.length ? (
                <ul className="mt-4 list-disc space-y-1 border-t border-line pl-5 pt-3 text-sm text-fg-muted">
                  {health.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              ) : null}
            </section>
          ) : null}

          {battlecard ? (
            <section className="card border-amber/40 p-5" aria-labelledby="battle-heading">
              <div className="flex items-center justify-between gap-2">
                <h2 id="battle-heading" className="text-lg font-semibold">Battlecard: {battlecard.competitorName}</h2>
                <Badge tone="amber">Competitor</Badge>
              </div>
              <p className="mt-3 text-sm leading-relaxed">{battlecard.comparison}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {((battlecard.objections as { objection: string; response: string }[]) ?? []).map((o) => (
                  <li key={o.objection} className="border-l-2 border-amber pl-3">
                    <p className="font-medium">{o.objection}</p>
                    <p className="mt-0.5 text-fg-muted">{o.response}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : deal.competitor ? (
            <Notice>No battlecard matches "{deal.competitor}" yet.</Notice>
          ) : null}

          <section className="card p-5" aria-labelledby="details-heading">
            <h2 id="details-heading" className="mb-4 text-lg font-semibold">Details</h2>
            <DealBasicsForm
              disabled={!editable}
              canReassign={editable && user.role !== "REP"}
              owners={owners}
              deal={{
                id: deal.id, name: deal.name, value: deal.value, expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.toISOString().slice(0, 10) : "",
                customerGroup: deal.customerGroup, nextStep: deal.nextStep, competitor: deal.competitor, ownerId: deal.ownerId, isShared: deal.isShared,
              }}
            />
          </section>
        </aside>
      </div>
    </>
  );
}
