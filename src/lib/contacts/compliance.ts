// Data protection and marketing rule checks for a contact (UK GDPR and PECR).
// Later phases use these to block outreach; for now they drive the warnings on screen.
import type { ContactEntityType } from "@/generated/prisma/enums";
import { daysBetween } from "@/lib/format";

export type ContactForChecks = {
  optedOut: boolean;
  restricted: boolean;
  entityType: ContactEntityType;
  consentAt: Date | null;
  collectedAt: Date;
  privacyNoticeSentAt: Date | null;
  phone: string | null;
  phoneCheckedAt: Date | null;
  phoneCheckResult: "CLEAR" | "LISTED" | null;
};

/** Sole traders and some partnerships count as individuals, so marketing emails need their consent. */
export function treatedAsIndividual(entityType: ContactEntityType): boolean {
  return entityType === "SOLE_TRADER" || entityType === "PARTNERSHIP";
}

export type CheckResult = { ok: boolean; reason?: string };

export function canEmailForMarketing(c: ContactForChecks): CheckResult {
  if (c.optedOut) return { ok: false, reason: "This person has opted out. Do not contact them." };
  if (c.restricted) return { ok: false, reason: "Use of this person's details is limited after a request from them." };
  if (treatedAsIndividual(c.entityType) && !c.consentAt) {
    return { ok: false, reason: "Sole traders and some partnerships are treated as individuals, so we need their consent before sending marketing emails." };
  }
  return { ok: true };
}

export function canColdCall(c: ContactForChecks, maxAgeDays: number, now = new Date()): CheckResult {
  if (c.optedOut) return { ok: false, reason: "This person has opted out. Do not contact them." };
  if (c.restricted) return { ok: false, reason: "Use of this person's details is limited after a request from them." };
  if (!c.phone) return { ok: false, reason: "There is no work phone number." };
  if (!c.phoneCheckedAt) return { ok: false, reason: "The number has not been checked against the TPS and CTPS do not call lists." };
  if (daysBetween(c.phoneCheckedAt, now) > maxAgeDays) {
    return { ok: false, reason: `The TPS and CTPS check is more than ${maxAgeDays} days old. Please check the number again.` };
  }
  if (c.phoneCheckResult === "LISTED") return { ok: false, reason: "The number is on the TPS or CTPS do not call list." };
  return { ok: true };
}

/** People whose details came from somewhere else must be told about it within one month. */
export function privacyNoticeStatus(c: Pick<ContactForChecks, "collectedAt" | "privacyNoticeSentAt">, now = new Date()) {
  if (c.privacyNoticeSentAt) return { state: "sent" as const };
  const days = daysBetween(c.collectedAt, now);
  if (days > 30) return { state: "overdue" as const, days };
  return { state: "due" as const, daysLeft: 30 - days };
}
