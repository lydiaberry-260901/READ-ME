"use client";

import { chart, chartPalette } from "@/design/tokens";
import { ChartCard, ColumnChart, RowChart, formatValue } from "@/components/charts";
import { AnimatedNumber } from "@/components/motion";
import type { Analytics } from "@/lib/analytics/load";

const groupLabels: Record<string, string> = { ASSET_ESG: "Asset and ESG", PROPERTY_MANAGER: "Property manager", OCCUPIER: "Occupier", none: "No group" };
const lossLabels: Record<string, string> = {
  BUDGET: "Budget", TIMING: "Timing", NO_DECISION: "No decision", LOST_TO_COMPETITOR: "Lost to competitor",
  NO_ECONOMIC_BUYER: "No economic buyer", PRODUCT_FIT: "Product fit", OTHER: "Other",
};
const healthLabels: Record<string, string> = { ON_TRACK: "On track", AT_RISK: "At risk", STALLED: "Stalled" };
const newsLabels: Record<string, string> = {
  FUND_RAISE: "Fund raise", PROPERTY_TRANSACTION: "Buying or selling property", NEW_ESG_HIRE: "New ESG or energy hire", BUILDING_WORK: "Building work",
  EPC_CRREM: "EPC or CRREM news", TENDER_APPOINTMENT: "Tender or appointment", NEW_RULES: "New rules", OTHER: "Other",
};
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (v: number | null) => (v === null ? "No data" : `${v}%`);

function Kpi({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="bg-panel px-5 py-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{children}</p>
      {note ? <p className="mt-0.5 text-xs text-fg-muted">{note}</p> : null}
    </div>
  );
}

