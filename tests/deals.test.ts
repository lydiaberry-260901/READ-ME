import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateHealth, singleThreadedState } from "@/lib/deals/health";
import { DealError, validateClose } from "@/lib/deals/service";
import { buildStageAlert } from "@/lib/notifications/deal-alerts";

const base = { qualificationPct: 100, engagedStakeholders: 3, daysInStage: 5, averageDaysInStage: 20, daysSinceActivity: 1, noActivityDays: 14 };

describe("deal health score", () => {
  it("gives full marks to a well qualified, well connected, active deal", () => {
    const h = calculateHealth(base);
    expect(h.score).toBe(100);
    expect(h.flag).toBe("ON_TRACK");
    expect(h.reasons).toEqual([]);
  });

  it("adds up the four parts", () => {
    const h = calculateHealth({ ...base, qualificationPct: 50, engagedStakeholders: 1, daysInStage: 30, daysSinceActivity: 10 });
    expect(h.parts).toEqual({ qualification: 18, stakeholders: 8, stageTime: 10, recency: 12 });
    expect(h.score).toBe(48);
    expect(h.flag).toBe("AT_RISK");
  });

  it("marks a poorly qualified, quiet deal as stalled and explains why", () => {
    const h = calculateHealth({ ...base, qualificationPct: 0, engagedStakeholders: 0, daysInStage: 70, daysSinceActivity: 20 });
    expect(h.flag).toBe("STALLED");
    expect(h.reasons.join(" ")).toMatch(/Qualification is only 0% complete/);
    expect(h.reasons.join(" ")).toMatch(/No activity for 20 days/);
  });

  it("always marks a deal stalled after more than twice the stage's quiet limit, however good it looks", () => {
    expect(calculateHealth({ ...base, daysSinceActivity: 29 }).flag).toBe("STALLED");
    expect(calculateHealth({ ...base, daysSinceActivity: 28 }).flag).not.toBe("STALLED");
  });

  it("uses a sensible usual time when there is no history for the stage yet", () => {
    expect(calculateHealth({ ...base, averageDaysInStage: null, daysInStage: 21 }).parts.stageTime).toBe(20);
    expect(calculateHealth({ ...base, averageDaysInStage: null, daysInStage: 22 }).parts.stageTime).toBe(10);
  });
});

describe("single threaded detection", () => {
  const now = new Date("2026-09-28T09:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("starts counting when a deal first has only one engaged contact", () => {
    expect(singleThreadedState({ engagedStakeholders: 1, isOpen: true, singleThreadedSince: null, thresholdDays: 14, now })).toEqual({ since: now, warn: false });
  });

  it("warns only after more than the set number of days", () => {
    expect(singleThreadedState({ engagedStakeholders: 1, isOpen: true, singleThreadedSince: daysAgo(14), thresholdDays: 14, now }).warn).toBe(false);
    expect(singleThreadedState({ engagedStakeholders: 1, isOpen: true, singleThreadedSince: daysAgo(15), thresholdDays: 14, now }).warn).toBe(true);
  });

  it("stops counting once a second person is engaged, or the deal closes", () => {
    expect(singleThreadedState({ engagedStakeholders: 2, isOpen: true, singleThreadedSince: daysAgo(30), thresholdDays: 14, now })).toEqual({ since: null, warn: false });
    expect(singleThreadedState({ engagedStakeholders: 1, isOpen: false, singleThreadedSince: daysAgo(30), thresholdDays: 14, now })).toEqual({ since: null, warn: false });
  });
});

describe("closing a deal", () => {
  it("needs a reason from the fixed list and a note when lost", () => {
    expect(() => validateClose("LOST", { closeNote: "Went elsewhere" })).toThrow(DealError);
    expect(() => validateClose("LOST", { lossReason: "BAD_LUCK", closeNote: "Went elsewhere" })).toThrow(/from the list/);
    expect(() => validateClose("LOST", { lossReason: "BUDGET", closeNote: "" })).toThrow(/short note/);
    expect(validateClose("LOST", { lossReason: "LOST_TO_COMPETITOR", closeNote: " Chose a consultant " })).toEqual({ lossReason: "LOST_TO_COMPETITOR", closeNote: "Chose a consultant", finalValue: null });
  });

  it("needs the final value and a note when won", () => {
    expect(() => validateClose("WON", { closeNote: "Clear savings" })).toThrow(/final value/);
    expect(() => validateClose("WON", { finalValue: -5, closeNote: "Clear savings" })).toThrow(/final value/);
    expect(() => validateClose("WON", { finalValue: 40000, closeNote: "" })).toThrow(/short note/);
    expect(validateClose("WON", { finalValue: 40000.4, closeNote: "Clear savings" })).toEqual({ lossReason: null, closeNote: "Clear savings", finalValue: 40000 });
  });

  it("needs nothing extra for open stages, and clears any old close details", () => {
    expect(validateClose("OPEN", { lossReason: "BUDGET", closeNote: "x", finalValue: 5 })).toEqual({ lossReason: null, closeNote: null, finalValue: null });
  });
});

