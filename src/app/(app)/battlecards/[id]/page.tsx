import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { BattlecardForm } from "../BattlecardForm";

type Objection = { objection: string; response: string };

export default async function BattlecardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const card = await prisma.battlecard.findFirst({ where: { id, organisationId: user.organisationId } });
  if (!card) notFound();
  const objections = (card.objections as Objection[]) ?? [];
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/battlecards">Battlecards</Link> <span className="text-fg-muted">/ {card.competitorName}</span></p>
      <h1 className="mb-6 text-3xl font-semibold">{card.competitorName}</h1>
      {can(user, "battlecards.edit") ? (
        <BattlecardForm card={{ id: card.id, competitorName: card.competitorName, comparison: card.comparison, objections }} />
      ) : (
        <div className="max-w-3xl">
          <p className="leading-relaxed">{card.comparison}</p>
          <ul className="mt-6 space-y-4">
            {objections.map((o) => (
              <li key={o.objection} className="border-l-2 border-amber pl-4">
                <p className="font-medium">{o.objection}</p>
                <p className="mt-1 text-fg-muted">{o.response}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
