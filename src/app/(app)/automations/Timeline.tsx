"use client";

import { chart } from "@/design/tokens";
import { ChartCard, ColumnChart } from "@/components/charts";

export function AutomationTimeline({ data }: { data: { hour: string; done: number; failed: number }[] }) {
  return (
    <ChartCard
      title="Work done in the last 24 hours"
      note="Jobs finished each hour, London time."
      table={{ columns: ["Hour", "Finished", "Failed"], rows: data.map((d) => [d.hour, d.done, d.failed]) }}
    >
      <ColumnChart
        data={data}
        xKey="hour"
        stacked
        height={200}
        series={[
          { key: "done", label: "Finished", colour: chart.good },
          { key: "failed", label: "Failed", colour: chart.bad },
        ]}
      />
    </ChartCard>
  );
}
