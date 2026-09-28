// Deal health: a score from 0 to 100 and a simple flag (On track, At risk, Stalled).
// Pure functions, so the rules are easy to test and explain.
//
// The score adds up four parts:
//   Qualification completeness  up to 35 points  (the share of the eight qualification fields filled in)
//   Engaged stakeholders        up to 25 points  (0 people: 0, 1: 8, 2: 18, 3 or more: 25)
//   Time in the current stage   up to 20 points  (at or under the usual time: 20, up to twice: 10, longer: 0)
//   Recent activity             up to 20 points  (compared with the stage's "no activity" limit)
// Flag: 65 or more is On track, 40 to 64 is At risk, under 40 is Stalled.
// A deal with no activity for more than twice the stage's limit is always Stalled.
import type { HealthFlag } from "@/generated/prisma/enums";

export type HealthInput = {
  qualificationPct: number; // 0 to 100
  engagedStakeholders: number;
  daysInStage: number;
  averageDaysInStage: number | null; // null when there is not enough history yet
  daysSinceActivity: number | null; // null when there has never been any activity
  noActivityDays: number; // the stage's limit before a deal counts as quiet
};

export type HealthResult = {
  score: number;
  flag: HealthFlag;
  parts: { qualification: number; stakeholders: number; stageTime: number; recency: number };
  reasons: string[]; // plain English reasons, shown on the deal page
};

export const DEFAULT_AVERAGE_DAYS_IN_STAGE = 21;
const MIN_AVERAGE_DAYS = 7;

export function calculateHealth(input: HealthInput): HealthResult {
  const reasons: string[] = [];

  const qualification = Math.round(Math.max(0, Math.min(100, input.qualificationPct)) * 0.35);
  if (input.qualificationPct < 50) reasons.push(`Qualification is only ${input.qualificationPct}% complete.`);

  const n = input.engagedStakeholders;
  const stakeholders = n <= 0 ? 0 : n === 1 ? 8 : n === 2 ? 18 : 25;
  if (n === 0) reasons.push("Nobody at the company is engaged on this deal yet.");
  else if (n === 1) reasons.push("Only one person is engaged (single threaded).");

  const average = Math.max(input.averageDaysInStage ?? DEFAULT_AVERAGE_DAYS_IN_STAGE, MIN_AVERAGE_DAYS);
  const ratio = input.daysInStage / average;
  const stageTime = ratio <= 1 ? 20 : ratio <= 2 ? 10 : 0;
  if (ratio > 1) reasons.push(`It has been in this stage for ${input.daysInStage} days, against a usual ${Math.round(average)}.`);

  const limit = Math.max(1, input.noActivityDays);
  const d = input.daysSinceActivity;
  const recency = d === null ? 0 : d <= limit / 2 ? 20 : d <= limit ? 12 : d <= limit * 2 ? 5 : 0;
  if (d === null) reasons.push("There has been no activity yet.");
  else if (d > limit) reasons.push(`No activity for ${d} days.`);

  const score = qualification + stakeholders + stageTime + recency;
  let flag: HealthFlag = score >= 65 ? "ON_TRACK" : score >= 40 ? "AT_RISK" : "STALLED";
  if (d !== null && d > limit * 2) flag = "STALLED";
  if (d === null && input.daysInStage > limit * 2) flag = "STALLED";

  return { score, flag, parts: { qualification, stakeholders, stageTime, recency }, reasons };
}

/** Whole days between two moments, never negative. */
export function wholeDays(from: Date | null | undefined, to: Date): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Single threaded: only one engaged contact on an open deal for longer than the setting.
 * Returns when the deal became single threaded (to store), and whether it now needs a warning.
 */
export function singleThreadedState(input: {
  engagedStakeholders: number;
  isOpen: boolean;
  singleThreadedSince: Date | null;
  thresholdDays: number;
  now: Date;
}): { since: Date | null; warn: boolean } {
  if (!input.isOpen || input.engagedStakeholders !== 1) return { since: null, warn: false };
  const since = input.singleThreadedSince ?? input.now;
  const days = wholeDays(since, input.now) ?? 0;
  return { since, warn: days > input.thresholdDays };
}
