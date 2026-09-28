"use client";

import { ChartCard, ColumnChart, RowChart } from "@/components/charts";
import { chart } from "@/design/tokens";

type Props = {
  byType: { type: string; items: number; relevant: number }[];
  byWeek: { week: string; items: number }[];
};

export function NewsCharts({ byType, byWeek }: Props) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard
        title="News by type"
        note="Items in the chosen period. Very relevant means 4 or 5 out of 5."
        table={{ columns: ["Type of news", "Items", "Very relevant"], rows: byType.map((t) => [t.type, t.items, t.relevant]) }}
      >
        {byType.length ? <RowChart data={byType} labelKey="type" valueKey="items" label="Items" /> : <p className="py-10 text-center text-sm text-fg-muted">No news in this period.</p>}
      </ChartCard>
      <ChartCard
        title="News found each week"
        note="The last 12 weeks, by the date each item was found."
        table={{ columns: ["Week starting", "Items"], rows: byWeek.map((w) => [w.week, w.items]) }}
      >
        <ColumnChart data={byWeek} xKey="week" series={[{ key: "items", label: "Items", colour: chart.single }]} />
      </ChartCard>
    </div>
  );
}
