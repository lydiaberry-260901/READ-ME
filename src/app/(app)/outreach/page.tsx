import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { customerGroupLabels, outreachReasonLabels } from "@/lib/labels";
import { STARTER_EMAILS, STARTER_SCRIPTS } from "@/lib/outreach/starter-library";
import type { CustomerGroup, OutreachReason } from "@/generated/prisma/enums";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { addStarterLibrary } from "./actions";

export const metadata = { title: "Outreach" };

const GROUPS: (CustomerGroup | null)[] = ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", null];

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function OutreachPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const group = one(params.group);
  const reason = one(params.reason);
  const where = {
    organisationId: user.organisationId,
    ...(group === "none" ? { customerGroup: null } : group ? { customerGroup: group as CustomerGroup } : {}),
    ...(reason ? { reason: reason as OutreachReason } : {}),
  };

  const [emails, scripts, draftCount] = await Promise.all([
    prisma.emailTemplate.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { drafts: true } } } }),
    prisma.callScript.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.outreachDraft.count({ where: { organisationId: user.organisationId, userId: user.id, status: { in: ["DRAFT", "READY"] } } }),
  ]);
  const manage = can(user, "templates.manage");
  const allNames = !group && !reason ? new Set([...emails.map((e) => e.name), ...scripts.map((s) => s.name)]) : null;
  const starterMissing = allNames ? [...STARTER_EMAILS, ...STARTER_SCRIPTS].some((s) => !allNames.has(s.name)) : false;

  return (
    <>
      <PageHeader
        title="Outreach"
        description="Email templates and call scripts for each customer group and reason for getting in touch. To write to someone, open their contact page and pick a template there."
        actions={
          <>
            <Link href="/outreach/drafts" className="btn btn-secondary no-underline">My drafts ({draftCount})</Link>
            {manage ? <Link href="/outreach/emails/new" className="btn btn-secondary no-underline">New email template</Link> : null}
            {manage ? <Link href="/outreach/scripts/new" className="btn btn-primary no-underline">New call script</Link> : null}
          </>
        }
      />

      <form method="get" className="mb-8 flex flex-wrap items-end gap-4" role="search" aria-label="Filter the library">
        <div>
          <label htmlFor="o-group" className="label">Customer group</label>
          <select id="o-group" name="group" defaultValue={group} className="field w-auto">
            <option value="">All groups</option>
            {Object.entries(customerGroupLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="none">Any group</option>
          </select>
        </div>
        <div>
          <label htmlFor="o-reason" className="label">Reason for getting in touch</label>
          <select id="o-reason" name="reason" defaultValue={reason} className="field w-auto">
            <option value="">All reasons</option>
            {Object.entries(outreachReasonLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">Show</button>
        {group || reason ? <Link href="/outreach" className="self-center text-sm">Clear</Link> : null}
      </form>

      {manage && starterMissing ? (
        <form action={addStarterLibrary} className="mb-8 flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel-sunk px-4 py-3 text-sm">
          <span>Some of the starter templates and scripts are missing.</span>
          <button type="submit" className="btn btn-secondary py-1.5">Add the starter library</button>
        </form>
      ) : null}

      {emails.length === 0 && scripts.length === 0 ? (
        <EmptyState title="Nothing matches these filters">Try another customer group or reason.</EmptyState>
      ) : null}

      <div className="grid gap-12">
        {GROUPS.map((g) => {
          const groupEmails = emails.filter((e) => e.customerGroup === g);
          const groupScripts = scripts.filter((s) => s.customerGroup === g);
          if (!groupEmails.length && !groupScripts.length) return null;
          return (
            <section key={g ?? "any"} aria-labelledby={`g-${g ?? "any"}`}>
              <h2 id={`g-${g ?? "any"}`} className="border-b-2 border-fg pb-2 text-xl font-semibold">
                {g ? customerGroupLabels[g] : "Any customer group"}
              </h2>
              <div className="mt-5 grid gap-8 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-fg-muted">Email templates</h3>
                  {groupEmails.length === 0 ? <p className="mt-2 text-sm text-fg-muted">None yet.</p> : (
                    <ul className="mt-2 divide-y divide-line">
                      {groupEmails.map((e) => (
                        <li key={e.id} className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/outreach/emails/${e.id}`} className="font-medium text-fg">{e.name}</Link>
                            <Badge>{outreachReasonLabels[e.reason]}</Badge>
                            {!e.active ? <Badge tone="amber">Switched off</Badge> : null}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-fg-muted">{e.subject}</p>
                          <p className="text-xs text-fg-muted">Used in {e._count.drafts} {e._count.drafts === 1 ? "draft" : "drafts"}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-fg-muted">Call scripts</h3>
                  {groupScripts.length === 0 ? <p className="mt-2 text-sm text-fg-muted">None yet.</p> : (
                    <ul className="mt-2 divide-y divide-line">
                      {groupScripts.map((s) => (
                        <li key={s.id} className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/outreach/scripts/${s.id}`} className="font-medium text-fg">{s.name}</Link>
                            <Badge>{outreachReasonLabels[s.reason]}</Badge>
                            {!s.active ? <Badge tone="amber">Switched off</Badge> : null}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{s.opening}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