function DataTable({ title, note, csvHref, columns, rows, empty }: { title: string; note?: string; csvHref: string; columns: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <section className="rounded-lg border border-line bg-panel" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {note ? <p className="mt-0.5 text-xs text-fg-muted">{note}</p> : null}
        </div>
        <a href={csvHref} className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline">Download CSV</a>
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-fg-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-panel-sunk text-xs text-fg-muted">
              <tr>{columns.map((c, i) => <th key={c} scope="col" className={`px-5 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={`px-5 py-2 tabular-nums ${j > 0 ? "text-right" : ""}`}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Dashboard({ data, query }: { data: Analytics; query: string }) {
  const csv = (table: string) => `/api/export/analytics/${table}${query}`;
  const closedDeals = data.winRateByGroup.reduce((a, r) => a + r.won + r.lost, 0);
  const wonDeals = data.winRateByGroup.reduce((a, r) => a + r.won, 0);
  const overallWinRate = closedDeals ? Math.round((wonDeals / closedDeals) * 100) : null;
  const activitySeries = [
    { key: "calls", label: "Calls", colour: chartPalette[0] },
    { key: "emails", label: "Emails", colour: chartPalette[1] },
    { key: "meetings", label: "Meetings", colour: chartPalette[2] },
  ];

  return (
    <div className="grid gap-6">
      <section aria-label="Headline figures" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Open pipeline"><AnimatedNumber value={data.openValue} format="pounds" /></Kpi>
        <Kpi label="Expected income" note="Value times each stage's chance"><AnimatedNumber value={data.expectedIncome} format="pounds" /></Kpi>
        <Kpi label="Won in period" note={`${data.wonInPeriod} deals`}><AnimatedNumber value={data.wonValue} format="pounds" /></Kpi>
        <Kpi label="Win rate">{overallWinRate === null ? "No data" : <AnimatedNumber value={overallWinRate} format="percent" />}</Kpi>
        <Kpi label="Average qualification" note={`${data.openDeals} open deals`}>{data.averageQualification === null ? "No data" : <AnimatedNumber value={data.averageQualification} format="percent" />}</Kpi>
        <Kpi label="Calls that connect" note={`${data.rates.connected} of ${data.rates.calls}`}>{data.rates.connectRate === null ? "No data" : <AnimatedNumber value={data.rates.connectRate} format="percent" />}</Kpi>
        <Kpi label="Emails replied to" note={`${data.rates.replied} of ${data.rates.emailsSent}`}>{data.rates.replyRate === null ? "No data" : <AnimatedNumber value={data.rates.replyRate} format="percent" />}</Kpi>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Calls, emails and meetings each week"
          note="Weeks start on Monday."
          csvHref={csv("activity-by-week")}
          table={{ columns: ["Week starting", "Calls", "Emails", "Meetings"], rows: data.activityByWeek.map((w) => [shortDate(w.week), w.calls, w.emails, w.meetings]) }}
        >
          <ColumnChart data={data.activityByWeek} xKey="week" series={activitySeries} xLabel={shortDate} stacked height={260} />
        </ChartCard>

        <ChartCard
          title="Health of open deals"
          csvHref={csv("health")}
          table={{ columns: ["Health", "Deals", "Value"], rows: data.healthCounts.map((h) => [healthLabels[h.flag], h.deals, formatValue(h.value, "pounds")]) }}
        >
          <RowChart
            data={data.healthCounts.map((h) => ({ ...h, label: healthLabels[h.flag] }))}
            labelKey="label"
            valueKey="deals"
            label="Deals"
            colourFor={(r) => (r.flag === "ON_TRACK" ? chart.good : r.flag === "AT_RISK" ? chart.attention : chart.bad)}
            rowHeight={44}
          />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Open pipeline by stage"
          note="Expected income weights each stage by its chance of winning."
          csvHref={csv("pipeline-by-stage")}
          table={{ columns: ["Stage", "Deals", "Value", "Expected income"], rows: data.pipelineByStage.map((s) => [s.stage, s.deals, formatValue(s.value, "pounds"), formatValue(s.expected, "pounds")]) }}
        >
          <RowChart data={data.pipelineByStage} labelKey="stage" valueKey="value" label="Value" format="pounds" />
        </ChartCard>

        <ChartCard
          title="Average time in each stage"
          note="From deals that left the stage in this period."
          csvHref={csv("time-in-stage")}
          table={{ columns: ["Stage", "Average days", "Moves counted"], rows: data.averageDaysInStage.map((s) => [s.stage, s.days ?? "No data", s.moves]) }}
        >
          <RowChart data={data.averageDaysInStage} labelKey="stage" valueKey="days" label="Average" format="days" />
        </ChartCard>

        <ChartCard
          title="How deals move through the stages"
          note="Deals that entered each stage in this period."
          csvHref={csv("stage-flow")}
          table={{ columns: ["Stage", "Entered", "Moved on to a later stage"], rows: data.stageFlow.map((s) => [s.stage, s.entered, s.movedOn]) }}
        >
          <RowChart
            data={data.stageFlow}
            labelKey="stage"
            valueKey="entered"
            label="Entered"
            colourFor={(r) => (r.kind === "WON" ? chart.good : r.kind === "LOST" ? chart.bad : chart.single)}
          />
        </ChartCard>

        <ChartCard
          title="Why deals were lost"
          note="Deals closed as lost in this period, by the fixed list of reasons."
          csvHref={csv("loss-reasons")}
          table={{ columns: ["Reason", "Deals", "Value"], rows: data.lossReasons.map((r) => [lossLabels[r.reason], r.deals, formatValue(r.value, "pounds")]) }}
        >
          <RowChart data={data.lossReasons.map((r) => ({ ...r, label: lossLabels[r.reason] }))} labelKey="label" valueKey="deals" label="Deals" colour={chart.bad} rowHeight={26} />
        </ChartCard>

        <ChartCard
          title="Win rate by customer group"
          note="Deals closed in this period."
          csvHref={csv("win-rate")}
          table={{ columns: ["Customer group", "Won", "Lost", "Win rate", "Average won deal"], rows: data.winRateByGroup.map((g) => [groupLabels[g.group ?? "none"], g.won, g.lost, pct(g.winRate), formatValue(g.averageWon, "pounds")]) }}
        >
          {data.winRateByGroup.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-muted">No deals were closed in this period.</p>
          ) : (
            <RowChart data={data.winRateByGroup.map((g) => ({ ...g, label: groupLabels[g.group ?? "none"] }))} labelKey="label" valueKey="winRate" label="Win rate" format="percent" colour={chart.good} rowHeight={40} />
          )}
        </ChartCard>

        <DataTable
          title="Activity by person"
          csvHref={csv("activity-by-person")}
          columns={["Person", "Calls", "Emails", "Meetings", "Calls that connect", "Emails replied to"]}
          rows={data.activityByPerson.map((p) => [p.name, p.calls, p.emails, p.meetings, pct(p.connectRate), pct(p.replyRate)])}
          empty="No calls, emails or meetings recorded in this period yet. They appear once email and calendar are connected, and as calls are logged."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataTable
          title="Which templates work best"
          note="Meetings booked counts a meeting with the same person within 14 days of the email."
          csvHref={csv("templates")}
          columns={["Template", "Drafts", "Sent", "Replies", "Reply rate", "Meetings booked"]}
          rows={data.templatePerformance.filter((t) => t.drafts + t.sent > 0).map((t) => [t.template, t.drafts, t.sent, t.replies, pct(t.replyRate), t.meetings])}
          empty="No templates used in this period yet."
        />
        <DataTable
          title="Which news leads to meetings"
          note="A meeting at the same company within 30 days of the news."
          csvHref={csv("news")}
          columns={["Type of news", "Items", "Led to a meeting", "Rate"]}
          rows={data.newsToMeetings.map((n) => [newsLabels[n.type] ?? n.type, n.items, n.meetings, pct(n.rate)])}
          empty="No news collected in this period yet."
        />
      </div>
    </div>
  );
}
