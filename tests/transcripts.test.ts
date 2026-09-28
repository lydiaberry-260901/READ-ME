import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Jobs are not run in tests; the web address and actions only add them to the list.
vi.mock("@/jobs/boss", () => ({ enqueue: vi.fn(async () => null), getBoss: vi.fn() }));

import { checkedDate, evidenceFound, makeTranscriptChecker } from "@/lib/transcripts/ai";
import { parseWebhookPayload } from "@/lib/transcripts/webhook";
import { AiAnswerError } from "@/lib/ai";

const transcript = [
  "Owen: This call is recorded for our notes, is that all right?",
  "Farah: Yes. We have 120 stores and want to cut energy use by 10 percent.",
  "Farah: Peter Doyle, our CFO, signs off the spend.",
  "Farah: Could you send some times for a demo next week?",
].join("\n");

const good = {
  outcome: "INTERESTED",
  summary: "Farah wants to cut energy use by 10 percent across 120 stores. She asked for demo times.",
  promises: [{ text: "Send demo times", dueDate: "2026-09-29", byWhom: "US" }],
  objections: [],
  nextStep: "Book a demo",
  qualification: [
    { field: "economicBuyer", value: "Peter Doyle, CFO", evidence: "Peter Doyle, our CFO, signs off the spend." },
    { field: "metric", value: "Cut energy use by 10 percent", evidence: "want to cut energy use by 10 percent" },
  ],
  suggestedStage: { stageName: "demo", reason: "They asked for a demo.", evidence: "Could you send some times for a demo next week?" },
  followUps: [{ title: "Send demo times", type: "EMAIL", dueDate: "2026-09-29", reason: "Promised on the call", draftMessage: "Hello Farah, here are some times." }],
  recordingNotice: { mentioned: true, evidence: "This call is recorded for our notes" },
};
const check = makeTranscriptChecker({ transcript, callDay: "2026-09-28", openStageNames: ["Prospect", "Contacted", "Conversation", "Demo", "Proposal", "Negotiation"] });

describe("checking the AI's reading of a call", () => {
  it("accepts a sound reading, matching the stage name exactly", () => {
    const r = check(good);
    expect(r.qualification).toHaveLength(2);
    expect(r.suggestedStage?.stageName).toBe("Demo");
    expect(r.recordingNotice.mentioned).toBe(true);
    expect(r.dropped).toEqual([]);
  });

  it("drops a qualification detail whose quote is not in the call", () => {
    const r = check({ ...good, qualification: [{ field: "champion", value: "Farah", evidence: "Farah is our biggest supporter" }] });
    expect(r.qualification).toEqual([]);
    expect(r.dropped[0]).toContain("Champion");
  });

  it("drops a qualification detail with figures that were not said", () => {
    const r = check({ ...good, qualification: [{ field: "metric", value: "Cut energy use by 25 percent", evidence: "want to cut energy use by 10 percent" }] });
    expect(r.qualification).toEqual([]);
  });

  it("never suggests a stage that is not an open stage, so closing a deal is never suggested", () => {
    const r = check({ ...good, suggestedStage: { stageName: "Won", reason: "x", evidence: "Could you send some times for a demo next week?" } });
    expect(r.suggestedStage).toBeNull();
  });

  it("rejects a summary with invented figures, so the AI is asked again", () => {
    expect(() => check({ ...good, summary: "Farah has 400 stores. She wants a demo." })).toThrow(AiAnswerError);
  });

  it("removes a draft message with invented figures but keeps the task", () => {
    const r = check({ ...good, followUps: [{ ...good.followUps[0], draftMessage: "We saved a client £90,000." }] });
    expect(r.followUps[0].draftMessage).toBeNull();
    expect(r.followUps[0].title).toBe("Send demo times");
  });

  it("does not claim a recording notice it cannot quote", () => {
    expect(check({ ...good, recordingNotice: { mentioned: true, evidence: "we told them" } }).recordingNotice).toEqual({ mentioned: false, evidence: null });
  });

  it("finds quotes regardless of case, spacing and punctuation", () => {
    expect(evidenceFound("peter doyle our CFO   signs off", transcript)).toBe(true);
    expect(evidenceFound("Pete signs", transcript)).toBe(false);
  });

  it("only keeps real dates on or after the call and within a year", () => {
    expect(checkedDate("2026-10-05", "2026-09-28")).toBe("2026-10-05");
    expect(checkedDate("2026-09-01", "2026-09-28")).toBeNull();
    expect(checkedDate("2026-02-30", "2026-01-28")).toBeNull();
    expect(checkedDate("next week", "2026-09-28")).toBeNull();
  });
});

