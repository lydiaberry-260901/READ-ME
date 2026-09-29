import { beforeEach, describe, expect, it } from "vitest";
import { daysLeft, requestDeadline } from "@/lib/privacy/requests";
import { monthsBefore } from "@/lib/privacy/retention";
import { breachHoursLeft } from "@/lib/privacy/reminders";
import { isoDay } from "@/lib/calendar-view";

describe("the one month deadline for requests", () => {
  const due = (iso: string, months = 1) => isoDay(requestDeadline(new Date(iso), months));

  it("is the same date next month", () => {
    expect(due("2026-09-03T10:00:00Z")).toBe("2026-10-05"); // 3 October 2026 is a Saturday, so the next Monday
    expect(due("2026-09-08T10:00:00Z")).toBe("2026-10-08");
  });

  it("uses the last day of a shorter month", () => {
    expect(due("2026-01-31T10:00:00Z")).toBe("2026-03-02"); // 28 February 2026 is a Saturday
    expect(due("2028-01-31T10:00:00Z")).toBe("2028-02-29"); // a leap year, a Tuesday
  });

  it("moves to Monday when the date falls at a weekend", () => {
    expect(due("2026-10-10T10:00:00Z")).toBe("2026-11-10");
    expect(due("2026-09-06T10:00:00Z")).toBe("2026-10-06");
  });

  it("can be extended by two further months, crossing the year end", () => {
    expect(due("2026-11-16T10:00:00Z", 3)).toBe("2027-02-16");
  });

  it("uses the London date, even late in the evening in summer time", () => {
    // 23:30 on 30 June in London is 22:30 UTC.
    expect(due("2026-06-30T22:30:00Z")).toBe("2026-07-30");
  });

  it("counts whole London days left, negative when overdue", () => {
    const now = new Date("2026-09-29T09:00:00Z");
    expect(daysLeft(new Date("2026-10-06T22:59:00Z"), now)).toBe(7);
    expect(daysLeft(new Date("2026-09-27T12:00:00Z"), now)).toBe(-2);
  });
});

describe("clocks and periods", () => {
  it("counts down the 72 hours to decide on telling the ICO", () => {
    const found = new Date("2026-09-28T09:00:00Z");
    expect(breachHoursLeft(found, new Date("2026-09-28T10:00:00Z"))).toBe(71);
    expect(breachHoursLeft(found, new Date("2026-10-01T11:00:00Z"))).toBe(-2);
  });

  it("works out the date a keeping period started", () => {
    expect(monthsBefore(new Date("2026-09-29T00:00:00Z"), 24).toISOString().slice(0, 10)).toBe("2024-09-29");
  });
});

// Database tests: deleting data, the file of everything held, keeping periods and reminders.
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { eraseContact, findMentions, subjectAccessExport } from "@/lib/privacy/subject";
import { applyRetentionReview, buildRetentionReview } from "@/lib/privacy/retention";
import { runPrivacyReminders } from "@/lib/privacy/reminders";
import { isSuppressed } from "@/lib/contacts/opt-out";
import { ensureDefaultSuppliers, DEFAULT_SUPPLIERS } from "@/lib/privacy/setup";

