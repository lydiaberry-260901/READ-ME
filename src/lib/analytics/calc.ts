// Dashboard calculations. Pure functions over plain records, so they can be tested with fixed
// data. Loading (and access rules) happens in load.ts.
import { LossReason, type CustomerGroup, type HealthFlag, type NewsType, type StageKind } from "@/generated/prisma/enums";
import { TIME_ZONE } from "@/lib/format";

const DAY = 86_400_000;

/** The Monday that starts the week, as yyyy-mm-dd in London time. */
const londonParts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function weekStart(date: Date): string {
  const parts = Object.fromEntries(londonParts.formatToParts(date).map((p) => [p.type, p.value]));
  const offset = WEEKDAYS.indexOf(parts.weekday);
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - offset));
  return monday.toISOString().slice(0, 10);
}

/** Every week start between two dates, so empty weeks still appear on charts. */
export function weeksBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let t = from.getTime(); t <= to.getTime() + 6 * DAY; t += 7 * DAY) {
    const w = weekStart(new Date(t));
    if (!out.includes(w) && new Date(`${w}T12:00:00Z`) <= to) out.push(w);
  }
  return out;
}

export type ActivityRecord = { type: "CALL" | "EMAIL" | "MEETING" | "NOTE"; userId: string | null; occurredAt: Date; callResult: string | null };
export type EmailRecord = { userId: string | null; direction: "SENT" | "RECEIVED"; sentAt: Date; repliedAt: Date | null; emailTemplateId: string | null; contactId: string | null };
export type MeetingRecord = { userId: string; startAt: Date; contactId: string | null; companyId: string | null };

export function activityByWeek(weeks: string[], activities: ActivityRecord[], emails: EmailRecord[], meetings: MeetingRecord[]) {
  const rows = new Map(weeks.map((w) => [w, { week: w, calls: 0, emails: 0, meetings: 0 }]));
  for (const a of activities) {
    const r = rows.get(weekStart(a.occurredAt));
    if (!r) continue;
    if (a.type === "CALL") r.calls++;
    if (a.type === "EMAIL") r.emails++;
    if (a.type === "MEETING") r.meetings++;
  }
  for (const e of emails) {
    const r = rows.get(weekStart(e.sentAt));
    if (r && e.direction === "SENT") r.emails++;
  }
  for (const m of meetings) {
    const r = rows.get(weekStart(m.startAt));
    if (r) r.meetings++;
  }
  return [...rows.values()];
}

export function activityByPerson(people: { id: string; name: string }[], activities: ActivityRecord[], emails: EmailRecord[], meetings: MeetingRecord[]) {
  return people
    .map((p) => {
      const calls = activities.filter((a) => a.userId === p.id && a.type === "CALL");
      const connected = calls.filter((c) => c.callResult === "CONNECTED").length;
      const sent = emails.filter((e) => e.userId === p.id && e.direction === "SENT");
      const replied = sent.filter((e) => e.repliedAt).length;
      const loggedEmails = activities.filter((a) => a.userId === p.id && a.type === "EMAIL").length;
      const loggedMeetings = activities.filter((a) => a.userId === p.id && a.type === "MEETING").length;
      return {
        userId: p.id,
        name: p.name,
        calls: calls.length,
        emails: sent.length + loggedEmails,
        meetings: meetings.filter((m) => m.userId === p.id).length + loggedMeetings,
        connectRate: rate(connected, calls.length),
        replyRate: rate(replied, sent.length),
      };
    })
    .filter((r) => r.calls + r.emails + r.meetings > 0);
}

/** A percentage, or null when there is nothing to divide by (shown as "No data"). */
export function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export function connectAndReplyRates(activities: ActivityRecord[], emails: EmailRecord[]) {
  const calls = activities.filter((a) => a.type === "CALL");
  const sent = emails.filter((e) => e.direction === "SENT");
  return {
    calls: calls.length,
    connected: calls.filter((c) => c.callResult === "CONNECTED").length,
    connectRate: rate(calls.filter((c) => c.callResult === "CONNECTED").length, calls.length),
    emailsSent: sent.length,
    replied: sent.filter((e) => e.repliedAt).length,
    replyRate: rate(sent.filter((e) => e.repliedAt).length, sent.length),
  };
}

export type StageInfo = { id: string; name: string; kind: StageKind; probability: number; position: number };
export type MoveRecord = { fromStageId: string | null; toStageId: string; movedAt: Date; secondsInPreviousStage: number | null };

/** How many deals entered each stage in the period, and how many of those went on to a later stage. */
export function stageFlow(stages: StageInfo[], moves: MoveRecord[]) {
  const pos = new Map(stages.map((s) => [s.id, s.position]));
  return stages.map((s) => {
    const entered = moves.filter((m) => m.toStageId === s.id).length;
    const movedOn = moves.filter((m) => m.fromStageId === s.id && (pos.get(m.toStageId) ?? -1) > s.position).length;
    return { stageId: s.id, stage: s.name, kind: s.kind, entered, movedOn };
  });
}