describe("reading what a call recording tool sends", () => {
  it("accepts segments with speakers and common field names", () => {
    const r = parseWebhookPayload({ callId: 42, startedAt: "2026-09-28T09:00:00Z", duration: 60.4, attendees: [{ name: "Farah", email: "farah@pennant.example" }], segments: [{ speaker: "Farah", text: "Hello" }, { speaker: "Owen", text: "Hi" }] });
    expect(r.ok && r.value).toMatchObject({ externalId: "42", text: "Farah: Hello\nOwen: Hi", durationSeconds: 60, participants: [{ name: "Farah", email: "farah@pennant.example" }] });
  });

  it("refuses data with no transcript text", () => {
    expect(parseWebhookPayload({ title: "x" }).ok).toBe(false);
    expect(parseWebhookPayload("nonsense").ok).toBe(false);
  });
});

// Database tests: the web address, reading, approving and access.
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { setAiProviderForTests, type AiProvider } from "@/lib/ai";
import { ClaudeProvider } from "@/lib/ai/claude";
import { createWebhookKey } from "@/lib/transcripts/webhook";
import { approveSuggestion, deleteTranscript, processTranscript, rejectSuggestion, saveTranscript, TranscriptError } from "@/lib/transcripts/service";
import { canViewTranscript, transcriptWhere } from "@/lib/transcripts/access";
import { DealError } from "@/lib/deals/service";
import { POST } from "@/app/api/transcripts/webhook/route";
import type { Actor } from "@/lib/permissions";

