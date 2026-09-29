import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui";
import { BreachClock } from "../clock";

export const metadata = { title: "Breaches" };

const riskLabels = { UNKNOWN: "Risk not decided", UNLIKELY: "Unlikely to be a risk", RISK: "A risk to people", HIGH_RISK: "A high risk to people" } as const;
const icoLabels = { NOT_DECIDED: "ICO decision needed", REPORTED: "Reported to the ICO", NOT_REQUIRED: "Not reportable" } as const;

export default async function BreachesPage() {
  const user = await requireCapability("privacy.access");
  const breaches = await prisma.breach.findMany({ where: { organisationId: user.organisationId }, orderBy: [{ status: "asc" }, { discoveredAt: "desc" }], take: 200 });
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Breaches</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            A breach is any loss, change, sharing or access to personal data that should not have happened, including by accident. Record every one, even if it is not reported. If it could be a risk to people, the ICO must be told within 72 hours of finding out.
          </p>
        </div>
        <Link href="/privacy/breaches/new" className="btn border border-red/40 bg-transparent py-1.5 text-red-text no-underline hover:bg-red-tint">Report a breach</Link>
      </header>
      {breaches.length === 0 ? (
        <EmptyState title="No breaches recorded">If something goes wrong, report it here straight away so the clock starts.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {breaches.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-panel px-5 py-4">
              <div className="min-w-0">
                <Link href={`/privacy/breaches/${b.id}`} className="font-medium text-fg">{b.title}</Link>
                <p className="mt-1 flex flex-wrap gap-2 text-xs text-fg-muted">
                  <span>Found {formatDateTime(b.discoveredAt)}</span>
                  <Badge tone={b.risk === "HIGH_RISK" || b.risk === "RISK" ? "red" : "neutral"}>{riskLabels[b.risk]}</Badge>
                  <Badge tone={b.icoDecision === "NOT_DECIDED" ? "amber" : "neutral"}>{icoLabels[b.icoDecision]}</Badge>
                  {b.status === "CLOSED" ? <Badge tone="green">Closed</Badge> : null}
                </p>
              </div>
              {b.status === "OPEN" ? <BreachClock discoveredAt={b.discoveredAt.toISOString()} decided={b.icoDecision !== "NOT_DECIDED"} size="sm" /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
