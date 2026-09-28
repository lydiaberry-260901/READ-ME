import Link from "next/link";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { deleteView } from "@/app/(app)/views/actions";
import { SaveViewForm } from "./SaveViewForm";

/** Saved sets of filters for a list page: the person's own views and ones shared by others. */
export async function SavedViews({ user, entity, currentQuery }: { user: CurrentUser; entity: "companies" | "contacts"; currentQuery: string }) {
  const views = await prisma.savedView.findMany({
    where: { organisationId: user.organisationId, entity, OR: [{ userId: user.id }, { isShared: true }] },
    orderBy: { name: "asc" },
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-mocha-muted">Saved views:</span>
      <Link href={`/${entity}`} className={`rounded-full border px-3 py-1 no-underline ${currentQuery === "" ? "border-green bg-green-tint text-green-ink" : "border-stone bg-surface text-mocha"}`}>
        All
      </Link>
      {views.map((v) => (
        <span key={v.id} className={`inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 ${currentQuery === v.query ? "border-green bg-green-tint" : "border-stone bg-surface"}`}>
          <Link href={`/${entity}${v.query}`} className={`no-underline ${currentQuery === v.query ? "text-green-ink" : "text-mocha"}`}>
            {v.name}
            {v.userId !== user.id ? <span className="text-mocha-muted">, from {v.user.name}</span> : null}
          </Link>
          {v.userId === user.id || user.role === "ADMIN" ? (
            <form action={deleteView}>
              <input type="hidden" name="id" value={v.id} />
              <button type="submit" className="rounded-full px-1.5 text-mocha-muted hover:text-red-ink" aria-label={`Delete view ${v.name}`}>
                ×
              </button>
            </form>
          ) : (
            <span className="w-1" />
          )}
        </span>
      ))}
      {currentQuery ? <SaveViewForm entity={entity} query={currentQuery} /> : null}
    </div>
  );
}