describe("the alert email", () => {
  const input = {
    organisationId: "o", historyId: "h1", deal: { id: "d1", name: "Harbourline platform", value: 48000, ownerId: "u1" },
    companyName: "Harbourline", fromStage: "Proposal", toStage: "Negotiation", toKind: "OPEN" as const,
    movedByName: "Aisha Rahman", movedAt: new Date("2026-07-01T13:30:00Z"),
  };

  it("says which deal, which company, the old and new stage, the value, who moved it, when, and gives a link", () => {
    const a = buildStageAlert(input);
    expect(a.type).toBe("DEAL_STAGE_CHANGED");
    expect(a.subject).toBe("Harbourline platform (Harbourline) moved to Negotiation");
    for (const s of ["Deal: Harbourline platform", "Company: Harbourline", "Old stage: Proposal", "New stage: Negotiation", "Value: £48,000", "Moved by: Aisha Rahman", "When: 01/07/2026 14:30", "/deals/d1"]) {
      expect(a.text).toContain(s);
    }
  });

  it("includes the loss reason and note when lost, and the final value when won", () => {
    const lost = buildStageAlert({ ...input, toStage: "Lost", toKind: "LOST", lossReason: "TIMING", closeNote: "Next year" });
    expect(lost.type).toBe("DEAL_LOST");
    expect(lost.text).toContain("Reason lost: Timing");
    expect(lost.text).toContain("Note: Next year");
    const won = buildStageAlert({ ...input, toStage: "Won", toKind: "WON", finalValue: 52000, closeNote: "Great fit" });
    expect(won.subject).toBe("Won: Harbourline platform (Harbourline), £52,000");
  });
});

// Database tests
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { addDealNote, moveDeal, setFollowing, setStakeholder, updateQualification } from "@/lib/deals/service";
import { recalculateDeal } from "@/lib/deals/recalculate";
import { deliverNotification } from "@/lib/notifications/deal-alerts";
import * as email from "@/lib/notifications/email";
import { computeVisibleOwnerIds, type Actor } from "@/lib/permissions";

