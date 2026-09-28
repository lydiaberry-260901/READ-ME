import { describe, expect, it } from "vitest";
import { LossReason, HealthFlag, StakeholderRole } from "@/generated/prisma/enums";
import { lossReasonLabels, healthFlagLabels, stakeholderRoleLabels } from "@/lib/labels";
import { QUALIFICATION_FIELDS, qualificationCompleteness } from "@/lib/qualification";

describe("fixed lists", () => {
  it("has exactly the agreed reasons for losing a deal, in order", () => {
    expect(Object.values(lossReasonLabels)).toEqual([
      "Budget",
      "Timing",
      "No decision",
      "Lost to competitor",
      "No economic buyer",
      "Product fit",
      "Other",
    ]);
    expect(Object.keys(lossReasonLabels).sort()).toEqual(Object.values(LossReason).sort());
  });

  it("has the three health flags", () => {
    expect(Object.values(healthFlagLabels)).toEqual(["On track", "At risk", "Stalled"]);
    expect(Object.keys(healthFlagLabels).sort()).toEqual(Object.values(HealthFlag).sort());
  });

  it("has the five stakeholder roles", () => {
    expect(Object.values(stakeholderRoleLabels)).toEqual(["Champion", "Economic buyer", "Blocker", "Influencer", "User"]);
    expect(Object.keys(stakeholderRoleLabels).sort()).toEqual(Object.values(StakeholderRole).sort());
  });
});

describe("qualification completeness", () => {
  it("has the eight MEDDPICC fields", () => {
    expect(QUALIFICATION_FIELDS.map((f) => f.key)).toEqual([
      "metric",
      "economicBuyer",
      "decisionCriteria",
      "decisionProcess",
      "paperProcess",
      "identifiedPain",
      "champion",
      "competition",
    ]);
  });

  it("works out the share of fields filled in", () => {
    expect(qualificationCompleteness({})).toBe(0);
    expect(qualificationCompleteness({ metric: "Lift EPC to C", champion: "Head of ESG" })).toBe(25);
    expect(qualificationCompleteness({ metric: "   ", champion: null })).toBe(0);
    expect(
      qualificationCompleteness({
        metric: "a", economicBuyer: "b", decisionCriteria: "c", decisionProcess: "d",
        paperProcess: "e", identifiedPain: "f", champion: "g", competition: "h",
      }),
    ).toBe(100);
  });
});
