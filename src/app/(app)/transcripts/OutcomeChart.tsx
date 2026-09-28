"use client";

import { ChartCard, RowChart } from "@/components/charts";
import { chart } from "@/design/tokens";

const good = new Set(["Meeting booked", "Interested", "Send information"]);
const poor = new Set(["Not interested", "Wrong person"]);

export function OutcomeChart({ rows }: { rows: { outcome: string; calls: number }[] }) {
  return (
    <ChartCard
      title="How calls ended"
      note="Calls read by the AI in the last 90 days. Green for a step forward, red for a dead end."
      table={{ columns: ["Outcome", "Calls"], rows: rows.map((r) => [r.outcome, r.calls]) }}
    >
      {rows.some((r) => r.calls > 0) ? (
        <RowChart data={rows} labelKey="outcome" valueKey="calls" label="Calls" colourFor={(r) => (good.has(r.outcome) ? chart.good : poor.has(r.outcome) ? chart.bad : chart.single)} />
      ) : (
        <p className="py-10 text-center text-sm text-fg-muted">No calls read yet.</p>
      )}
    </ChartCard>
  );
}
