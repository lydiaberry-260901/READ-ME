// The daily task list, run every weekday at 07:00 London time for every active person.
// Each rule suggests tasks with a reason, a suggested action and sometimes a draft message.
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { isoDay, startOfLondonDay } from "@/lib/calendar-view";
import { weekStart } from "@/lib/analytics/calc";
import { wholeDays } from "@/lib/deals/health";
import { canColdCall } from "@/lib/contacts/compliance";
import { healthFlagLabels } from "@/lib/labels";
import { planDailyTasks, type Candidate } from "./plan";

const DAY = 86_400_000;
export const FOLLOW_UP_AFTER_DAYS = 5;
export const FOLLOW_UP_WINDOW_DAYS = 14;
export const PROSPECTS_PER_DAY = 3;
export const PROSPECT_QUIET_DAYS = 60;
const NEWS_RELEVANCE = 4;

const personName = (c: { firstName: string; lastName: string | null }) => `${c.firstName} ${c.lastName ?? ""}`.trim();

/** Everything the rules suggest for one person today. */
export async function gatherCandidates(user: { id: string; name: string | null; organisationId: string }, org: { phoneCheckMaxAgeDays: number }, now = new Date()): Promise<Candidate[]> {
  const today = isoDay(now);
  const dueToday = new Date(startOfLondonDay(today).getTime() + 17 * 3_600_000); // 17:00 London
  const out: Candidate[] = [];
  const orgId = user.organisationId;

  const [drafts, readyCalls, sentEmails, openDeals, news, prospects] = await Promise.all([
    prisma.outreachDraft.findMany({
      where: { organisationId: orgId, userId: user.id, kind: "EMAIL", status: "DRAFT", createdAt: { lt: new Date(now.getTime() - DAY) } },
      include: { contact: { select: { id: true, firstName: true, lastName: true, optedOut: true } } },
    }),
    prisma.outreachDraft.findMany({
      where: { organisationId: orgId, userId: user.id, kind: "CALL_SCRIPT", status: "READY" },
      include: { contact: true },
    }),
    prisma.email.findMany({
      where: {
        organisationId: orgId, userId: user.id, direction: "SENT", repliedAt: null,
        sentAt: { gte: new Date(now.getTime() - FOLLOW_UP_WINDOW_DAYS * DAY), lte: new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * DAY) },
        contact: { optedOut: false, restricted: false },
      },
      include: { contact: { select: { id: true, firstName: true, lastName: true, companyId: true } } },
      orderBy: { sentAt: "desc" },
    }),
    prisma.deal.findMany({
      where: { organisationId: orgId, ownerId: user.id, stage: { kind: "OPEN" } },
      include: { stage: { select: { name: true, noActivityDays: true } }, company: { select: { name: true } } },
    }),
    prisma.newsItem.findMany({
      where: { organisationId: orgId, status: "NEW", relevance: { gte: NEWS_RELEVANCE }, createdAt: { gte: new Date(now.getTime() - 3 * DAY) }, company: { ownerId: user.id } },
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.company.findMany({
      where: {
        organisationId: orgId, ownerId: user.id, score: { gte: 4 },
        OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: new Date(now.getTime() - PROSPECT_QUIET_DAYS * DAY) } }],
        deals: { none: { stage: { kind: "OPEN" } } },
      },
      include: { contacts: { where: { optedOut: false, restricted: false, email: { not: null } }, select: { id: true, firstName: true, lastName: true }, take: 1 } },
      orderBy: [{ score: "desc" }, { importance: "asc" }],
      take: 20,
    }),
  ]);

  // 1. Outreach steps waiting: unsent email drafts, and calls marked ready.
  for (const d of drafts) {
    if (!d.contact || d.contact.optedOut) continue;
    out.push({
      rule: "outreach", dedupeKey: `draft:${d.id}`, title: `Finish and send your email to ${personName(d.contact)}`, type: "EMAIL", priority: "MEDIUM", dueAt: dueToday,
      reason: `You started this email on ${formatDate(d.createdAt)} and it has not been sent.`, origin: "RULE",
      suggestedAction: "Open the draft, check it reads well, then send it or discard it.", contactId: d.contact.id, companyId: d.companyId,
    });
  }
  for (const d of readyCalls) {
    if (!d.contact) continue;
    const check = canColdCall(d.contact, org.phoneCheckMaxAgeDays, now);
    out.push({
      rule: "call", dedupeKey: `call:${d.id}`, title: `Call ${personName(d.contact)}`, type: "CALL", priority: "HIGH", dueAt: dueToday,
      reason: "Your call script is ready and the number has been checked against the do not call lists.", origin: "RULE",
      suggestedAction: check.ok ? "Open the call script and make the call, then log how it went." : `Check the number again before calling: ${check.reason}`,
      contactId: d.contact.id, companyId: d.companyId,
    });
  }

  // 2. Follow ups: emails with no reply after five days. Only the newest email to each person.
  const followedUp = new Set<string>();
  for (const e of sentEmails) {
    if (!e.contact || followedUp.has(e.contact.id)) continue;
    const later = await prisma.email.count({ where: { organisationId: orgId, contactId: e.contact.id, sentAt: { gt: e.sentAt } } });
    if (later > 0) continue;
    followedUp.add(e.contact.id);
    const first = e.contact.firstName;
    out.push({
      rule: "followUp", dedupeKey: `email-followup:${e.id}`, title: `Follow up with ${personName(e.contact)}`, type: "FOLLOW_UP", priority: "MEDIUM", dueAt: dueToday,
      reason: `You emailed on ${formatDate(e.sentAt)}${e.subject ? ` about "${e.subject}"` : ""} and have not had a reply.`, origin: "RULE",
      suggestedAction: "Send a short, friendly follow up, or try a call if you have a checked number.",
      draftMessage: `Hello ${first},\n\nI wanted to follow up on my email of ${formatDate(e.sentAt)}${e.subject ? ` about "${e.subject}"` : ""}. Would a short call be useful?\n\nBest wishes,\n${user.name ?? ""}`.trim(),
      contactId: e.contact.id, companyId: e.contact.companyId, dealId: e.dealId,
    });
  }

  for (const d of openDeals) {
    // 3. Deals quiet for longer than their stage allows.
    const anchor = d.lastActivityAt ?? d.stageEnteredAt;
    const quiet = wholeDays(anchor, now) ?? 0;
    if (quiet > d.stage.noActivityDays) {
      out.push({
        rule: "stale", dedupeKey: `stale:${d.id}:${d.stageId}:${isoDay(anchor)}`, title: `Get ${d.name} moving again`, type: "FOLLOW_UP",
        priority: d.value >= 50_000 ? "HIGH" : "MEDIUM", dueAt: dueToday, value: d.value,
        reason: `Nothing has happened on this deal for ${quiet} days. The limit for ${d.stage.name} is ${d.stage.noActivityDays} days.`, origin: "RULE",
        suggestedAction: d.nextStep ? `The next step was: ${d.nextStep}. Do it, or update the next step.` : "Get in touch with your contact at the company and agree a next step.",
        dealId: d.id, companyId: d.companyId,
      });
    }
    // 4. Deals that have just become at risk or stalled.
    if ((d.healthFlag === "AT_RISK" || d.healthFlag === "STALLED") && d.healthFlagChangedAt && now.getTime() - d.healthFlagChangedAt.getTime() <= 3 * DAY) {
      out.push({
        rule: "flagged", dedupeKey: `flag:${d.id}:${d.healthFlag}:${isoDay(d.healthFlagChangedAt)}`, title: `${d.name} is now ${healthFlagLabels[d.healthFlag].toLowerCase()}`, type: "RESEARCH",
        priority: d.healthFlag === "STALLED" ? "HIGH" : "MEDIUM", dueAt: dueToday, value: d.value,
        reason: `The deal's health changed to ${healthFlagLabels[d.healthFlag]} on ${formatDate(d.healthFlagChangedAt)}.`, origin: "RULE",
        suggestedAction: "Open the deal and look at the health breakdown: fill in missing qualification fields, bring in another contact, or agree a next step.",
        dealId: d.id, companyId: d.companyId,
      });
    }
  }

  // 5. Very relevant news about companies this person owns.
  for (const n of news) {
    out.push({
      rule: "news", dedupeKey: `news:${n.id}`, title: `Act on news about ${n.company.name}`, type: "EMAIL", priority: (n.relevance ?? 0) >= 5 ? "HIGH" : "MEDIUM", dueAt: dueToday,
      reason: `${n.headline} (${n.source})`, origin: "NEWS", suggestedAction: "Read the news and, if it is relevant, get in touch with an opening line based on it.",
      draftMessage: n.openingLine, companyId: n.company.id, newsItemId: n.id,
    });
  }

  // 6. The best companies nobody has contacted lately, a few a day.
  const week = weekStart(now);
  for (const c of prospects.filter((p) => p.contacts.length > 0).slice(0, PROSPECTS_PER_DAY * 2)) {
    const contact = c.contacts[0];
    out.push({
      rule: "prospect", dedupeKey: `prospect:${c.id}:${week}`, title: `Get in touch with ${c.name}`, type: "EMAIL", priority: c.score === 5 ? "MEDIUM" : "LOW", dueAt: dueToday,
      reason: `Scored ${c.score} out of 5${c.scoreReason ? `: ${c.scoreReason}` : ""}. ${c.lastActivityAt ? `Last contact ${formatDate(c.lastActivityAt)}.` : "Not contacted yet."}`, origin: "RULE",
      suggestedAction: `Open ${personName(contact)} and choose a template for the company's customer group, or draft one with AI.`,
      companyId: c.id, contactId: contact.id,
    });
  }
  // Keep the prospect suggestions to the daily limit for that rule.
  const prospectKeys = out.filter((c) => c.rule === "prospect").slice(PROSPECTS_PER_DAY).map((c) => c.dedupeKey);
  return out.filter((c) => !prospectKeys.includes(c.dedupeKey));
}

