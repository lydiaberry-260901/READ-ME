import { describe, expect, it } from "vitest";
import * as calc from "@/lib/analytics/calc";

// Fixed demo data: a small pipeline with known answers.
const stages: calc.StageInfo[] = [
  { id: "p", name: "Prospect", kind: "OPEN", probability: 10, position: 0 },
  { id: "d", name: "Demo", kind: "OPEN", probability: 40, position: 1 },
  { id: "w", name: "Won", kind: "WON", probability: 100, position: 2 },
  { id: "l", name: "Lost", kind: "LOST", probability: 0, position: 3 },
];
const deal = (o: Partial<calc.DealRecord>): calc.DealRecord => ({
  id: Math.random().toString(36), stageId: "p", stageKind: "OPEN", value: 0, finalValue: null, customerGroup: "ASSET_ESG",
  lossReason: null, closedAt: null, qualificationPct: 0, healthFlag: "ON_TRACK", ownerId: "u1", ...o,
});
const deals = [
  deal({ stageId: "p", value: 10000, qualificationPct: 25, healthFlag: "STALLED" }),
  deal({ stageId: "d", value: 50000, qualificationPct: 75, healthFlag: "ON_TRACK" }),
  deal({ stageId: "d", value: 30000, qualificationPct: 50, healthFlag: "AT_RISK", customerGroup: "OCCUPIER" }),
  deal({ stageId: "w", stageKind: "WON", value: 20000, finalValue: 24000, closedAt: new Date("2026-09-01"), healthFlag: null }),
  deal({ stageId: "w", stageKind: "WON", value: 16000, closedAt: new Date("2026-09-02"), healthFlag: null, customerGroup: "OCCUPIER" }),
  deal({ stageId: "l", stageKind: "LOST", value: 9000, lossReason: "BUDGET", closedAt: new Date("2026-09-03"), healthFlag: null }),
  deal({ stageId: "l", stageKind: "LOST", value: 5000, lossReason: "LOST_TO_COMPETITOR", closedAt: new Date("2026-09-04"), healthFlag: null, customerGroup: "OCCUPIER" }),
];
const open = deals.filter((d) => d.stageKind === "OPEN");
const closed = deals.filter((d) => d.stageKind !== "OPEN");

describe("pipeline figures", () => {
  it("adds up open value and expected income by stage", () => {
    expect(calc.pipelineByStage(stages, open)).toEqual([
      { stageId: "p", stage: "Prospect", deals: 1, value: 10000, expected: 1000 },
      { stageId: "d", stage: "Demo", deals: 2, value: 80000, expected: 32000 },
    ]);
  });

  it("counts deals by health", () => {
    expect(calc.healthCounts(open)).toEqual([
      { flag: "ON_TRACK", deals: 1, value: 50000 },
      { flag: "AT_RISK", deals: 1, value: 30000 },
      { flag: "STALLED", deals: 1, value: 10000 },
    ]);
  });

  it("averages qualification completeness across open deals", () => {
    expect(calc.averageQualification(open)).toBe(50);
    expect(calc.averageQualification([])).toBeNull();
  });
});

describe("win rate and reasons for losing", () => {
  it("works out win rate and average won deal size by customer group, using the final value", () => {
    expect(calc.winRateByGroup(closed)).toEqual([
      { group: "ASSET_ESG", won: 1, lost: 1, winRate: 50, averageWon: 24000 },
      { group: "OCCUPIER", won: 1, lost: 1, winRate: 50, averageWon: 16000 },
    ]);
  });

  it("lists every reason from the fixed list, in order, even with no deals", () => {
    const r = calc.lossReasons(closed);
    expect(r.map((x) => x.reason)).toEqual(["BUDGET", "TIMING", "NO_DECISION", "LOST_TO_COMPETITOR", "NO_ECONOMIC_BUYER", "PRODUCT_FIT", "OTHER"]);
    expect(r.find((x) => x.reason === "BUDGET")).toEqual({ reason: "BUDGET", deals: 1, value: 9000 });
    expect(r.find((x) => x.reason === "TIMING")?.deals).toBe(0);
  });
});

describe("stage movement and time in stage", () => {
  const moves: calc.MoveRecord[] = [
    { fromStageId: null, toStageId: "p", movedAt: new Date("2026-09-01"), secondsInPreviousStage: null },
    { fromStageId: "p", toStageId: "d", movedAt: new Date("2026-09-05"), secondsInPreviousStage: 4 * 86_400 },
    { fromStageId: "p", toStageId: "d", movedAt: new Date("2026-09-06"), secondsInPreviousStage: 10 * 86_400 },
    { fromStageId: "d", toStageId: "l", movedAt: new Date("2026-09-10"), secondsInPreviousStage: 5 * 86_400 },
    { fromStageId: "d", toStageId: "p", movedAt: new Date("2026-09-11"), secondsInPreviousStage: 1 * 86_400 },
  ];

  it("averages days spent in each open stage", () => {
    expect(calc.averageDaysInStage(stages, moves)).toEqual([
      { stageId: "p", stage: "Prospect", days: 7, moves: 2 },
      { stageId: "d", stage: "Demo", days: 3, moves: 2 },
    ]);
  });

  it("counts deals entering each stage and those moving forward (not back)", () => {
    const flow = calc.stageFlow(stages, moves);
    expect(flow.find((f) => f.stageId === "p")).toMatchObject({ entered: 2, movedOn: 2 });
    expect(flow.find((f) => f.stageId === "d")).toMatchObject({ entered: 2, movedOn: 1 });
  });
});