describe.skipIf(!hasTestDb)("personal data tools", () => {
  const now = new Date("2026-09-29T09:00:00Z");
  let orgId = "";
  let adminId = "";
  let contactId = "";
  let dealId = "";

  beforeEach(async () => {
    await resetTestDb();
    const org = await createOrganisation(testDb, "Moca");
    orgId = org.id;
    const admin = await testDb.user.create({ data: { email: "admin@moca.example", name: "Ada Admin", organisationId: orgId, role: "ADMIN" } });
    adminId = admin.id;
    const company = await testDb.company.create({ data: { organisationId: orgId, name: "Pennant Retail Group" } });
    const contact = await testDb.contact.create({
      data: { organisationId: orgId, companyId: company.id, firstName: "Farah", lastName: "Iqbal", email: "farah@pennant.example", emailNormalised: "farah@pennant.example", phone: "07700 900123", source: "Test", ownerId: adminId, lastActivityAt: now },
    });
    contactId = contact.id;
    const pipeline = await testDb.pipeline.findFirstOrThrow({ where: { organisationId: orgId }, include: { stages: true } });
    const deal = await testDb.deal.create({ data: { organisationId: orgId, pipelineId: pipeline.id, stageId: pipeline.stages[0].id, companyId: company.id, ownerId: adminId, name: "Multi site", nextStep: "Call Farah Iqbal about the demo" } });
    dealId = deal.id;
    await testDb.dealContact.create({ data: { dealId, contactId } });
    await testDb.activity.create({ data: { organisationId: orgId, type: "CALL", userId: adminId, contactId, dealId, subject: "Call with Farah", body: "Farah prefers mornings", occurredAt: now } });
    await testDb.email.create({ data: { organisationId: orgId, direction: "SENT", fromAddress: "admin@moca.example", toAddresses: ["farah@pennant.example"], subject: "Hello", sentAt: now, contactId } });
    await testDb.callTranscript.create({ data: { organisationId: orgId, source: "PASTE", text: "A call with Farah about energy across the stores.", contactId } });
    await testDb.task.create({ data: { organisationId: orgId, assigneeId: adminId, title: "Email Farah", contactId } });
    await testDb.calendarEvent.create({ data: { organisationId: orgId, userId: adminId, title: "Demo", startAt: now, endAt: now, contactId, attendees: [{ email: "farah@pennant.example" }, { email: "admin@moca.example" }] } });
  });

  it("puts everything held about a person in one file, with other mentions of their name", async () => {
    const file = await subjectAccessExport(orgId, contactId, now);
    expect(file.details).toMatchObject({ name: "Farah Iqbal", workEmail: "farah@pennant.example", company: "Pennant Retail Group" });
    expect(file.activities).toHaveLength(1);
    expect(file.emails).toHaveLength(1);
    expect(file.callTranscripts).toHaveLength(1);
    expect(file.tasks).toHaveLength(1);
    expect(file.meetings).toHaveLength(1);
    expect(file.deals[0].deal).toBe("Multi site");
    expect(file.otherMentions.some((m) => m.where === "Deal" && m.text.includes("Farah Iqbal"))).toBe(true);
    expect(JSON.stringify(file)).not.toMatch(/\s[-–—]\s/);
  });

  it("finds free text naming the person that is not linked to them", async () => {
    const mentions = await findMentions(orgId, "Farah Iqbal", contactId);
    expect(mentions.map((m) => m.where)).toEqual(["Deal"]);
  });

  it("deletes a person's details and linked records, keeping them on the do not contact list", async () => {
    const counts = await eraseContact({ organisationId: orgId, contactId, userId: adminId, keepOnDoNotContactList: true, reason: "Request from the person" });
    expect(counts).toMatchObject({ emails: 1, transcripts: 1, tasks: 1, activitiesAnonymised: 1, meetingsUnlinked: 1 });
    expect(await testDb.contact.count()).toBe(0);
    expect(await testDb.email.count()).toBe(0);
    expect(await testDb.callTranscript.count()).toBe(0);
    expect(await testDb.dealContact.count()).toBe(0);
    // The call still counts in the dashboards, but nothing identifies the person.
    expect(await testDb.activity.findFirstOrThrow()).toMatchObject({ contactId: null, subject: null, body: null, type: "CALL" });
    const event = await testDb.calendarEvent.findFirstOrThrow();
    expect(event.attendees).toEqual([{ email: "admin@moca.example" }]);
    expect(await isSuppressed(orgId, "Farah@Pennant.example")).toBe(true);
    expect(await isSuppressed(orgId, null, "+44 7700 900123")).toBe(true);
    expect(await testDb.auditLog.count({ where: { action: "contact.erased" } })).toBe(1);
  });

  it("can delete without keeping them on the do not contact list", async () => {
    await eraseContact({ organisationId: orgId, contactId, userId: adminId, keepOnDoNotContactList: false, reason: "Test" });
    expect(await isSuppressed(orgId, "farah@pennant.example")).toBe(false);
  });

  it("lists old records for approval, keeps people on open deals, and deletes only after approval", async () => {
    const old = new Date("2023-01-01T00:00:00Z");
    await testDb.contact.update({ where: { id: contactId }, data: { lastActivityAt: old } });
    const quiet = await testDb.contact.create({ data: { organisationId: orgId, firstName: "Quiet", lastName: "Person", email: "quiet@old.example", source: "Test", lastActivityAt: old, optedOut: true } });
    const kept = await testDb.contact.create({ data: { organisationId: orgId, firstName: "Kept", source: "Test", lastActivityAt: old } });
    await testDb.callTranscript.create({ data: { organisationId: orgId, source: "PASTE", text: "An old call about energy use across many sites.", createdAt: old } });

    const review = await buildRetentionReview(orgId, now);
    const items = review!.items as { kind: string; id: string }[];
    // Farah is on an open deal, so she is kept.
    expect(items.filter((i) => i.kind === "CONTACT").map((i) => i.id).sort()).toEqual([kept.id, quiet.id].sort());
    expect(items.filter((i) => i.kind === "TRANSCRIPT")).toHaveLength(1);
    expect(await testDb.contact.count()).toBe(3); // nothing deleted yet

    // Building again replaces the waiting list rather than adding another.
    await buildRetentionReview(orgId, now);
    expect(await testDb.retentionReview.count({ where: { status: "PENDING" } })).toBe(1);

    const result = await applyRetentionReview({ organisationId: orgId, reviewId: review!.id, userId: adminId, keepIds: [kept.id], now });
    expect(result.deleted).toMatchObject({ contacts: 1, transcripts: 1 });
    expect(await testDb.contact.findUnique({ where: { id: quiet.id } })).toBeNull();
    expect(await testDb.contact.findUnique({ where: { id: kept.id } })).not.toBeNull();
    // The opted out person stays on the do not contact list.
    expect(await isSuppressed(orgId, "quiet@old.example")).toBe(true);
    await expect(applyRetentionReview({ organisationId: orgId, reviewId: review!.id, userId: adminId, keepIds: [], now })).rejects.toThrow();
  });

  it("does not delete a record used since the list was made", async () => {
    await testDb.contact.update({ where: { id: contactId }, data: { lastActivityAt: new Date("2023-01-01T00:00:00Z") } });
    await testDb.dealContact.deleteMany();
    const review = await buildRetentionReview(orgId, now);
    await testDb.contact.update({ where: { id: contactId }, data: { lastActivityAt: now } });
    const result = await applyRetentionReview({ organisationId: orgId, reviewId: review!.id, userId: adminId, keepIds: [], now });
    expect(result.deleted.contacts).toBe(0);
    expect(result.keptBecauseUsedSince).toBeGreaterThan(0);
    expect(await testDb.contact.count()).toBe(1);
  });

  it("emails reminders for requests due soon and undecided breaches, once a day", async () => {
    await testDb.dataRequest.create({ data: { organisationId: orgId, type: "ACCESS", requesterName: "Farah Iqbal", receivedAt: new Date("2026-09-01T09:00:00Z"), dueAt: new Date("2026-10-01T22:59:00Z") } });
    await testDb.breach.create({ data: { organisationId: orgId, title: "Wrong recipient", description: "A list was emailed to the wrong person.", discoveredAt: new Date("2026-09-28T09:00:00Z") } });
    expect(await runPrivacyReminders(now, orgId)).toBe(1);
    const n = await testDb.notification.findFirstOrThrow({ where: { type: "PRIVACY_REMINDER" } });
    expect(n.recipientEmail).toBe("admin@moca.example");
    expect(n.bodyText).toContain("Due in 2 days");
    expect(n.bodyText).toContain("48 hours left");
    expect(await runPrivacyReminders(now, orgId)).toBe(0);
  });

  it("sends no reminder when nothing needs attention", async () => {
    expect(await runPrivacyReminders(now, orgId)).toBe(0);
  });

  it("starts the supplier register with the standard suppliers, once", async () => {
    await ensureDefaultSuppliers(orgId);
    await testDb.supplier.update({ where: { organisationId_name: { organisationId: orgId, name: "Hostinger" } }, data: { location: "UK" } });
    await ensureDefaultSuppliers(orgId);
    expect(await testDb.supplier.count()).toBe(DEFAULT_SUPPLIERS.length);
    expect((await testDb.supplier.findFirstOrThrow({ where: { name: "Hostinger" } })).location).toBe("UK");
    // Nothing is assumed: agreements start as not in place, and locations as unconfirmed.
    expect(await testDb.supplier.count({ where: { dpaInPlace: true } })).toBe(0);
    expect(await testDb.supplier.count({ where: { location: { not: null } } })).toBe(1);
  });
});
