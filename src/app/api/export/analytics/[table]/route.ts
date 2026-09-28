// CSV downloads for the dashboard tables, using the same filters and access rules as the page.
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { csvResponse, fileDate, toCsv } from "@/lib/csv";
import { loadAnalytics, parseAnalyticsFilters } from "@/lib/analytics/load";
import { customerGroupLabels, healthFlagLabels, lossReasonLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ table: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const { table } = await params;
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const d = await loadAnalytics(user, parseAnalyticsFilters(search));
  const group = (g: string | null) => (g ? customerGroupLabels[g as keyof typeof customerGroupLabels] : "No group");

  const tables: Record<string, [string[], (string | number | null)[][]]> = {
    "activity-by-week": [["Week starting", "Calls", "Emails", "Meetings"], d.activityByWeek.map((w) => [w.week, w.calls, w.emails, w.meetings])],
    "activity-by-person": [["Person", "Calls", "Emails", "Meetings", "Calls that connect (%)", "Emails replied to (%)"], d.activityByPerson.map((p) => [p.name, p.calls, p.emails, p.meetings, p.connectRate, p.replyRate])],
    health: [["Health", "Deals", "Value (£)"], d.healthCounts.map((h) => [healthFlagLabels[h.flag], h.deals, h.value])],
    "pipeline-by-stage": [["Stage", "Deals", "Value (£)", "Expected income (£)"], d.pipelineByStage.map((s) => [s.stage, s.deals, s.value, s.expected])],
    "time-in-stage": [["Stage", "Average days", "Moves counted"], d.averageDaysInStage.map((s) => [s.stage, s.days, s.moves])],
    "stage-flow": [["Stage", "Entered", "Moved on to a later stage"], d.stageFlow.map((s) => [s.stage, s.entered, s.movedOn])],
    "loss-reasons": [["Reason", "Deals", "Value (£)"], d.lossReasons.map((r) => [lossReasonLabels[r.reason], r.deals, r.value])],
    "win-rate": [["Customer group", "Won", "Lost", "Win rate (%)", "Average won deal (£)"], d.winRateByGroup.map((g) => [group(g.group), g.won, g.lost, g.winRate, g.averageWon])],
    templates: [["Template", "Drafts", "Sent", "Replies", "Reply rate (%)", "Meetings booked", "Meeting rate (%)"], d.templatePerformance.map((t) => [t.template, t.drafts, t.sent, t.replies, t.replyRate, t.meetings, t.meetingRate])],
    news: [["Type of news", "Items", "Led to a meeting", "Rate (%)"], d.newsToMeetings.map((n) => [n.type, n.items, n.meetings, n.rate])],
  };
  const found = tables[table];
  if (!found) return new Response("Unknown table.", { status: 404 });
  await audit({ organisationId: user.organisationId, userId: user.id, action: `export.analytics.${table}`, details: { filters: search, rows: found[1].length } });
  return csvResponse(toCsv(found[0], found[1]), `${table}-${fileDate()}.csv`);
}
