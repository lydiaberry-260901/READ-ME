import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { visibleWhere } from "@/lib/permissions";
import { formatLongDate, formatPounds } from "@/lib/format";
import { roleDescriptions } from "@/lib/labels";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const user = await requireUser();
  const where = visibleWhere(user);

  const [companyCount, contactCount, openDeals, stages] = await Promise.all([
    prisma.company.count({ where }),
    prisma.contact.count({ where }),
    prisma.deal.findMany({
      where: { ...where, stage: { kind: "OPEN" } },
      select: { value: true, stageId: true },
    }),
    prisma.stage.findMany({
      where: { pipeline: { organisationId: user.organisationId, isDefault: true }, archived: false },
      orderBy: { position: "asc" },
    }),
  ]);

  const pipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);
  const byStage = stages
    .filter((s) => s.kind === "OPEN")
    .map((s) => {
      const deals = openDeals.filter((d) => d.stageId === s.id);
      return { ...s, count: deals.length, value: deals.reduce((sum, d) => sum + d.value, 0) };
    });
  const maxValue = Math.max(1, ...byStage.map((s) => s.value));
  const firstName = (user.name ?? "").split(" ")[0] || "there";

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        description={
          <>
            {formatLongDate(new Date())}. {roleDescriptions[user.role]}
          </>
        }
      />

      <section aria-label="What you can see" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Companies" value={companyCount} />
        <StatCard label="Contacts" value={contactCount} />
        <StatCard label="Open deals" value={openDeals.length} />
        <StatCard label="Open pipeline value" value={formatPounds(pipelineValue)} />
      </section>

      <section className="card mt-8 p-6">
        <h2 className="text-lg font-semibold">Open deals by stage</h2>
        <p className="text-sm text-fg-muted">Only deals you are allowed to see are counted.</p>
        {openDeals.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="No open deals yet">Deals will appear here once they are added.</EmptyState>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {byStage.map((s) => (
              <li key={s.id} className="grid grid-cols-[8rem_1fr_auto] items-center gap-4 text-sm sm:grid-cols-[10rem_1fr_9rem]">
                <span className="font-medium">{s.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-panel-sunk" aria-hidden="true">
                  <span className="block h-full rounded-full bg-green-text" style={{ width: `${(s.value / maxValue) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-fg-muted">
                  {s.count} {s.count === 1 ? "deal" : "deals"}, {formatPounds(s.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
