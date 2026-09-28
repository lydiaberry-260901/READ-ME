import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { visibleWhere } from "@/lib/permissions";
import { formatDate, formatPounds } from "@/lib/format";
import { wholeDays } from "@/lib/deals/health";
import { HealthFlag, QualificationMeter } from "@/components/deal-bits";
import { AnimatedNumber } from "@/components/motion";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Pipeline review" };

const WEAK_QUALIFICATION = 50;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function Flag({ on, children }: { on: boolean; children: React.ReactNode }) {
  if (!on) return null;
  return <span className="inline-flex items-center gap-1 rounded border border-amber/50 bg-amber-tint px-1.5 py-0.5 text-xs text-amber-text">{children}</span>;
}

export default async function PipelineReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireCapability("pipelineReview.view");
  const p = await searchParams;
  const teamId = one(p.team);
  const person = one(p.person);
  const now = new Date();

  const [teams, people] = await Promise.all([
    prisma.team.findMany({ where: { organisationId: user.organisationId, ...(user.role === "ADMIN" ? {} : { OR: [{ managerId: user.id }, { id: user.teamId ?? "" }] }) }, include: { members: { select: { id: true } } }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organisationId: user.organisationId, active: true, ...(user.role === "ADMIN" ? {} : { id: { in: user.visibleOwnerIds } }) }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const team = teams.find((t) => t.id === teamId);
  const ownerFilter = person ? [person] : team ? team.members.map((m) => m.id) : null;

  const deals = await prisma.deal.findMany({
    where: { AND: [visibleWhere(user), { stage: { kind: "OPEN" } }, ...(ownerFilter ? [{ ownerId: { in: ownerFilter } }] : [])] },
    include: { company: { select: { name: true } }, owner: { select: { name: true } }, stage: { select: { name: true, noActivityDays: true } }, organisation: { select: { singleThreadedDays: true } } },
  });

  const rows = deals
    .map((d) => {
      const quiet = wholeDays(d.lastActivityAt, now);
      const singleDays = wholeDays(d.singleThreadedSince, now);
      return {
        d,
        quiet,
        weak: d.qualificationPct < WEAK_QUALIFICATION,
        single: singleDays !== null && singleDays > d.organisation.singleThreadedDays,
        noActivity: quiet === null || quiet > d.stage.noActivityDays,
        overdue: d.expectedCloseDate !== null && d.expectedCloseDate < now,
      };
    })
    .sort((a, b) => (a.d.healthScore ?? 0) - (b.d.healthScore ?? 0) || b.d.value - a.d.value);

  const value = rows.reduce((s, r) => s + r.d.value, 0);
  const needsAttention = rows.filter((r) => r.weak || r.single || r.noActivity || r.overdue).length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm"><Link href="/deals">Deals</Link></p>
          <h1 className="mt-1 text-2xl font-semibold">Pipeline review</h1>
          <p className="mt-1 text-sm text-fg-muted">For weekly pipeline meetings. Every open deal, weakest health first.</p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label htmlFor="r-team" className="sr-only">Team</label>
          <select id="r-team" name="team" defaultValue={teamId} className="field w-auto py-1.5">
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label htmlFor="r-person" className="sr-only">Person</label>
          <select id="r-person" name="person" defaultValue={person} className="field w-auto py-1.5">
            <option value="">Everyone</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
          </select>
          <button type="submit" className="btn btn-secondary py-1.5">Show</button>
          <a href={`/api/export/deals?view=list${person ? `&owner=${person}` : ""}`} className="btn btn-secondary py-1.5 no-underline">Download CSV</a>
        </form>
      </div>

      <section aria-label="Review figures" className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Open deals</p><p className="mt-1 text-2xl font-semibold"><AnimatedNumber value={rows.length} /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Open value</p><p className="mt-1 text-2xl font-semibold"><AnimatedNumber value={value} format="pounds" /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Need attention</p><p className="mt-1 text-2xl font-semibold text-amber-text"><AnimatedNumber value={needsAttention} /></p></div>
        <div className="bg-panel px-5 py-4"><p className="text-xs text-fg-muted">Single threaded</p><p className="mt-1 text-2xl font-semibold"><AnimatedNumber value={rows.filter((r) => r.single).length} /></p></div>
      </section>

      {rows.length === 0 ? (
        <EmptyState title="No open deals for this selection" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-panel-sunk text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Health</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Deal</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Owner</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Stage</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Value</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Qualification</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Last activity</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Needs attention</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-panel">
              {rows.map(({ d, quiet, weak, single, noActivity, overdue }) => (
                <tr key={d.id} className="align-top hover:bg-panel-raised">
                  <td className="px-4 py-3"><HealthFlag flag={d.healthFlag} score={d.healthScore} /></td>
                  <td className="px-3 py-3">
                    <Link href={`/deals/${d.id}`} className="font-medium text-fg">{d.name}</Link>
                    <p className="text-xs text-fg-muted">{d.company.name}</p>
                  </td>
                  <td className="px-3 py-3">{d.owner.name}</td>
                  <td className="px-3 py-3">{d.stage.name}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatPounds(d.value)}</td>
                  <td className="px-3 py-3"><QualificationMeter pct={d.qualificationPct} /></td>
                  <td className="px-3 py-3 tabular-nums">{quiet === null ? "Never" : `${quiet} days ago`}</td>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap gap-1">
                      <Flag on={weak}>Weak qualification</Flag>
                      <Flag on={single}>Single threaded</Flag>
                      <Flag on={noActivity}>No recent activity</Flag>
                      <Flag on={overdue}>Close date passed {formatDate(d.expectedCloseDate)}</Flag>
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-fg-muted">{d.nextStep ?? "None set"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
