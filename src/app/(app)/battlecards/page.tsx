import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Battlecards" };

export default async function BattlecardsPage() {
  const user = await requireUser();
  const cards = await prisma.battlecard.findMany({ where: { organisationId: user.organisationId }, orderBy: { competitorName: "asc" }, include: { updatedBy: { select: { name: true } } } });
  const counts = await prisma.deal.groupBy({ by: ["competitor"], where: { organisationId: user.organisationId, competitor: { not: null }, closedAt: null }, _count: true });
  const openDeals = (name: string) => counts.filter((c) => c.competitor?.trim().toLowerCase() === name.toLowerCase()).reduce((s, c) => s + c._count, 0);
  return (
    <>
      <PageHeader
        title="Battlecards"
        description="One page per competitor: how we compare, what prospects say, and how to respond. A deal that names a competitor shows its card automatically."
        actions={can(user, "battlecards.edit") ? <Link href="/battlecards/new" className="btn btn-primary no-underline">New battlecard</Link> : null}
      />
      {cards.length === 0 ? (
        <EmptyState title="No battlecards yet" />
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
          {cards.map((c) => (
            <li key={c.id} className="bg-panel p-5">
              <Link href={`/battlecards/${c.id}`} className="text-lg font-semibold text-fg">{c.competitorName}</Link>
              <p className="mt-2 line-clamp-3 text-sm text-fg-muted">{c.comparison}</p>
              <p className="mt-3 text-xs text-fg-muted">
                {((c.objections as unknown[]) ?? []).length} objections. Named in {openDeals(c.competitorName)} open deals. Updated {formatDate(c.updatedAt)}
                {c.updatedBy?.name ? ` by ${c.updatedBy.name}` : ""}.
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
