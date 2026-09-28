import { beforeEach, describe, expect, it } from "vitest";
import { orderCandidates, planDailyTasks, type Candidate } from "@/lib/tasks/plan";

const at = new Date("2026-09-28T16:00:00Z");
const c = (o: Partial<Candidate>): Candidate => ({
  rule: "stale", dedupeKey: Math.random().toString(36), title: "t", type: "OTHER", priority: "MEDIUM", dueAt: at,
  reason: "r", origin: "RULE", suggestedAction: "s", ...o,
});

describe("ordering the daily list", () => {
  it("puts high priority first, then the most urgent kinds of task, then bigger deals", () => {
    const list = orderCandidates([
      c({ dedupeKey: "prospect", rule: "prospect", priority: "LOW" }),
      c({ dedupeKey: "stale-small", rule: "stale", priority: "MEDIUM", value: 5000 }),
      c({ dedupeKey: "stale-big", rule: "stale", priority: "MEDIUM", value: 90000 }),
      c({ dedupeKey: "followup", rule: "followUp", priority: "MEDIUM" }),
      c({ dedupeKey: "stalled", rule: "flagged", priority: "HIGH" }),
      c({ dedupeKey: "call", rule: "call", priority: "HIGH" }),
    ]);
    expect(list.map((x) => x.dedupeKey)).toEqual(["stalled", "call", "followup", "stale-big", "stale-small", "prospect"]);
  });
});

describe("avoiding duplicates and keeping the list manageable", () => {
  it("never plans a task whose key already exists, or the same key twice", () => {
    const planned = planDailyTasks([c({ dedupeKey: "a" }), c({ dedupeKey: "b" }), c({ dedupeKey: "b" })], new Set(["a"]), 25);
    expect(planned.map((x) => x.dedupeKey)).toEqual(["b"]);
  });

  it("keeps to the daily limit, counting tasks already created today", () => {
    const many = Array.from({ length: 40 }, (_, i) => c({ dedupeKey: `k${String(i).padStart(2, "0")}` }));
    expect(planDailyTasks(many, new Set(), 25)).toHaveLength(25);
    expect(planDailyTasks(many, new Set(), 25, 20)).toHaveLength(5);
    expect(planDailyTasks(many, new Set(), 25, 30)).toHaveLength(0);
  });

  it("drops the least important tasks when over the limit", () => {
    const planned = planDailyTasks([c({ dedupeKey: "low", priority: "LOW" }), c({ dedupeKey: "high", priority: "HIGH" })], new Set(), 1);
    expect(planned.map((x) => x.dedupeKey)).toEqual(["high"]);
  });
});

// Database tests: the rules themselves.
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { runDailyTasks } from "@/lib/tasks/daily";