export type DailyRunResult = { people: number; created: number; perPerson: Record<string, number> };

export async function runDailyTasks(now = new Date(), onlyOrganisationId?: string, onlyUserId?: string): Promise<DailyRunResult> {
  const orgs = await prisma.organisation.findMany({ where: onlyOrganisationId ? { id: onlyOrganisationId } : {}, select: { id: true, dailyTaskLimit: true, phoneCheckMaxAgeDays: true } });
  const result: DailyRunResult = { people: 0, created: 0, perPerson: {} };
  const todayStart = startOfLondonDay(isoDay(now));

  for (const org of orgs) {
    // Snoozed tasks whose time has come go back on the list.
    await prisma.task.updateMany({ where: { organisationId: org.id, status: "SNOOZED", snoozedUntil: { lte: now } }, data: { status: "OPEN" } });
    // Suggestions about deals that have since been won or lost are no longer needed.
    await prisma.task.updateMany({
      where: { organisationId: org.id, origin: "RULE", status: { in: ["OPEN", "SNOOZED"] }, deal: { stage: { kind: { not: "OPEN" } } } },
      data: { status: "CANCELLED" },
    });

    const people = await prisma.user.findMany({ where: { organisationId: org.id, active: true, ...(onlyUserId ? { id: onlyUserId } : {}) }, select: { id: true, name: true, email: true, organisationId: true, morningSummary: true } });
    for (const person of people) {
      result.people++;
      const candidates = await gatherCandidates({ id: person.id, name: person.name, organisationId: org.id }, org, now);
      const keys = candidates.map((c) => c.dedupeKey);
      const [existing, createdToday] = await Promise.all([
        prisma.task.findMany({ where: { organisationId: org.id, dedupeKey: { in: keys } }, select: { dedupeKey: true } }),
        prisma.task.count({ where: { organisationId: org.id, assigneeId: person.id, origin: { in: ["RULE", "NEWS"] }, createdAt: { gte: todayStart } } }),
      ]);
      const chosen = planDailyTasks(candidates, new Set(existing.map((e) => e.dedupeKey!)), org.dailyTaskLimit, createdToday);
      if (chosen.length) {
        const created = await prisma.task.createMany({
          data: chosen.map((c) => ({
            organisationId: org.id, assigneeId: person.id, title: c.title.slice(0, 200), type: c.type, priority: c.priority, dueAt: c.dueAt,
            reason: c.reason.slice(0, 1000), origin: c.origin, dedupeKey: c.dedupeKey, suggestedAction: c.suggestedAction, draftMessage: c.draftMessage ?? null,
            companyId: c.companyId ?? null, contactId: c.contactId ?? null, dealId: c.dealId ?? null, newsItemId: c.newsItemId ?? null,
          })),
          skipDuplicates: true, // a second safety net against duplicates
        });
        result.created += created.count;
        result.perPerson[person.id] = created.count;
      }
      if (!onlyUserId && person.morningSummary && person.email) await queueMorningSummary(org.id, person, now);
    }
  }
  return result;
}

