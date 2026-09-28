import Link from "next/link";
import clsx from "clsx";
import { formatDate } from "@/lib/format";
import { newsTypeLabels } from "@/lib/labels";
import { setNewsStatus } from "@/app/(app)/news/actions";
import type { NewsStatus, NewsType } from "@/generated/prisma/enums";

export type NewsRow = {
  id: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: Date | null;
  createdAt: Date;
  summary: string | null;
  openingLine: string | null;
  newsType: NewsType | null;
  relevance: number | null;
  status: NewsStatus;
  aiModel: string | null;
  company?: { id: string; name: string };
};

const statusLabels: Record<NewsStatus, string> = { NEW: "New", READ: "Read", ACTED_ON: "Acted on" };

/** Relevance as five rising bars, with the number written beside them. */
export function RelevanceBars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-fg-muted">Not reviewed yet</span>;
  const fill = value >= 4 ? "bg-green-text" : value === 3 ? "bg-amber" : "bg-fg-muted";
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Relevance ${value} out of 5`} title={`Relevance ${value} out of 5`}>
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={clsx("w-1 rounded-sm", n <= value ? fill : "bg-line-strong/60")} style={{ height: 4 + n * 2.5 }} />
        ))}
      </span>
      <span aria-hidden="true" className="text-xs tabular-nums text-fg-muted">{value}/5</span>
    </span>
  );
}

function StatusButton({ id, status, label }: { id: string; status: NewsStatus; label: string }) {
  return (
    <form action={setNewsStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="rounded border border-line px-2 py-1 text-xs text-fg-muted hover:border-line-strong hover:text-fg">{label}</button>
    </form>
  );
}

export function NewsList({ items, showCompany = false }: { items: NewsRow[]; showCompany?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.id} className={clsx("grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto]", n.status !== "NEW" && "opacity-75")}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
              {n.status === "NEW" ? <span className="inline-flex items-center gap-1 font-medium text-green-text"><span aria-hidden="true" className="size-1.5 rounded-full bg-green-text" />New</span> : <span>{statusLabels[n.status]}</span>}
              {showCompany && n.company ? <Link href={`/companies/${n.company.id}`} className="font-medium text-fg">{n.company.name}</Link> : null}
              <span>{n.source}</span>
              <span className="tabular-nums">{formatDate(n.publishedAt ?? n.createdAt)}</span>
              {n.newsType ? <span className="rounded border border-line px-1.5 py-0.5">{newsTypeLabels[n.newsType]}</span> : null}
              <RelevanceBars value={n.relevance} />
            </div>
            <p className="mt-1.5 font-medium">
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-fg">{n.headline}</a>
            </p>
            {n.summary ? <p className="mt-1 text-sm text-fg-muted">{n.summary}</p> : null}
            {n.openingLine ? (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-green-text">Suggested opening line (a draft to check)</summary>
                <p className="mt-2 rounded-md border border-line bg-canvas-deep p-3 text-fg-muted">{n.openingLine}</p>
              </details>
            ) : null}
            {n.aiModel ? <p className="mt-1 text-[11px] text-fg-muted">Summary written by {n.aiModel} from the headline and the news service&apos;s short description only.</p> : null}
          </div>
          <div className="flex flex-wrap items-start gap-1 lg:justify-end">
            {n.status !== "READ" ? <StatusButton id={n.id} status="READ" label="Mark as read" /> : null}
            {n.status !== "ACTED_ON" ? <StatusButton id={n.id} status="ACTED_ON" label="Acted on" /> : null}
            {n.status !== "NEW" ? <StatusButton id={n.id} status="NEW" label="Mark as new" /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
