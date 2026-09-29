// A daily email to the data protection lead and admins listing privacy work that needs attention:
// requests due soon or overdue, breaches still waiting for an ICO decision, a deletion list waiting
// for approval, and the ICO fee or impact assessment falling due. Sent only when there is something.
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { isoDay } from "@/lib/calendar-view";
import { daysLeft, effectiveDue, requestTypeLabels } from "./requests";
import { BREACH_HOURS } from "./setup";

const HOUR = 3_600_000;

export function breachHoursLeft(discoveredAt: Date, now = new Date()) {
  return Math.floor((discoveredAt.getTime() + BREACH_HOURS * HOUR - now.getTime()) / HOUR);
}

export async function privacyAttention(organisationId: string, now = new Date()) {
  const [requests, breaches, review, org] = await Promise.all([
    prisma.dataRequest.findMany({ where: { organisationId, status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true, type: true, requesterName: true, dueAt: true, extendedDueAt: true, assignedToId: true } }),
    prisma.breach.findMany({ where: { organisationId, status: "OPEN" }, select: { id: true, title: true, discoveredAt: true, icoDecision: true } }),
    prisma.retentionReview.findFirst({ where: { organisationId, status: "PENDING" }, select: { id: true, createdAt: true, counts: true } }),
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { icoFeeRenewalDate: true, dpiaReviewDate: true } }),
  ]);
  const lines: string[] = [];
  for (const r of requests) {
    const left = daysLeft(effectiveDue(r), now);
    if (left > 7) continue;
    lines.push(`${left < 0 ? `OVERDUE by ${-left} ${-left === 1 ? "day" : "days"}` : left === 0 ? "Due TODAY" : `Due in ${left} ${left === 1 ? "day" : "days"}`}: ${requestTypeLabels[r.type]} request from ${r.requesterName} (due ${formatDate(effectiveDue(r))})`);
  }
  for (const b of breaches) {
    if (b.icoDecision !== "NOT_DECIDED") continue;
    const left = breachHoursLeft(b.discoveredAt, now);
    lines.push(`${left < 0 ? `The 72 hours passed ${-left} hours ago` : `${left} hours left`} to decide whether to tell the ICO about: ${b.title} (found ${formatDateTime(b.discoveredAt)})`);
  }
  if (review) lines.push(`A list of records due for deletion has been waiting since ${formatDate(review.createdAt)}. Nothing is deleted until an admin approves it.`);
  if (org.icoFeeRenewalDate) {
    const left = daysLeft(org.icoFeeRenewalDate, now);
    if (left <= 30) lines.push(left < 0 ? `The ICO data protection fee renewal date (${formatDate(org.icoFeeRenewalDate)}) has passed.` : `The ICO data protection fee is due for renewal on ${formatDate(org.icoFeeRenewalDate)}.`);
  }
  if (org.dpiaReviewDate && daysLeft(org.dpiaReviewDate, now) <= 0) lines.push(`The data protection impact assessment was due for review on ${formatDate(org.dpiaReviewDate)}.`);
  return { lines, requests, breaches };
}

/** Creates one reminder email per person for today. Returns how many were created. */
export async function runPrivacyReminders(now = new Date(), onlyOrganisationId?: string) {
  const orgs = await prisma.organisation.findMany({ where: onlyOrganisationId ? { id: onlyOrganisationId } : {}, select: { id: true, dataProtectionLeadId: true } });
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let created = 0;
  for (const org of orgs) {
    const { lines, requests } = await privacyAttention(org.id, now);
    if (!lines.length) continue;
    const assigned = requests.map((r) => r.assignedToId).filter((x): x is string => Boolean(x));
    const people = await prisma.user.findMany({
      where: { organisationId: org.id, active: true, OR: [{ role: "ADMIN" }, ...(org.dataProtectionLeadId ? [{ id: org.dataProtectionLeadId }] : []), { id: { in: assigned } }] },
      select: { id: true, email: true, name: true },
    });
    for (const p of people) {
      const dedupeKey = `privacy:${p.id}:${isoDay(now)}`;
      const exists = await prisma.notification.findUnique({ where: { organisationId_dedupeKey: { organisationId: org.id, dedupeKey } } });
      if (exists) continue;
      await prisma.notification.create({
        data: {
          organisationId: org.id, type: "PRIVACY_REMINDER", recipientUserId: p.id, recipientEmail: p.email,
          subject: `Privacy: ${lines.length} ${lines.length === 1 ? "thing needs" : "things need"} attention`,
          bodyText: `Hello${p.name ? ` ${p.name.split(" ")[0]}` : ""},\n\nThese need attention in the privacy centre:\n\n${lines.map((l) => `* ${l}`).join("\n")}\n\nOpen the privacy centre: ${base}/privacy\n\nYou get this because you are an admin, the data protection lead, or handling one of these requests.`,
          dedupeKey,
        },
      });
      created++;
    }
  }
  return created;
}
