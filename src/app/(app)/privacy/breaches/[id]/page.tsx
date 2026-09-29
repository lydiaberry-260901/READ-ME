import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { BREACH_CHECKLIST, type ChecklistState } from "@/lib/privacy/setup";
import { Notice } from "@/components/ui";
import { BreachClock } from "../../clock";
import { BreachForm, CloseBreachForm } from "../../forms";
import { toggleBreachCheck } from "../../actions";

/** A date and time as the value of a London time datetime input. */
function localValue(d: Date | null) {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export default async function BreachPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCapability("privacy.access");
  const { id } = await params;
  const b = await prisma.breach.findFirst({ where: { id, organisationId: user.organisationId }, include: { reportedBy: { select: { name: true } } } });
  if (!b) notFound();
  const state = (b.checklist ?? {}) as ChecklistState;
  const auto: Record<string, boolean> = { risk: b.risk !== "UNKNOWN", ico: b.icoDecision !== "NOT_DECIDED" };
  const closed = b.status === "CLOSED";
  const deadline = new Date(b.discoveredAt.getTime() + 72 * 3_600_000);

  return (
    <div className="grid gap-6">
      <p className="text-sm"><Link href="/privacy/breaches">Breaches</Link> <span className="text-fg-muted">/ {b.title}</span></p>
      <header className="grid gap-6 rounded-lg border border-line bg-panel p-6 lg:grid-cols-[1fr_auto]">
        <div>
          <h1 className="text-2xl font-semibold">{b.title}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            Found {formatDateTime(b.discoveredAt)}{b.reportedBy?.name ? `, recorded by ${b.reportedBy.name}` : ""}. {closed ? `Closed ${formatDateTime(b.closedAt)}.` : ""}
          </p>
          {b.icoReportedAt ? <p className="mt-1 text-sm text-green-text">Reported to the ICO on {formatDateTime(b.icoReportedAt)}{b.icoReference ? `, reference ${b.icoReference}` : ""}.</p> : null}
        </div>
        <div className="grid content-start gap-1">
          <p className="text-xs text-fg-muted">Time to decide on telling the ICO (by {formatDateTime(deadline)})</p>
          <BreachClock discoveredAt={b.discoveredAt.toISOString()} decided={b.icoDecision !== "NOT_DECIDED"} size="lg" />
        </div>
      </header>

      {b.risk === "HIGH_RISK" && !b.peopleToldAt ? <Notice tone="red" title="Tell the people affected">When a breach is a high risk to people, they must be told without delay, in plain language, with what they can do to protect themselves.</Notice> : null}
      <Notice>
        The ICO can be told by phone on 0303 123 1113 or through its online breach report form. Report within 72 hours even if you do not have every detail yet; more can follow.
      </Notice>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-6" aria-labelledby="breach-details">
          <h2 id="breach-details" className="mb-4 text-lg font-semibold">Details and decisions</h2>
          <BreachForm
            closed={closed}
            b={{
              id: b.id, description: b.description, occurredAt: localValue(b.occurredAt), dataInvolved: b.dataInvolved, peopleAffected: b.peopleAffected, risk: b.risk, riskReason: b.riskReason,
              icoDecision: b.icoDecision, icoDecisionReason: b.icoDecisionReason, icoReference: b.icoReference, peopleTold: Boolean(b.peopleToldAt), actionsTaken: b.actionsTaken, lessons: b.lessons,
            }}
          />
        </section>
        <aside className="grid content-start gap-6">
          <section className="rounded-lg border border-line bg-panel" aria-labelledby="checklist-heading">
            <h2 id="checklist-heading" className="border-b border-line px-5 py-3 text-sm font-semibold">Checklist</h2>
            <ul className="divide-y divide-line">
              {BREACH_CHECKLIST.map((c) => {
                const done = c.auto ? auto[c.key] : Boolean(state[c.key]?.done);
                return (
                  <li key={c.key} className="flex items-start gap-3 px-5 py-3 text-sm">
                    {c.auto || closed ? (
                      <span aria-hidden="true" className={clsx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold", done ? "bg-green-tint text-green-text" : "bg-panel-sunk text-fg-muted")}>{done ? "✓" : ""}</span>
                    ) : (
                      <form action={toggleBreachCheck}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="key" value={c.key} />
                        <input type="hidden" name="done" value={String(!done)} />
                        <button type="submit" aria-label={`${done ? "Untick" : "Tick"}: ${c.label}`} className={clsx("mt-0.5 grid size-5 place-items-center rounded-full border-2 text-xs font-bold", done ? "border-green-text bg-green-tint text-green-text" : "border-line-strong hover:border-green-text")}>{done ? "✓" : ""}</button>
                      </form>
                    )}
                    <span>
                      {c.label}
                      <span className="sr-only">{done ? " (done)" : " (not done)"}</span>
                      {c.auto ? <span className="block text-xs text-fg-muted">Ticked when recorded in the details.</span> : state[c.key]?.doneAt ? <span className="block text-xs text-fg-muted">Done {formatDateTime(state[c.key]!.doneAt!)}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          {!closed ? (
            <section className="section-plain">
              <h2 className="mb-2 text-sm font-semibold">Close</h2>
              <p className="mb-3 text-xs text-fg-muted">Once the ICO decision and what was done are recorded. The record is kept.</p>
              <CloseBreachForm id={b.id} />
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