/** Average days deals spent in each open stage before moving, from moves in the period. */
export function averageDaysInStage(stages: StageInfo[], moves: MoveRecord[]) {
  return stages
    .filter((s) => s.kind === "OPEN")
    .map((s) => {
      const times = moves.filter((m) => m.fromStageId === s.id && m.secondsInPreviousStage !== null).map((m) => m.secondsInPreviousStage! / 86_400);
      return { stageId: s.id, stage: s.name, days: times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null, moves: times.length };
    });
}

export type DealRecord = {
  id: string;
  stageId: string;
  stageKind: StageKind;
  value: number;
  finalValue: number | null;
  customerGroup: CustomerGroup | null;
  lossReason: LossReason | null;
  closedAt: Date | null;
  qualificationPct: number;
  healthFlag: HealthFlag | null;
  ownerId: string;
};

/** Open pipeline value by stage, and expected income (value times the stage's chance of winning). */
export function pipelineByStage(stages: StageInfo[], deals: DealRecord[]) {
  return stages
    .filter((s) => s.kind === "OPEN")
    .map((s) => {
      const inStage = deals.filter((d) => d.stageId === s.id && d.stageKind === "OPEN");
      const value = inStage.reduce((a, d) => a + d.value, 0);
      return { stageId: s.id, stage: s.name, deals: inStage.length, value, expected: Math.round((value * s.probability) / 100) };
    });
}

const GROUPS: (CustomerGroup | null)[] = ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", null];

/** Win rate and average won deal size by customer group, for deals closed in the period. */
export function winRateByGroup(closed: DealRecord[]) {
  return GROUPS.map((g) => {
    const inGroup = closed.filter((d) => d.customerGroup === g);
    const won = inGroup.filter((d) => d.stageKind === "WON");
    const lost = inGroup.filter((d) => d.stageKind === "LOST");
    const wonValue = won.reduce((a, d) => a + (d.finalValue ?? d.value), 0);
    return {
      group: g,
      won: won.length,
      lost: lost.length,
      winRate: rate(won.length, won.length + lost.length),
      averageWon: won.length ? Math.round(wonValue / won.length) : null,
    };
  }).filter((r) => r.won + r.lost > 0);
}

/** Reasons for losing, always in the fixed list order, including reasons with no deals. */
export function lossReasons(closed: DealRecord[]) {
  const lost = closed.filter((d) => d.stageKind === "LOST");
  return (Object.values(LossReason) as LossReason[]).map((reason) => ({
    reason,
    deals: lost.filter((d) => d.lossReason === reason).length,
    value: lost.filter((d) => d.lossReason === reason).reduce((a, d) => a + d.value, 0),
  }));
}

export function healthCounts(open: DealRecord[]) {
  return (["ON_TRACK", "AT_RISK", "STALLED"] as HealthFlag[]).map((flag) => ({
    flag,
    deals: open.filter((d) => d.healthFlag === flag).length,
    value: open.filter((d) => d.healthFlag === flag).reduce((a, d) => a + d.value, 0),
  }));
}

export function averageQualification(open: DealRecord[]): number | null {
  return open.length ? Math.round(open.reduce((a, d) => a + d.qualificationPct, 0) / open.length) : null;
}

/** For each template: emails sent, replies, and meetings booked with that person within 14 days. */
export function templatePerformance(templates: { id: string; name: string }[], emails: EmailRecord[], meetings: MeetingRecord[], drafts: { emailTemplateId: string | null }[]) {
  const WINDOW = 14 * DAY;
  return templates
    .map((t) => {
      const sent = emails.filter((e) => e.direction === "SENT" && e.emailTemplateId === t.id);
      const booked = sent.filter((e) => e.contactId && meetings.some((m) => m.contactId === e.contactId && m.startAt >= e.sentAt && m.startAt.getTime() - e.sentAt.getTime() <= WINDOW)).length;
      const replies = sent.filter((e) => e.repliedAt).length;
      return {
        templateId: t.id,
        template: t.name,
        drafts: drafts.filter((d) => d.emailTemplateId === t.id).length,
        sent: sent.length,
        replies,
        replyRate: rate(replies, sent.length),
        meetings: booked,
        meetingRate: rate(booked, sent.length),
      };
    })
    .sort((a, b) => b.sent - a.sent || b.drafts - a.drafts);
}

/** For each type of news: how many items, and how many were followed by a meeting at that company within 30 days. */
export function newsToMeetings(news: { companyId: string; newsType: NewsType | null; createdAt: Date }[], meetings: MeetingRecord[]) {
  const WINDOW = 30 * DAY;
  const types = [...new Set(news.map((n) => n.newsType ?? "OTHER"))] as NewsType[];
  return types
    .map((type) => {
      const items = news.filter((n) => (n.newsType ?? "OTHER") === type);
      const led = items.filter((n) => meetings.some((m) => m.companyId === n.companyId && m.startAt >= n.createdAt && m.startAt.getTime() - n.createdAt.getTime() <= WINDOW)).length;
      return { type, items: items.length, meetings: led, rate: rate(led, items.length) };
    })
    .sort((a, b) => b.items - a.items);
}
