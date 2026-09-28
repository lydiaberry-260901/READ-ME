import Link from "next/link";
import clsx from "clsx";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { callOutcomeLabels } from "@/lib/labels";
import { formatDate, formatTime } from "@/lib/format";
import { transcriptWhere } from "@/lib/transcripts/access";
import type { Prisma } from "@/generated/prisma/client";
import type { CallOutcome } from "@/generated/prisma/enums";
import { AnimatedNumber } from "@/components/motion";
import { Badge, EmptyState, Notice } from "@/components/ui";
import { Pagination } from "@/components/Pagination";
import { OutcomeChart } from "./OutcomeChart";

export const metadata = { title: "Calls" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PAGE_SIZE = 25;
const VIEWS = {
  all: "All calls",
  review: "Suggestions to review",
  link: "Not linked yet",
  notice: "Recording notice missing",
  problem: "Not read yet or failed",
} as const;
type View = keyof typeof VIEWS;

const statusText = { PENDING: "Waiting to be read", PROCESSING: "Being read", DONE: "Read", FAILED: "Could not be read" } as const;

export default async function TranscriptsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const p = await searchParams;
  const view = (one(p.view) in VIEWS ? one(p.view) : "all") as View;
  const outcome = one(p.outcome) in callOutcomeLabels ? (one(p.outcome) as CallOutcome) : null;
  const page = Math.max(1, Number(one(p.page)) || 1);
  const base = transcriptWhere(user);

  const viewWhere: Record<View, Prisma.CallTranscriptWhereInput> = {
    all: {},
    review: { suggestions: { some: { status: "PENDING" } } },
    link: { matchStatus: "NEEDS_MATCHING" },
    notice: { OR: [{ recordingNoticeGiven: null }, { recordingNoticeGiven: false }] },
    problem: { processingStatus: { in: ["PENDING", "FAILED"] } },
  };
  const where: Prisma.CallTranscriptWhereInput = { AND: [base, viewWhere[view], ...(outcome ? [{ outcome }] : [])] };
  const since = new Date(Date.now() - 90 * 86_400_000);

  const [items, total, counts, outcomes] = await Promise.all([
    prisma.callTranscript.findMany({
      where,
      select: {
        id: true, title: true, callAt: true, createdAt: true, source: true, outcome: true, summary: true, processingStatus: true, matchStatus: true, recordingNoticeGiven: true,
        contact: { select: { id: true, firstName: true, lastName: true } }, deal: { select: { id: true, name: true } }, company: { select: { name: true } },
        _count: { select: { suggestions: { where: { status: "PENDING" } } } },
      },
      orderBy: [{ callAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.callTranscript.count({ where }),
    Promise.all((Object.keys(VIEWS) as View[]).map((v) => prisma.callTranscript.count({ where: { AND: [base, viewWhere[v]] } }))),
    prisma.callTranscript.groupBy({ by: ["outcome"], where: { AND: [base, { processedAt: { gte: since } }] }, _count: { _all: true } }),
  ]);
  const count = Object.fromEntries((Object.keys(VIEWS) as View[]).map((v, i) => [v, counts[i]])) as Record<View, number>;
  const outcomeRows = (Object.keys(callOutcomeLabels) as CallOutcome[]).map((o) => ({ outcome: callOutcomeLabels[o], calls: outcomes.find((x) => x.outcome === o)?._count._all ?? 0 }));

  const href = (changes: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    const entries: Record<string, string | number | null> = { view: view === "all" ? null : view, outcome, ...changes };
    for (const [k, v] of Object.entries(entries)) if (v !== null && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/transcripts?${s}` : "/transcripts";
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Calls</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Call transcripts, pasted, uploaded or sent in by a call recording tool. The AI reads each one and suggests follow ups and deal changes. A person approves every change.
          </p>
        </div>
        <Link href="/transcripts/new" className="btn btn-primary py-1.5 no-underline">Add a call</Link>
      </header>
      {one(p.deleted) ? <Notice tone="green">The transcript was deleted.</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <section aria-label="Calls at a glance" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
          {(["review", "link", "notice", "problem"] as View[]).map((v) => (
            <Link key={v} href={href({ view: v, page: null })} className={clsx("bg-panel px-5 py-4 no-underline hover:bg-panel-raised", view === v && "bg-panel-raised")}>
              <p className="text-xs text-fg-muted">{VIEWS[v]}</p>
              <p className={clsx("mt-1 text-3xl font-semibold", count[v] > 0 && v !== "review" ? "text-amber-text" : count[v] > 0 ? "text-green-text" : "text-fg")}><AnimatedNumber value={count[v]} /></p>
            </Link>
          ))}
        </section>
        <OutcomeChart rows={outcomeRows} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-panel px-5 py-4">
        <div>
          <label htmlFor="tr-view" className="label">Show</label>
          <select id="tr-view" name="view" defaultValue={view} className="field py-1.5">
            {(Object.keys(VIEWS) as View[]).map((v) => <option key={v} value={v}>{VIEWS[v]} ({count[v]})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="tr-outcome" className="label">Outcome</label>
          <select id="tr-outcome" name="outcome" defaultValue={outcome ?? ""} className="field py-1.5">
            <option value="">Any</option>
            {(Object.keys(callOutcomeLabels) as CallOutcome[]).map((o) => <option key={o} value={o}>{callOutcomeLabels[o]}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary py-1.5">Show</button>
        <Link href="/transcripts" className="text-sm text-fg-muted">Clear</Link>
      </form>

      {items.length === 0 ? (
        <EmptyState title="No calls here">Add a call, or connect a call recording tool under Call recording tools in the account menu.</EmptyState>
      ) : (
        <section className="rounded-lg border border-line bg-panel" aria-label="Calls">
          <ul className="divide-y divide-line">
            {items.map((t) => {
              const at = t.callAt ?? t.createdAt;
              return (
                <li key={t.id} className="grid gap-2 px-5 py-4 lg:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                      <span className="tabular-nums">{formatDate(at)} {formatTime(at)}</span>
                      <span>{t.source === "WEBHOOK" ? "From a recording tool" : t.source === "UPLOAD" ? "Uploaded" : "Pasted"}</span>
                      {t.contact ? <span>{t.contact.firstName} {t.contact.lastName}</span> : null}
                      {t.company ? <span>{t.company.name}</span> : null}
                      {t.deal ? <span>Deal: {t.deal.name}</span> : null}
                    </div>
                    <p className="mt-1 font-medium"><Link href={`/transcripts/${t.id}`} className="text-fg">{t.title ?? "Call transcript"}</Link></p>
                    {t.summary ? <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{t.summary}</p> : <p className="mt-1 text-sm text-fg-muted">{statusText[t.processingStatus]}</p>}
                  </div>
                  <div className="flex flex-wrap items-start gap-1.5 lg:justify-end">
                    {t.outcome ? <Badge tone={t.outcome === "MEETING_BOOKED" || t.outcome === "INTERESTED" ? "green" : t.outcome === "NOT_INTERESTED" ? "red" : "neutral"}>{callOutcomeLabels[t.outcome]}</Badge> : null}
                    {t._count.suggestions ? <Badge tone="green">{t._count.suggestions} to review</Badge> : null}
                    {t.matchStatus === "NEEDS_MATCHING" ? <Badge tone="amber">Not linked</Badge> : null}
                    {t.recordingNoticeGiven !== true ? <Badge tone="amber">Recording notice {t.recordingNoticeGiven === false ? "not given" : "not recorded"}</Badge> : null}
                    {t.processingStatus === "FAILED" ? <Badge tone="red">Could not be read</Badge> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(n) => href({ page: n > 1 ? n : null })} />
    </div>
  );
}
