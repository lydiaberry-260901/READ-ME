"use client";

import { useActionState } from "react";
import { inviteUser, updateUser, createTeam, type ActionResult } from "./actions";
import { Notice } from "@/components/ui";

type Option = { id: string; name: string };
type RoleOption = { value: string; label: string };

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <div className="mt-3">
      <Notice tone={state.ok ? "green" : "red"}>
        {state.message}
        {state.link ? (
          <input
            readOnly
            value={state.link}
            aria-label="Invitation link"
            onFocus={(e) => e.currentTarget.select()}
            className="field mt-2 font-mono text-xs"
          />
        ) : null}
      </Notice>
    </div>
  );
}

export function InviteForm({ roles, teams }: { roles: RoleOption[]; teams: Option[] }) {
  const [state, action, pending] = useActionState(inviteUser, null);
  return (
    <form action={action}>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="invite-email" className="label">Work email</label>
          <input id="invite-email" name="email" type="email" required className="field" placeholder="name@moca.energy" />
        </div>
        <div>
          <label htmlFor="invite-role" className="label">Role</label>
          <select id="invite-role" name="role" className="field" defaultValue="REP">
            {roles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="invite-team" className="label">Team</label>
          <select id="invite-team" name="teamId" className="field" defaultValue="">
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating" : "Create invitation"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function UserRowForm({
  user,
  roles,
  teams,
}: {
  user: { id: string; role: string; teamId: string | null; active: boolean };
  roles: RoleOption[];
  teams: Option[];
}) {
  const [state, action, pending] = useActionState(updateUser, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={user.id} />
      <select name="role" aria-label="Role" className="field w-auto py-1.5" defaultValue={user.role}>
        {roles.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <select name="teamId" aria-label="Team" className="field w-auto py-1.5" defaultValue={user.teamId ?? ""}>
        <option value="">No team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <select name="active" aria-label="Access" className="field w-auto py-1.5" defaultValue={String(user.active)}>
        <option value="true">Active</option>
        <option value="false">Switched off</option>
      </select>
      <button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>
        {pending ? "Saving" : "Save"}
      </button>
      {state ? (
        <span role="status" className={state.ok ? "text-sm text-green-text" : "text-sm text-red-text"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function TeamForm({ managers }: { managers: Option[] }) {
  const [state, action, pending] = useActionState(createTeam, null);
  return (
    <form action={action}>
      <div className="grid gap-4 sm:grid-cols-[2fr_2fr_auto] sm:items-end">
        <div>
          <label htmlFor="team-name" className="label">Team name</label>
          <input id="team-name" name="name" required className="field" placeholder="For example, Property managers" />
        </div>
        <div>
          <label htmlFor="team-manager" className="label">Manager</label>
          <select id="team-manager" name="managerId" className="field" defaultValue="">
            <option value="">No manager yet</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating" : "Create team"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}
