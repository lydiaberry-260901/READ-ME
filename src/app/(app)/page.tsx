import Link from "next/link";
import { requireUser } from "@/lib/session";
import { loadHome } from "@/lib/home";
import { getFeed } from "@/lib/feed";
import { getAutomationStatus } from "@/lib/automations";
import { formatLongDate, formatPounds } from "@/lib/format";
import { colours, chartPalette, healthColours } from "@/design/tokens";
import { AnimatedNumber, GrowBar } from "@/components/motion";
import { PulseChart, Ring, Sparkline } from "@/components/visuals";
import { LiveFeed } from "@/components/LiveFeed";
import { HealthFlag } from "@/components/deal-bits";

export const metadata = { title: "Home" };

function Tile({ label, value, trend, trendLabel, colour, foot }: { label: string; value: React.ReactNode; trend: number[]; trendLabel: string; colour: string; foot?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 bg-panel px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-fg-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <Sparkline values={trend} colour={colour} label={trendLabel} />
      </div>
      {foot ? <p className="text-xs text-fg-muted">{foot}</p> : null}
    </div>
  );
}

function Panel({ title, note, action, children, className = "" }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-lg border border-line bg-panel ${className}`} aria-label={title}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {note ? <p className="mt-0.5 text-xs text-fg-muted">{note}</p> : null}
        </div>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  const [home, feed, automations] = await Promise.all([loadHome(user), getFeed(user), getAutomationStatus()]);
  const firstName = (user.name ?? "").split(" ")[0] || "there";
  const change = home.touchesLastWeek ? Math.round(((home.touchesThisWeek - home.touchesLastWeek) / home.touchesLastWeek) * 100) : null;
  const maxStage = Math.max(1, ...home.funnel.map((s) => s.value));
  const workerAgeMin = automations.workerLastSeen ? Math.round((Date.now() - new Date(automations.workerLastSeen).getTime()) / 60_000) : null;
  const workerOnline = workerAgeMin !== null && workerAgeMin <= 30;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-fg-muted">{formatLongDate(new Date())}</p>
          <h1 className="mt-1 text-3xl font-semibold">Good to see you, {firstName}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/deals" className="btn btn-secondary no-underline">Open the deal board</Link>
          <Link href="/analytics" className="btn btn-primary no-underline">See analytics</Link>
        </div>
      </header>

      <section aria-label="Headline figures" className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Open pipeline"
          value={<AnimatedNumber value={home.openValue} format="pounds" />}
          trend={home.trends.newPipeline}
          trendLabel="New pipeline added each week, last 12 weeks"
          colour={chartPalette[0]}
          foot={`${home.openCount} open deals. The line shows new pipeline each week.`}
        />
        <Tile
          label="Won, last 12 weeks"
          value={<AnimatedNumber value={home.wonValue12w} format="pounds" />}
          trend={home.trends.won}
          trendLabel="Value won each week, last 12 weeks"
          colour={colours.greenText}
          foot="The line shows value won each week."
        />
        <Tile
          label="Calls, emails and meetings this week"
          value={<AnimatedNumber value={home.touchesThisWeek} />}
          trend={home.trends.touches}
          trendLabel="Calls, emails and meetings each week, last 12 weeks"
          colour={chartPalette[1]}
          foot={change === null ? "Nothing last week to compare with." : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% ${change >= 0 ? "more" : "fewer"} than last week.`}
        />
        <Tile
          label="New companies, last 12 weeks"
          value={<AnimatedNumber value={home.newCompanies12w} />}
          trend={home.trends.companies}
          trendLabel="Companies added each week, last 12 weeks"
          colour={chartPalette[2]}
          foot={`You have ${home.openTasks} open ${home.openTasks === 1 ? "task" : "tasks"}.`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Activity pulse" note="Calls, emails and meetings each day, last 30 days." className="xl:col-span-2">
          <div className="px-3 pb-2 pt-4">
            <PulseChart data={home.pulse} height={170} />
          </div>
        </Panel>
        <Panel title="Health of open deals" action={user.role === "REP" ? undefined : <Link href="/deals/review" className="text-xs">Review</Link>}>
          <div className="p-5">
            <Ring
              centre={<AnimatedNumber value={home.openCount} />}
              centreLabel="open deals"
              parts={[
                { label: "On track", value: home.health.onTrack, colour: healthColours.ON_TRACK.fill },
                { label: "At risk", value: home.health.atRisk, colour: healthColours.AT_RISK.fill },
                { label: "Stalled", value: home.health.stalled, colour: healthColours.STALLED.fill },
              ]}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Pipeline by stage" note="Open deals and their value." action={<Link href="/deals" className="text-xs">Board</Link>}>
          <ol className="grid gap-3 p-5">
            {home.funnel.map((s, i) => (
              <li key={s.stage} className="grid grid-cols-[7.5rem_1fr_8rem] items-center gap-3 text-sm">
                <span className="truncate">{s.stage}</span>
                <span className="flex h-6 justify-center overflow-hidden rounded bg-canvas-deep" aria-hidden="true">
                  <GrowBar pct={(s.value / maxStage) * 100} colour={s.colour} className="block h-full rounded" delayMs={i * 90} />
                </span>
                <span className="text-right tabular-nums text-fg-muted">
                  {s.deals} {s.deals === 1 ? "deal" : "deals"}, {formatPounds(s.value)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Deals needing attention" note={user.role === "REP" ? "Yours first." : "At risk or stalled, weakest first."} action={<Link href="/deals?health=STALLED" className="text-xs">All stalled</Link>}>
          {home.attention.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-muted">Nothing at risk right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {home.attention.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/deals/${d.id}`} className="block truncate font-medium text-fg no-underline hover:underline">{d.name}</Link>
                    <p className="truncate text-xs text-fg-muted">
                      {d.company}, {d.stage}, {d.quietDays === null ? "no activity yet" : `quiet for ${d.quietDays} days`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <HealthFlag flag={d.flag} score={d.score} />
                    <p className="text-xs tabular-nums text-fg-muted">{formatPounds(d.value)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Live feed" note="What is happening across the CRM. Updates on its own." className="xl:col-span-2">
          <LiveFeed initial={feed} />
        </Panel>
        <Panel title="Automations" action={<Link href="/automations" className="text-xs">Details</Link>}>
          <div className="p-5">
            <p className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className={`size-2 rounded-full ${workerOnline ? "live-dot bg-green-text" : "bg-amber"}`} />
              {workerOnline ? "Background worker running" : "Background worker offline"}
            </p>
            <ul className="mt-4 divide-y divide-line text-sm">
              {automations.queues.map((q) => (
                <li key={q.name} className="flex items-center justify-between gap-3 py-2">
                  <span>{q.label}</span>
                  <span className="text-xs text-fg-muted">{q.running + q.waiting > 0 ? `${q.running + q.waiting} in progress` : q.lastFinished ? "Idle" : "Not run yet"}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
