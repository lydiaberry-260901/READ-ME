// Small shared building blocks for screens.
import clsx from "clsx";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-mocha-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "green" | "amber" | "red";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-sunk text-mocha border-stone",
  green: "bg-green-tint text-green-ink border-green/30",
  amber: "bg-amber-tint text-amber-ink border-amber/50",
  red: "bg-red-tint text-red-ink border-red/30",
};

/** A small label. Always has text, so meaning never depends on colour alone. */
export function Badge({ tone = "neutral", children, icon }: { tone?: Tone; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", toneClasses[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  return (
    <div role={tone === "red" ? "alert" : "status"} className={clsx("rounded-md border px-4 py-3 text-sm", toneClasses[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-mocha-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-mocha-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-strong/60 bg-surface-sunk px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-mocha-muted">{children}</div> : null}
    </div>
  );
}
