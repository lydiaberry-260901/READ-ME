import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assignableRoles } from "@/lib/permissions";
import { roleLabels } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import { InviteForm, UserRowForm, TeamForm } from "./forms";
import { resetTwoStepAction, revokeInvitation } from "./actions";

export const metadata = { title: "People and teams" };

export default async function UsersPage() {
  const me = await requireCapability("users.manage");

  const [users, teams, invitations, dpLeadId] = await Promise.all([
    prisma.user.findMany({
      where: { organisationId: me.organisationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { team: { select: { name: true } } },
    }),
    prisma.team.findMany({
      where: { organisationId: me.organisationId },
      orderBy: { name: "asc" },
      include: { manager: { select: { name: true } }, _count: { select: { members: true } } },
    }),
    prisma.invitation.findMany({
      where: { organisationId: me.organisationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organisation.findUniqueOrThrow({ where: { id: me.organisationId }, select: { dataProtectionLeadId: true } }).then((o) => o.dataProtectionLeadId),
  ]);

  const roles = assignableRoles(me).map((r) => ({ value: r, label: roleLabels[r] }));
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));
  const managerOptions = users
    .filter((u) => u.active && u.role !== "REP")
    .map((u) => ({ id: u.id, name: u.name ?? u.email }));

  return (
    <>
      <PageHeader
        title="People and teams"
        description="Invite people, set their role and team, and switch off access for anyone who leaves. Changes take effect straight away."
      />

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Invite someone</h2>
        <p className="mb-5 text-sm text-fg-muted">
          They must sign in with a Google or Microsoft work account using this exact address. Links last 14 days.
        </p>
        <InviteForm roles={roles} teams={teamOptions} />

        {invitations.length > 0 ? (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-sm font-semibold">Waiting to be accepted</h3>
            <ul className="mt-3 divide-y divide-line">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{inv.email}</span>
                    <span className="text-fg-muted">, {roleLabels[inv.role]}, until {formatDate(inv.expiresAt)}</span>
                  </span>
                  <form action={revokeInvitation}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button type="submit" className="text-sm font-medium text-red-text underline-offset-4 hover:underline">
                      Cancel invitation
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="card mt-8 overflow-hidden">
        <div className="p-6 pb-4">
          <h2 className="text-lg font-semibold">People</h2>
          <p className="text-sm text-fg-muted">
            Admins see everything. Managers see their team's records. Reps see their own records and shared ones.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-y border-line bg-panel-sunk text-fg-muted">
              <tr>
                <th scope="col" className="px-6 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Last signed in</th>
                <th scope="col" className="px-6 py-2.5 font-medium">Role, team and access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? undefined : "bg-panel-sunk"}>
                  <td className="px-6 py-3 align-top">
                    <p className="font-medium">
                      {u.name ?? "No name yet"} {u.id === me.id ? <Badge>You</Badge> : null}{" "}
                      {!u.active ? <Badge tone="red">Switched off</Badge> : null}
                    </p>
                    <p className="text-fg-muted">{u.email}</p>
                  </td>
                  <td className="px-3 py-3 align-top text-fg-muted">
                    {formatDateTime(u.lastSignInAt, "Never")}
                    <span className="mt-1 block text-xs">
                      {u.twoStepEnabledAt ? (
                        <>
                          <span className="text-green-text">Two step sign in on</span>
                          {u.id !== me.id ? (
                            <form action={resetTwoStepAction} className="inline">
                              <input type="hidden" name="userId" value={u.id} />
                              <button type="submit" className="ml-2 underline" title="For a lost phone: they set it up again at their next sign in">Reset</button>
                            </form>
                          ) : null}
                        </>
                      ) : u.role === "ADMIN" || u.id === dpLeadId ? (
                        <span className="text-amber-text">Two step sign in set up at next sign in</span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-6 py-3 align-top">
                    <UserRowForm user={{ id: u.id, role: u.role, teamId: u.teamId, active: u.active }} roles={roles} teams={teamOptions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mt-8 p-6">
        <h2 className="text-lg font-semibold">Teams</h2>
        <p className="mb-5 text-sm text-fg-muted">A manager sees the records of everyone in the teams they manage.</p>
        {teams.length > 0 ? (
          <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <li key={t.id} className="rounded-md border border-line bg-panel-sunk px-4 py-3">
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-fg-muted">
                  {t.manager?.name ? `Managed by ${t.manager.name}` : "No manager"}, {t._count.members}{" "}
                  {t._count.members === 1 ? "person" : "people"}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <TeamForm managers={managerOptions} />
      </section>
    </>
  );
}