describe("activity, connect and reply rates", () => {
  const acts: calc.ActivityRecord[] = [
    { type: "CALL", userId: "u1", occurredAt: new Date("2026-09-07T09:00:00Z"), callResult: "CONNECTED" },
    { type: "CALL", userId: "u1", occurredAt: new Date("2026-09-08T09:00:00Z"), callResult: "NO_ANSWER" },
    { type: "CALL", userId: "u2", occurredAt: new Date("2026-09-15T09:00:00Z"), callResult: "CONNECTED" },
    { type: "NOTE", userId: "u1", occurredAt: new Date("2026-09-15T09:00:00Z"), callResult: null },
  ];
  const emails: calc.EmailRecord[] = [
    { userId: "u1", direction: "SENT", sentAt: new Date("2026-09-08T10:00:00Z"), repliedAt: new Date("2026-09-09T10:00:00Z"), emailTemplateId: "t1", contactId: "c1" },
    { userId: "u1", direction: "SENT", sentAt: new Date("2026-09-08T11:00:00Z"), repliedAt: null, emailTemplateId: "t1", contactId: "c2" },
    { userId: "u1", direction: "RECEIVED", sentAt: new Date("2026-09-09T10:00:00Z"), repliedAt: null, emailTemplateId: null, contactId: "c1" },
  ];
  const meetings: calc.MeetingRecord[] = [{ userId: "u1", startAt: new Date("2026-09-12T10:00:00Z"), contactId: "c1", companyId: "co1" }];

  it("works out connect and reply rates, ignoring received emails", () => {
    expect(calc.connectAndReplyRates(acts, emails)).toEqual({ calls: 3, connected: 2, connectRate: 67, emailsSent: 2, replied: 1, replyRate: 50 });
  });

  it("groups activity into weeks starting on Monday, London time, including empty weeks", () => {
    const weeks = calc.weeksBetween(new Date("2026-09-07T12:00:00Z"), new Date("2026-09-27T12:00:00Z"));
    expect(weeks).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
    expect(calc.activityByWeek(weeks, acts, emails, meetings)).toEqual([
      { week: "2026-09-07", calls: 2, emails: 2, meetings: 1 },
      { week: "2026-09-14", calls: 1, emails: 0, meetings: 0 },
      { week: "2026-09-21", calls: 0, emails: 0, meetings: 0 },
    ]);
  });

  it("puts a Sunday late evening in London in the right week", () => {
    // 23:30 on Sunday 13 September in London is 22:30 UTC.
    expect(calc.weekStart(new Date("2026-09-13T22:30:00Z"))).toBe("2026-09-07");
    // 00:30 on Monday 14 September in London is 23:30 UTC on the Sunday.
    expect(calc.weekStart(new Date("2026-09-13T23:30:00Z"))).toBe("2026-09-14");
  });

  it("summarises each person", () => {
    expect(calc.activityByPerson([{ id: "u1", name: "Aisha" }, { id: "u3", name: "Nobody" }], acts, emails, meetings)).toEqual([
      { userId: "u1", name: "Aisha", calls: 2, emails: 2, meetings: 1, connectRate: 50, replyRate: 50 },
    ]);
  });

  it("scores templates on replies and meetings booked within 14 days", () => {
    const t = calc.templatePerformance([{ id: "t1", name: "EPC risk" }], emails, meetings, [{ emailTemplateId: "t1" }, { emailTemplateId: "t1" }]);
    expect(t).toEqual([{ templateId: "t1", template: "EPC risk", drafts: 2, sent: 2, replies: 1, replyRate: 50, meetings: 1, meetingRate: 50 }]);
  });

  it("links news to meetings at the same company within 30 days", () => {
    const news = [
      { companyId: "co1", newsType: "FUND_RAISE" as const, createdAt: new Date("2026-09-01") },
      { companyId: "co2", newsType: "FUND_RAISE" as const, createdAt: new Date("2026-09-01") },
      { companyId: "co1", newsType: "NEW_RULES" as const, createdAt: new Date("2026-06-01") },
    ];
    expect(calc.newsToMeetings(news, meetings)).toEqual([
      { type: "FUND_RAISE", items: 2, meetings: 1, rate: 50 },
      { type: "NEW_RULES", items: 1, meetings: 0, rate: 0 },
    ]);
  });

  it("shows No data rather than 0% when there is nothing to measure", () => {
    expect(calc.rate(0, 0)).toBeNull();
  });
});