describe.skipIf(!hasTestDb)("deals against the database", () => {
  let orgId: string;
  let rep: Actor & { name: string };
  let otherRep: Actor & { name: string };
  let manager: Actor & { name: string };
  let stages: Record<string, string>;
  let dealId: string;
  let companyId: string;

  beforeEach(async () => {
    await resetTestDb();
    vi.restoreAllMocks();
    const org = await createOrganisation(testDb, "Moca");
    orgId = org.id;
    const [u1, u2, m] = await Promise.all([
      testDb.user.create({ data: { email: "rep@example.com", name: "Aisha Rep", organisationId: orgId, role: "REP" } }),
      testDb.user.create({ data: { email: "rep2@example.com", name: "Tom Rep", organisationId: orgId, role: "REP" } }),
      testDb.user.create({ data: { email: "mgr@example.com", name: "Sam Manager", organisationId: orgId, role: "MANAGER" } }),
    ]);
    rep = { id: u1.id, name: "Aisha Rep", organisationId: orgId, role: "REP", visibleOwnerIds: [u1.id] };
    otherRep = { id: u2.id, name: "Tom Rep", organisationId: orgId, role: "REP", visibleOwnerIds: [u2.id] };
    manager = { id: m.id, name: "Sam Manager", organisationId: orgId, role: "MANAGER", visibleOwnerIds: computeVisibleOwnerIds({ userId: m.id, role: "MANAGER", teamMemberIdsOfManagedTeams: [m.id, u1.id], teamMemberIdsOfOwnTeam: [] }) };
    const pipeline = await testDb.pipeline.findFirstOrThrow({ where: { organisationId: orgId }, include: { stages: true } });
    stages = Object.fromEntries(pipeline.stages.map((s) => [s.name, s.id]));
    const company = await testDb.company.create({ data: { organisationId: orgId, name: "Harbourline" } });
    companyId = company.id;
    const deal = await testDb.deal.create({
      data: { organisationId: orgId, pipelineId: pipeline.id, stageId: stages.Prospect, companyId, ownerId: rep.id, name: "Platform", value: 48000, isShared: true, stageEnteredAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    dealId = deal.id;
  });

  it("records every move in the stage history with the time spent in the previous stage", async () => {
    await moveDeal(rep, dealId, stages.Contacted);
    await moveDeal(rep, dealId, stages.Demo);
    const history = await testDb.dealStageHistory.findMany({ where: { dealId }, orderBy: { movedAt: "asc" }, include: { fromStage: true, toStage: true } });
    expect(history.map((h) => `${h.fromStage?.name}>${h.toStage.name}`)).toEqual(["Prospect>Contacted", "Contacted>Demo"]);
    expect(history[0].secondsInPreviousStage).toBeGreaterThanOrEqual(3 * 86_400 - 5);
    expect((await testDb.deal.findUniqueOrThrow({ where: { id: dealId } })).stageId).toBe(stages.Demo);
  });

  it("creates one alert for the owner and each follower, never twice for the same move", async () => {
    await setFollowing(manager, dealId, true);
    const { alertIds } = await moveDeal(rep, dealId, stages.Contacted);
    expect(alertIds).toHaveLength(2);
    const alerts = await testDb.notification.findMany({ where: { organisationId: orgId } });
    expect(alerts.map((a) => a.recipientEmail).sort()).toEqual(["mgr@example.com", "rep@example.com"]);
    expect(alerts.every((a) => a.status === "PENDING" && a.subject.includes("moved to Contacted"))).toBe(true);
    // Moving to the same stage again changes nothing and sends nothing.
    expect((await moveDeal(rep, dealId, stages.Contacted)).alertIds).toEqual([]);
  });

  it("sends an alert once, retries after a failure, and logs every attempt", async () => {
    const { alertIds } = await moveDeal(rep, dealId, stages.Contacted);
    const send = vi.spyOn(email, "sendEmail").mockRejectedValueOnce(new Error("Mail server down")).mockResolvedValue(undefined);
    await expect(deliverNotification(alertIds[0])).rejects.toThrow("Mail server down");
    let n = await testDb.notification.findUniqueOrThrow({ where: { id: alertIds[0] } });
    expect(n).toMatchObject({ status: "FAILED", attempts: 1, lastError: "Error: Mail server down" });
    expect(await deliverNotification(alertIds[0])).toBe("sent");
    n = await testDb.notification.findUniqueOrThrow({ where: { id: alertIds[0] } });
    expect(n).toMatchObject({ status: "SENT", attempts: 2, lastError: null });
    expect(await deliverNotification(alertIds[0])).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("will not close a deal as lost without a reason and a note", async () => {
    await expect(moveDeal(rep, dealId, stages.Lost)).rejects.toThrow(/from the list/);
    await moveDeal(rep, dealId, stages.Lost, { lossReason: "BUDGET", closeNote: "No budget this year" });
    const deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal).toMatchObject({ lossReason: "BUDGET", closeNote: "No budget this year", healthFlag: null });
    expect(deal.closedAt).not.toBeNull();
  });

  it("uses the final value when a deal is won", async () => {
    await moveDeal(rep, dealId, stages.Won, { finalValue: 52000, closeNote: "Great fit" });
    expect(await testDb.deal.findUniqueOrThrow({ where: { id: dealId } })).toMatchObject({ value: 52000, finalValue: 52000 });
  });

  it("only lets the owner, their manager or an admin change a deal, even a shared one", async () => {
    await expect(moveDeal(otherRep, dealId, stages.Contacted)).rejects.toThrow(/Only the deal's owner/);
    await expect(updateQualification(otherRep, dealId, { metric: "x" })).rejects.toThrow(DealError);
    await expect(moveDeal(manager, dealId, stages.Contacted)).resolves.toMatchObject({ moved: true });
  });

  it("works out qualification completeness and recalculates health when fields are filled in", async () => {
    await updateQualification(rep, dealId, { metric: "Lift 5 buildings to EPC C", economicBuyer: "Fund Director" });
    const deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.qualificationPct).toBe(25);
    expect(deal.healthScore).not.toBeNull();
  });

  it("raises a single threaded task once, after the set number of days", async () => {
    const contact = await testDb.contact.create({ data: { organisationId: orgId, companyId, firstName: "Grace", source: "Test", ownerId: rep.id } });
    await setStakeholder(rep, dealId, contact.id, { role: "CHAMPION", engaged: true });
    let deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.singleThreadedSince).not.toBeNull();
    expect(await testDb.task.count()).toBe(0);

    const later = new Date(deal.singleThreadedSince!.getTime() + 15 * 86_400_000);
    await recalculateDeal(dealId, { now: later });
    await recalculateDeal(dealId, { now: new Date(later.getTime() + 86_400_000) });
    const tasks = await testDb.task.findMany();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeId: rep.id, origin: "RULE", dealId, priority: "HIGH" });
    deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.singleThreadedWarnedAt).not.toBeNull();

    // A second engaged person ends the warning.
    const second = await testDb.contact.create({ data: { organisationId: orgId, companyId, firstName: "Martin", source: "Test", ownerId: rep.id } });
    await setStakeholder(rep, dealId, second.id, { role: "ECONOMIC_BUYER", engaged: true });
    deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.singleThreadedSince).toBeNull();
  });

  it("counts a note as activity", async () => {
    await addDealNote(rep, dealId, "Spoke to the ESG team.");
    const deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.lastActivityAt).not.toBeNull();
    expect(await testDb.activity.count({ where: { dealId, type: "NOTE" } })).toBe(1);
  });
});
