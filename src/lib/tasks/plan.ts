// Chooses which suggested tasks to create for a person today: no duplicates, most important first,
// and never more than the daily limit. Pure, so the rules are easy to test.
import type { TaskOrigin, TaskPriority, TaskType } from "@/generated/prisma/enums";

export type RuleName = "news" | "flagged" | "call" | "followUp" | "outreach" | "stale" | "prospect";

export type Candidate = {
  rule: RuleName;
  dedupeKey: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  dueAt: Date;
  reason: string;
  origin: TaskOrigin;
  suggestedAction: string;
  draftMessage?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  newsItemId?: string | null;
  value?: number; // deal value, used to break ties
};

// Within the same priority, rules earlier in this list come first.
export const RULE_ORDER: RuleName[] = ["flagged", "call", "news", "followUp", "stale", "outreach", "prospect"];
const PRIORITY_ORDER: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function orderCandidates(list: Candidate[]): Candidate[] {
  return [...list].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) ||
      (b.value ?? 0) - (a.value ?? 0) ||
      a.dueAt.getTime() - b.dueAt.getTime() ||
      a.dedupeKey.localeCompare(b.dedupeKey),
  );
}

/**
 * @param existingKeys keys of tasks that already exist, so they are never created twice
 * @param limit the most tasks the rules may create for one person in a day
 * @param createdToday how many rule tasks this person already got today (for a second run)
 */
export function planDailyTasks(candidates: Candidate[], existingKeys: Set<string>, limit: number, createdToday = 0): Candidate[] {
  const seen = new Set<string>();
  const fresh = orderCandidates(candidates).filter((c) => {
    if (existingKeys.has(c.dedupeKey) || seen.has(c.dedupeKey)) return false;
    seen.add(c.dedupeKey);
    return true;
  });
  return fresh.slice(0, Math.max(0, limit - createdToday));
}