/** A short email listing the day's tasks. Sent through the alert email system, once per day. */
async function queueMorningSummary(organisationId: string, person: { id: string; name: string | null; email: string }, now: Date) {
  const endOfToday = new Date(startOfLondonDay(isoDay(now)).getTime() + DAY);
  const tasks = await prisma.task.findMany({
    where: { organisationId, assigneeId: person.id, status: "OPEN", dueAt: { lt: endOfToday } },
    orderBy: [{ priority: "asc" }, { dueAt: "asc" }],
    take: 30,
  });
  if (tasks.length === 0) return;
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const lines = tasks.map((t, i) => `${i + 1}. ${t.title}${t.reason ? `\n   Why: ${t.reason}` : ""}`);
  const dedupeKey = `morning:${person.id}:${isoDay(now)}`;
  const exists = await prisma.notification.findUnique({ where: { organisationId_dedupeKey: { organisationId, dedupeKey } } });
  if (exists) return;
  await prisma.notification.create({
    data: {
      organisationId, type: "MORNING_SUMMARY", recipientUserId: person.id, recipientEmail: person.email,
      subject: `Your ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} for today`,
      bodyText: `Good morning${person.name ? ` ${person.name.split(" ")[0]}` : ""},\n\nHere is your list for today:\n\n${lines.join("\n")}\n\nOpen your list: ${base}/tasks\n\nYou get this because the morning summary is switched on for you in Moca CRM.`,
      dedupeKey,
    },
  });
}