describe.skipIf(!hasTestDb)("the daily task rules", () => {
  const now = new Date("2026-09-28T06:00:00Z"); // 07:00 in London
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  let orgId: string;
  let repId: string;
  let otherId: string;
  let stageId: string;
  let pipelineId: string;

  beforeEach(async () => {
    await resetTestDb();
    const org = await createOrganisation(testDb, "Moca");
    orgId = org.id;
    const [rep, other] = await Promise.all([
      testDb.user.create({ data: { email: "rep@example.com", name: "Aisha Rahman", organisationId: orgId, role: "REP" } }),
      testDb.user.create({ data: { email: "rep2@example.com", name: "Tom Hughes", organisationId: orgId, role: "REP" } }),
    ]);
    repId = rep.id;
    otherId = other.id;
    const pipeline = await testDb.pipeline.findFirstOrThrow({ where: { organisationId: orgId }, include: { stages: { orderBy: { position: "asc" } } } });
    pipelineId = pipeline.id;
    stageId = pipeline.stages.find((s) => s.name === "Demo")!.id;
    await testDb.stage.update({ where: { id: stageId }, data: { noActivityDays: 10 } });
  });

  async function company(name: string, o: Record<string, unknown> = {}) {
    return testDb.company.create({ data: { organisationId: orgId, name, ownerId: repId, ...o } });
  }
  async function contact(companyId: string, first: string, o: Record<string, unknown> = {}) {
    const email = `${first.toLowerCase()}@${first.toLowerCase()}.example`;
    return testDb.contact.create({ data: { organisationId: orgId, companyId, firstName: first, email, emailNormalised: email, source: "Test", ownerId: repId, ...o } });
  }

  it("creates tasks for quiet deals, deals newly at risk, unanswered emails and top prospects, each with a reason", async () => {
    const co = await company("Harbourline");
    const grace = await contact(co.id, "Grace");
    await testDb.deal.create({ data: { organisationId: orgId, pipelineId, stageId, companyId: co.id, ownerId: repId, name: "Quiet deal", value: 60000, lastActivityAt: daysAgo(15), nextStep: "Send the proposal" } });
    await testDb.deal.create({ data: { organisationId: orgId, pipelineId, stageId, companyId: co.id, ownerId: repId, name: "Slipping deal", healthFlag: "STALLED", healthFlagChangedAt: daysAgo(1), lastActivityAt: daysAgo(2) } });
    await testDb.email.create({ data: { organisationId: orgId, userId: repId, direction: "SENT", fromAddress: "rep@example.com", toAddresses: [grace.email!], subject: "Proposal", sentAt: daysAgo(6), contactId: grace.id } });
    for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
      const p = await company(name, { score: 5 });
      await contact(p.id, name);
    }

    const r = await runDailyTasks(now);
    expect(r.created).toBeGreaterThan(0);
    const tasks = await testDb.task.findMany({ where: { assigneeId: repId } });
    const titles = tasks.map((t) => t.title);
    expect(titles).toContain("Get Quiet deal moving again");
    expect(titles).toContain("Slipping deal is now stalled");
    expect(titles).toContain("Follow up with Grace");
    expect(tasks.filter((t) => t.title.startsWith("Get in touch with"))).toHaveLength(3); // the daily limit for prospects

    const quiet = tasks.find((t) => t.title === "Get Quiet deal moving again")!;
    expect(quiet).toMatchObject({ priority: "HIGH", origin: "RULE", type: "FOLLOW_UP" });
    expect(quiet.reason).toMatch(/15 days/);
    expect(quiet.suggestedAction).toMatch(/Send the proposal/);
    const followUp = tasks.find((t) => t.title === "Follow up with Grace")!;
    expect(followUp.draftMessage).toMatch(/^Hello Grace/);
    // Due at 17:00 London time today.
    expect(quiet.dueAt?.toISOString()).toBe("2026-09-28T16:00:00.000Z");
    // Nothing is created for someone with nothing to do.
    expect(await testDb.task.count({ where: { assigneeId: otherId } })).toBe(0);
  });

  it("never creates the same task twice, however often it runs", async () => {
    const co = await company("Harbourline");
    await testDb.deal.create({ data: { organisationId: orgId, pipelineId, stageId, companyId: co.id, ownerId: repId, name: "Quiet deal", lastActivityAt: daysAgo(15) } });
    await runDailyTasks(now);
    await runDailyTasks(now);
    await runDailyTasks(new Date(now.getTime() + 86_400_000));
    expect(await testDb.task.count({ where: { title: "Get Quiet deal moving again" } })).toBe(1);
  });

  it("skips people who have opted out, and emails that were answered", async () => {
    const co = await company("Harbourline");
    const opted = await contact(co.id, "Opted", { optedOut: true });
    const grace = await contact(co.id, "Grace");
    await testDb.email.create({ data: { organisationId: orgId, userId: repId, direction: "SENT", fromAddress: "rep@example.com", toAddresses: [opted.email!], subject: "Hi", sentAt: daysAgo(6), contactId: opted.id } });
    await testDb.email.create({ data: { organisationId: orgId, userId: repId, direction: "SENT", fromAddress: "rep@example.com", toAddresses: [grace.email!], subject: "Hi", sentAt: daysAgo(6), repliedAt: daysAgo(5), contactId: grace.id } });
    await runDailyTasks(now);
    expect(await testDb.task.count({ where: { title: { startsWith: "Follow up" } } })).toBe(0);
  });

  it("removes suggestions about deals that have since closed, but keeps tasks people added", async () => {
    const co = await company("Harbourline");
    const lost = (await testDb.stage.findFirstOrThrow({ where: { pipelineId, kind: "LOST" } })).id;
    const deal = await testDb.deal.create({ data: { organisationId: orgId, pipelineId, stageId: lost, companyId: co.id, ownerId: repId, name: "Closed deal" } });
    await testDb.task.create({ data: { organisationId: orgId, assigneeId: repId, title: "Rule task", origin: "RULE", dealId: deal.id, dedupeKey: "x" } });
    await testDb.task.create({ data: { organisationId: orgId, assigneeId: repId, title: "My own task", origin: "MANUAL", dealId: deal.id } });
    await runDailyTasks(now);
    expect((await testDb.task.findFirstOrThrow({ where: { title: "Rule task" } })).status).toBe("CANCELLED");
    expect((await testDb.task.findFirstOrThrow({ where: { title: "My own task" } })).status).toBe("OPEN");
  });

  it("keeps to the organisation's daily limit", async () => {
    await testDb.organisation.update({ where: { id: orgId }, data: { dailyTaskLimit: 2 } });
    const co = await company("Harbourline");
    for (let i = 0; i < 5; i++) {
      await testDb.deal.create({ data: { organisationId: orgId, pipelineId, stageId, companyId: co.id, ownerId: repId, name: `Deal ${i}`, value: i * 1000, lastActivityAt: daysAgo(20) } });
    }
    await runDailyTasks(now);
    await runDailyTasks(now);
    expect(await testDb.task.count({ where: { assigneeId: repId } })).toBe(2);
  });

  it("wakes up snoozed tasks when their time comes, and queues a morning summary for those who want one", async () => {
    await testDb.user.update({ where: { id: repId }, data: { morningSummary: true } });
    await testDb.task.create({ data: { organisationId: orgId, assigneeId: repId, title: "Snoozed", status: "SNOOZED", snoozedUntil: daysAgo(0.1), dueAt: daysAgo(0.1) } });
    await runDailyTasks(now);
    expect((await testDb.task.findFirstOrThrow({ where: { title: "Snoozed" } })).status).toBe("OPEN");
    const summary = await testDb.notification.findFirstOrThrow({ where: { type: "MORNING_SUMMARY" } });
    expect(summary.recipientEmail).toBe("rep@example.com");
    expect(summary.bodyText).toContain("Snoozed");
    await runDailyTasks(now);
    expect(await testDb.notification.count({ where: { type: "MORNING_SUMMARY" } })).toBe(1);
  });
});
