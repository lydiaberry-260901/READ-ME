"use client";

// Charts for the dashboards. Bars grow up from the baseline when a page opens and morph into
// their new shape when a filter changes. Every chart can also be shown as a table.
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { chart, colours } from "@/design/tokens";
import { usePrefersReducedMotion } from "@/components/motion";

export type Format = "number" | "pounds" | "percent" | "days";

export function formatValue(v: number | null | undefined, f: Format = "number") {
  if (v === null || v === undefined) return "No data";
  if (f === "pounds") return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);
  if (f === "percent") return `${v}%`;
  if (f === "days") return `${v} ${v === 1 ? "day" : "days"}`;
  return new Intl.NumberFormat("en-GB").format(v);
}

function compact(v: number, f: Format) {
  if (f === "pounds") return v >= 1_000_000 ? `£${Math.round(v / 100_000) / 10}m` : v >= 1000 ? `£${Math.round(v / 1000)}k` : `£${v}`;
  if (f === "percent") return `${v}%`;
  return new Intl.NumberFormat("en-GB", { notation: "compact" }).format(v);
}

/** Rounds up to a tidy number for the top of a scale: 1, 2, 2.5 or 5 times a power of ten. */
export function niceCeiling(v: number) {
  if (v <= 0) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= v)!;
  return step * mag;
}

export type Series = { key: string; label: string; colour: string };

/** Frame around every chart: title, a short note, and a switch between chart and table. */
export function ChartCard({
  title,
  note,
  csvHref,
  table,
  children,
  className = "",
}: {
  title: string;
  note?: string;
  csvHref?: string;
  table: { columns: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`flex flex-col rounded-lg border border-line bg-panel ${className}`} aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {note ? <p className="mt-0.5 text-xs text-fg-muted">{note}</p> : null}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => setAsTable((t) => !t)} className="text-fg-muted underline-offset-4 hover:text-fg hover:underline">
            {asTable ? "Show chart" : "Show table"}
          </button>
          {csvHref ? <a href={csvHref} className="text-fg-muted underline-offset-4 hover:text-fg hover:underline">Download CSV</a> : null}
        </div>
      </header>
      <div className="flex-1 p-4">
        {asTable ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-fg-muted">
                <tr>{table.columns.map((c) => <th key={c} scope="col" className="py-1.5 pr-3 font-medium">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="py-1.5 pr-3 tabular-nums">{c}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function TooltipBox({ active, payload, label, format, labelFormat }: TooltipContentProps<number, string> & { format: Format; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line-strong bg-panel-raised px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-fg">{labelFormat ? labelFormat(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-fg">
          <span aria-hidden="true" className="inline-block size-2 rounded-sm" style={{ background: (p.payload?.__colour as string) ?? p.color }} />
          <span className="text-fg-muted">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{formatValue(p.value as number, format)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Vertical bars along a category or time axis. With more than one series the bars are grouped,
 * and a legend is shown.
 */
export function ColumnChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  format = "number",
  height = 240,
  xLabel,
  stacked = false,
}: {
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  format?: Format;
  height?: number;
  xLabel?: (v: string) => string;
  stacked?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  // A tidy top for the scale, worked out from the data so bars use the height well.
  const peak = Math.max(0, ...data.map((d) => (stacked ? series.reduce((a, s) => a + ((d[s.key] as number) ?? 0), 0) : Math.max(...series.map((s) => (d[s.key] as number) ?? 0)))));
  const top = niceCeiling(peak);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={chart.grid} strokeWidth={1} />
          <XAxis dataKey={xKey as string} tickFormatter={xLabel} tick={{ fill: chart.axis, fontSize: 11 }} axisLine={{ stroke: chart.grid }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tickFormatter={(v: number) => compact(v, format)} tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={48} allowDecimals={false} domain={[0, top]} tickCount={5} />
          <Tooltip cursor={{ fill: "rgba(242,237,230,0.06)" }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} format={format} labelFormat={xLabel} />} />
          {series.length > 1 ? <Legend verticalAlign="top" align="right" iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: chart.axis, paddingBottom: 8 }} /> : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.colour}
              stackId={stacked ? "stack" : undefined}
              radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
              maxBarSize={36}
              stroke={stacked ? "var(--moca-panel)" : undefined}
              strokeWidth={stacked ? 2 : 0}
              isAnimationActive={!reduced}
              animationBegin={i * 120}
              animationDuration={chart.animationMs}
              animationEasing={chart.animationEasing}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Horizontal bars for a ranked or fixed list of categories (stages, loss reasons, groups).
 * Values are written at the end of each bar, so reading them never depends on the axis.
 */
export function RowChart<T extends Record<string, unknown>>({
  data,
  labelKey,
  valueKey,
  label,
  format = "number",
  colour = chart.single,
  colourFor,
  rowHeight = 30,
}: {
  data: T[];
  labelKey: keyof T & string;
  valueKey: keyof T & string;
  label: string;
  format?: Format;
  colour?: string;
  colourFor?: (row: T) => string;
  rowHeight?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const rows = data.map((d) => ({
    ...d,
    __colour: colourFor ? colourFor(d) : colour,
    __value: (d[valueKey] as number | null) ?? 0,
    __label: formatValue(d[valueKey] as number | null, format),
  }));
  return (
    <div style={{ height: Math.max(120, rows.length * rowHeight + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 4 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey={labelKey as string} tick={{ fill: chart.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={150} />
          <Tooltip cursor={{ fill: "rgba(242,237,230,0.06)" }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} format={format} />} />
          <Bar
            dataKey="__value"
            name={label}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={!reduced}
            animationDuration={chart.animationMs}
            animationEasing={chart.animationEasing}
          >
            {rows.map((r, i) => <Cell key={i} fill={r.__colour} />)}
            <LabelList dataKey="__label" position="right" fill={colours.fg} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