describe.skipIf(!hasTestDb)("call transcripts end to end", () => {
  const now = new Date("2026-09-28T14:00:00Z");
  let orgId = "";
  let owner: Actor & { name: string };
  let otherRep: Actor;
  let dealId = "";
  let contactId = "";
  let stages: Record<string, string> = {};
  let aiCalls = 0;

  const fakeAi: AiProvider = {
    name: "fake",
    isConfigured: () => true,
    async generateStructured() {
      aiCalls++;
      return { data: good, model: "fake-model", inputTokens: 10, outputTokens: 10 };
    },
  };

  beforeEach(async () => {
    await resetTestDb();
    aiCalls = 0;
    setAiProviderForTests(fakeAi);
    const org = await createOrganisation(testDb, "Moca");
    orgId = org.id;
    const u = await testDb.user.create({ data: { email: "owen@moca.example", name: "Owen Rep", organisationId: orgId, role: "REP" } });
    const u2 = await testDb.user.create({ data: { email: "tom@moca.example", name: "Tom Rep", organisationId: orgId, role: "REP" } });
    owner = { id: u.id, name: "Owen Rep", organisationId: orgId, role: "REP", visibleOwnerIds: [u.id] };
    otherRep = { id: u2.id, organisationId: orgId, role: "REP", visibleOwnerIds: [u2.id] };
    const pipeline = await testDb.pipeline.findFirstOrThrow({ where: { organisationId: orgId }, include: { stages: true } });
    stages = Object.fromEntries(pipeline.stages.map((s) => [s.name, s.id]));
    const company = await testDb.company.create({ data: { organisationId: orgId, name: "Pennant Retail Group" } });
    const contact = await testDb.contact.create({ data: { organisationId: orgId, companyId: company.id, firstName: "Farah", lastName: "Iqbal", email: "Farah@Pennant.example", emailNormalised: "farah@pennant.example", source: "Test", ownerId: u.id, isShared: false } });
    contactId = contact.id;
    const deal = await testDb.deal.create({ data: { organisationId: orgId, pipelineId: pipeline.id, stageId: stages.Conversation, companyId: company.id, ownerId: u.id, name: "Multi site", value: 90000, isShared: false, metric: "Cut energy use by 10 percent" } });
    dealId = deal.id;
    await testDb.dealContact.create({ data: { dealId, contactId } });
  });
  afterAll(() => setAiProviderForTests(new ClaudeProvider()));

  const post = (body: unknown, key?: string) =>
    POST(new Request("http://localhost/api/transcripts/webhook", { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) }));
  const payload = { externalId: "call-1", text: transcript, participants: [{ name: "Owen", email: "OWEN@moca.example" }, { name: "Farah", email: "farah@pennant.example" }], recordingNoticeGiven: true };

  it("refuses calls without the right key", async () => {
    expect((await post(payload)).status).toBe(401);
    await createWebhookKey(orgId);
    expect((await post(payload, "mct_wrongwrongwrongwrongwrongwrong")).status).toBe(401);
    expect(await testDb.callTranscript.count()).toBe(0);
  });

  it("saves a call once, matched to the contact, their open deal and the team member", async () => {
    const key = await createWebhookKey(orgId);
    const first = await post(payload, key);
    expect(first.status).toBe(201);
    expect((await post(payload, key)).status).toBe(200);
    const saved = await testDb.callTranscript.findMany();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ source: "WEBHOOK", contactId, dealId, uploadedById: owner.id, matchStatus: "MATCHED", recordingNoticeGiven: true, processingStatus: "PENDING" });
  });

  it("keeps a call it cannot match for someone to link", async () => {
    const key = await createWebhookKey(orgId);
    await post({ ...payload, externalId: "call-2", participants: [{ email: "someone@else.example" }] }, key);
    expect(await testDb.callTranscript.findFirstOrThrow()).toMatchObject({ matchStatus: "NEEDS_MATCHING", contactId: null, dealId: null });
  });

  it("reading a call suggests changes and creates tasks, but never changes the deal", async () => {
    const { id } = await saveTranscript({ organisationId: orgId, source: "PASTE", text: transcript, uploadedById: owner.id, contactId, callAt: new Date("2026-09-28T10:00:00Z") });
    await processTranscript(id, now);

    const deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.stageId).toBe(stages.Conversation);
    expect(deal.economicBuyer).toBeNull();

    const suggestions = await testDb.transcriptSuggestion.findMany({ where: { transcriptId: id } });
    // The metric is already recorded with the same words, so only the economic buyer and the stage are suggested.
    expect(suggestions.map((s) => s.field ?? s.kind).sort()).toEqual(["STAGE_CHANGE", "economicBuyer"]);
    expect(suggestions.find((s) => s.kind === "STAGE_CHANGE")?.proposedValue).toBe(stages.Demo);

    const tasks = await testDb.task.findMany({ where: { transcriptId: id } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeId: owner.id, origin: "TRANSCRIPT", priority: "HIGH", draftMessage: "Hello Farah, here are some times." });
    expect(await testDb.activity.count({ where: { transcriptId: id, type: "CALL" } })).toBe(1);
    expect(await testDb.callTranscript.findUniqueOrThrow({ where: { id } })).toMatchObject({ processingStatus: "DONE", outcome: "INTERESTED" });

    // Reading again does not repeat tasks, suggestions or the call activity.
    await processTranscript(id, now);
    expect(await testDb.task.count({ where: { transcriptId: id } })).toBe(1);
    expect(await testDb.transcriptSuggestion.count({ where: { transcriptId: id } })).toBe(2);
    expect(await testDb.activity.count({ where: { transcriptId: id } })).toBe(1);
  });

  it("applies a change only when a person approves it, and leaves it when rejected", async () => {
    const { id } = await saveTranscript({ organisationId: orgId, source: "PASTE", text: transcript, uploadedById: owner.id, contactId });
    await processTranscript(id, now);
    const suggestions = await testDb.transcriptSuggestion.findMany({ where: { transcriptId: id } });
    const buyer = suggestions.find((s) => s.field === "economicBuyer")!;
    const stage = suggestions.find((s) => s.kind === "STAGE_CHANGE")!;

    await approveSuggestion(owner, buyer.id, "Peter Doyle, Chief Financial Officer");
    await rejectSuggestion(owner, stage.id);

    const deal = await testDb.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.economicBuyer).toBe("Peter Doyle, Chief Financial Officer");
    expect(deal.stageId).toBe(stages.Conversation);
    expect(await testDb.transcriptSuggestion.findUniqueOrThrow({ where: { id: stage.id } })).toMatchObject({ status: "REJECTED", decidedById: owner.id });
    await expect(approveSuggestion(owner, stage.id)).rejects.toThrow(TranscriptError);
  });

  it("moves the deal through the normal rules when a stage change is approved, with an alert", async () => {
    const { id } = await saveTranscript({ organisationId: orgId, source: "PASTE", text: transcript, uploadedById: owner.id, contactId });
    await processTranscript(id, now);
    const stage = await testDb.transcriptSuggestion.findFirstOrThrow({ where: { transcriptId: id, kind: "STAGE_CHANGE" } });
    const r = await approveSuggestion(owner, stage.id);
    expect((await testDb.deal.findUniqueOrThrow({ where: { id: dealId } })).stageId).toBe(stages.Demo);
    expect(await testDb.dealStageHistory.count({ where: { dealId, toStageId: stages.Demo } })).toBe(1);
    expect(r.alertIds.length).toBeGreaterThan(0);
  });

  it("does not let someone without access see a call or decide its suggestions", async () => {
    const { id } = await saveTranscript({ organisationId: orgId, source: "PASTE", text: transcript, uploadedById: owner.id, contactId });
    await processTranscript(id, now);
    const t = await testDb.callTranscript.findUniqueOrThrow({ where: { id }, include: { deal: true, contact: true } });
    expect(canViewTranscript(otherRep, t)).toBe(false);
    expect(await testDb.callTranscript.count({ where: transcriptWhere(otherRep) })).toBe(0);
    expect(await testDb.callTranscript.count({ where: transcriptWhere(owner) })).toBe(1);
    const s = await testDb.transcriptSuggestion.findFirstOrThrow({ where: { transcriptId: id } });
    await expect(approveSuggestion(otherRep, s.id)).rejects.toThrow(TranscriptError);
    await expect(deleteTranscript(otherRep, id)).rejects.toThrow(TranscriptError);
    expect(DealError).toBeDefined();
  });

  it("can be deleted at any time, keeping tasks already made", async () => {
    const { id } = await saveTranscript({ organisationId: orgId, source: "PASTE", text: transcript, uploadedById: owner.id, contactId });
    await processTranscript(id, now);
    await deleteTranscript(owner, id);
    expect(await testDb.callTranscript.count()).toBe(0);
    expect(await testDb.transcriptSuggestion.count()).toBe(0);
    expect(await testDb.task.count({ where: { origin: "TRANSCRIPT" } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "transcript.deleted", entityId: id } })).toBe(1);
  });

  it("waits, without failing, when the AI is not set up", async () => {
    setAiProviderForTests({ ...fakeAi, isConfigured: () => false, generateStructured: async () => { throw new Error("should not be called"); } });
    const { id } = await saveTranscript({ organisationId: orgId, source: "PASTE", text: transcript, uploadedById: owner.id });
    await processTranscript(id, now);
    expect(await testDb.callTranscript.findUniqueOrThrow({ where: { id } })).toMatchObject({ processingStatus: "PENDING" });
    setAiProviderForTests(fakeAi);
  });

  it("refuses text too short to be a call", async () => {
    await expect(saveTranscript({ organisationId: orgId, source: "PASTE", text: "Hello" })).rejects.toThrow(TranscriptError);
  });
});
