"use client";

// Small visuals used across the CRM: trend lines that draw themselves in, rings that fill,
// and an activity pulse chart. All respect reduced motion.
import { useEffect, useId, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chart, colours } from "@/design/tokens";
import { usePrefersReducedMotion } from "@/components/motion";

/** A tiny trend line. Draws from left to right when it first appears. */
export function Sparkline({ values, colour = colours.greenText, width = 120, height = 32, label }: { values: number[]; colour?: string; width?: number; height?: number; label: string }) {
  const reduced = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(false);
  const gradientId = useId();
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, []);
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const length = width * 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity={0.28} />
          <stop offset="100%" stopColor={colour} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} style={{ opacity: drawn || reduced ? 1 : 0, transition: reduced ? undefined : "opacity 900ms ease-out 300ms" }} />
      <path
        d={line}
        fill="none"
        stroke={colour}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={length}
        strokeDashoffset={drawn || reduced ? 0 : length}
        style={{ transition: reduced ? undefined : "stroke-dashoffset 1100ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
      <circle cx={(values.length - 1) * step} cy={y(values[values.length - 1])} r={2.5} fill={colour} style={{ opacity: drawn || reduced ? 1 : 0, transition: reduced ? undefined : "opacity 300ms ease-out 1000ms" }} />
    </svg>
  );
}

export type RingPart = { label: string; value: number; colour: string };

/** A ring divided into parts, which sweep round when it first appears. Always shown with a legend. */
export function Ring({ parts, size = 132, thickness = 14, centre, centreLabel }: { parts: RingPart[]; size?: number; thickness?: number; centre: React.ReactNode; centreLabel: string }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60);
    return () => clearTimeout(t);
  }, []);
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && parts.filter((p) => p.value > 0).length > 1 ? 3 : 0; // a small gap between parts
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colours.line} strokeWidth={thickness} />
          {total > 0
            ? parts.map((p) => {
                const len = (p.value / total) * c;
                const dash = Math.max(0, len - gap);
                const el = (
                  <circle
                    key={p.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={p.colour}
                    strokeWidth={thickness}
                    strokeDasharray={`${shown ? dash : 0} ${c}`}
                    strokeDashoffset={-offset}
                    style={{ transition: reduced ? undefined : "stroke-dasharray 1000ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{centre}</p>
            <p className="text-[11px] text-fg-muted">{centreLabel}</p>
          </div>
        </div>
      </div>
      <ul className="grid gap-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: p.colour }} />
            <span className="text-fg-muted">{p.label}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Daily activity as a soft area, rising into shape when the page opens. */
export function PulseChart({ data, height = 140 }: { data: { day: string; total: number }[]; height?: number }) {
  const reduced = usePrefersReducedMotion();
  const gradientId = useId();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colours.greenText} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colours.greenText} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} tick={{ fill: chart.axis, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ stroke: colours.lineStrong, strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-line-strong bg-panel-raised px-3 py-2 text-xs shadow-xl">
                  <p className="font-semibold">{String(payload[0].payload.day).split("-").reverse().join("/")}</p>
                  <p className="text-fg-muted">{payload[0].value} calls, emails and meetings</p>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="total" stroke={colours.greenText} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={!reduced} animationDuration={1200} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
