// Visual summaries shown above the company and contact lists. They follow the current filters.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { chart, chartPalette, colours } from "@/design/tokens";
import { customerGroupLabels } from "@/lib/labels";
import { AnimatedNumber, GrowBar } from "@/components/motion";
import { Ring } from "@/components/visuals";

export async function CompanySummary({ where }: { where: Prisma.CompanyWhereInput }) {
  const [scores, groups, total] = await Promise.all([
    prisma.company.groupBy({ by: ["score"], where, _count: true }),
    prisma.company.groupBy({ by: ["customerGroup"], where, _count: true }),
    prisma.company.count({ where }),
  ]);
  const scoreRows = [5, 4, 3, 2, 1].map((s) => ({ score: s, count: scores.find((x) => x.score === s)?._count ?? 0 }));
  const unscored = scores.find((x) => x.score === null)?._count ?? 0;
  const maxScore = Math.max(1, ...scoreRows.map((r) => r.count));
  const groupRows = [
    ...(["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER"] as const).map((g, i) => ({ label: customerGroupLabels[g], count: groups.find((x) => x.customerGroup === g)?._count ?? 0, colour: chartPalette[i] })),
    { label: "No group", count: groups.find((x) => x.customerGroup === null)?._count ?? 0, colour: colours.fgSoft },
  ];

  return (
    <section aria-label="Summary of these companies" className="mb-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-[12rem_1fr_1.3fr]">
      <div className="bg-panel px-5 py-4">
        <p className="text-xs text-fg-muted">Companies shown</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums"><AnimatedNumber value={total} /></p>
        <p className="mt-1 text-xs text-fg-muted">{unscored} not scored yet</p>
      </div>
      <div className="bg-panel px-5 py-4">
        <p className="mb-2 text-xs text-fg-muted">How well they fit Moca (score)</p>
        <ul className="grid gap-1.5">
          {scoreRows.map((r, i) => (
            <li key={r.score} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="text-fg-muted">{r.score} of 5</span>
              <span className="h-2 overflow-hidden rounded-full bg-canvas-deep" aria-hidden="true">
                <GrowBar pct={(r.count / maxScore) * 100} colour={r.score >= 4 ? chart.good : r.score === 3 ? chart.attention : colours.fgMuted} className="block h-full rounded-full" delayMs={i * 70} />
              </span>
              <span className="text-right tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-panel px-5 py-4">
        <p className="mb-2 text-xs text-fg-muted">Customer groups</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-canvas-deep" aria-hidden="true">
          {groupRows.map((g, i) => (
            <GrowBar key={g.label} pct={total ? (g.count / total) * 100 : 0} colour={g.colour} className="block h-full border-r-2 border-panel last:border-r-0" delayMs={i * 90} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {groupRows.map((g) => (
            <li key={g.label} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: g.colour }} />
              <span className="text-fg-muted">{g.label}</span>
              <span className="ml-auto tabular-nums">{g.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export async function ContactSummary({ where, phoneCheckMaxAgeDays }: { where: Prisma.ContactWhereInput; phoneCheckMaxAgeDays: number }) {
  const now = Date.now();
  const phoneCutoff = new Date(now - phoneCheckMaxAgeDays * 86_400_000);
  const noticeCutoff = new Date(now - 30 * 86_400_000);
  const [total, optedOut, phoneCheck, noticeOverdue, withEmail] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { AND: [where, { optedOut: true }] } }),
    prisma.contact.count({ where: { AND: [where, { optedOut: false, phone: { not: null }, OR: [{ phoneCheckedAt: null }, { phoneCheckedAt: { lt: phoneCutoff } }] }] } }),
    prisma.contact.count({ where: { AND: [where, { optedOut: false, privacyNoticeSentAt: null, collectedAt: { lt: noticeCutoff } }] } }),
    prisma.contact.count({ where: { AND: [where, { optedOut: false, email: { not: null } }] } }),
  ]);
  const ready = Math.max(0, total - optedOut - phoneCheck - noticeOverdue);

  return (
    <section aria-label="Summary of these contacts" className="mb-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-[1.4fr_1fr]">
      <div className="bg-panel px-5 py-4">
        <p className="mb-3 text-xs text-fg-muted">Contact status, following the data protection rules</p>
        <Ring
          centre={<AnimatedNumber value={total} />}
          centreLabel="contacts"
          parts={[
            { label: "Ready to contact", value: ready, colour: colours.greenText },
            { label: "Phone check needed", value: phoneCheck, colour: colours.amber },
            { label: "Privacy notice overdue", value: noticeOverdue, colour: chartPalette[3] },
            { label: "Opted out", value: optedOut, colour: colours.redText },
          ]}
        />
      </div>
      <div className="grid gap-px bg-line">
        <div className="bg-panel px-5 py-4">
          <p className="text-xs text-fg-muted">Can be emailed</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums"><AnimatedNumber value={withEmail} /></p>
          <p className="text-xs text-fg-muted">Have a work email and have not opted out.</p>
        </div>
        <div className="bg-panel px-5 py-4">
          <p className="text-xs text-fg-muted">Opted out</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${optedOut ? "text-red-text" : ""}`}><AnimatedNumber value={optedOut} /></p>
          <p className="text-xs text-fg-muted">Blocked from all contact, for everyone.</p>
        </div>
      </div>
    </section>
  );
}
