// Access rules. Pure functions with no database calls, so they are easy to test.
//
// Reps see their own records and shared ones.
// Managers see their own records, their team's records and shared ones.
// Admins see everything in their organisation.

import type { Role } from "@/generated/prisma/enums";

export type Actor = {
  id: string;
  organisationId: string;
  role: Role;
  // Owners whose private records this person may see. Always includes the person themself.
  // For managers this also includes everyone in the teams they manage or belong to.
  visibleOwnerIds: string[];
  isDataProtectionLead?: boolean;
};

export type OwnedRecord = {
  organisationId: string;
  ownerId: string | null;
  isShared: boolean;
};

export type Capability =
  | "users.manage" // invite people, change roles and teams
  | "settings.manage" // organisation settings, deal stages, task rules
  | "battlecards.edit"
  | "templates.manage" // create and edit the outreach library
  | "pipelineReview.view"
  | "dashboards.viewTeam"
  | "alerts.view"
  | "jobs.run"
  | "privacy.access"
  | "audit.view";

const capabilitiesByRole: Record<Role, readonly Capability[]> = {
  ADMIN: [
    "users.manage",
    "settings.manage",
    "battlecards.edit",
    "templates.manage",
    "pipelineReview.view",
    "dashboards.viewTeam",
    "alerts.view",
    "jobs.run",
    "privacy.access",
    "audit.view",
  ],
  MANAGER: ["templates.manage", "pipelineReview.view", "dashboards.viewTeam"],
  REP: [],
};

export function can(actor: Pick<Actor, "role" | "isDataProtectionLead">, capability: Capability): boolean {
  if (capability === "privacy.access" && actor.isDataProtectionLead) return true;
  return capabilitiesByRole[actor.role].includes(capability);
}

export function isAdmin(actor: Pick<Actor, "role">): boolean {
  return actor.role === "ADMIN";
}

/** Can this person see the record at all? */
export function canView(actor: Actor, record: OwnedRecord): boolean {
  if (record.organisationId !== actor.organisationId) return false;
  if (actor.role === "ADMIN") return true;
  if (record.isShared) return true;
  return record.ownerId !== null && actor.visibleOwnerIds.includes(record.ownerId);
}

/**
 * Can this person change the record?
 * Shared companies and contacts form a common prospect database that anyone can update.
 * Deals can only be changed by their owner, the owner's manager, or an admin.
 */
export function canEdit(actor: Actor, record: OwnedRecord, opts: { sharedIsEditable: boolean }): boolean {
  if (!canView(actor, record)) return false;
  if (actor.role === "ADMIN") return true;
  if (record.ownerId !== null && actor.visibleOwnerIds.includes(record.ownerId)) return true;
  return opts.sharedIsEditable && record.isShared;
}

/** Database filter matching exactly the records `canView` allows. Use it in every list query. */
export function visibleWhere(actor: Actor) {
  if (actor.role === "ADMIN") return { organisationId: actor.organisationId };
  return {
    organisationId: actor.organisationId,
    OR: [{ isShared: true }, { ownerId: { in: actor.visibleOwnerIds } }],
  };
}

/** Which owners' records a person can see, given the teams they manage and belong to. */
export function computeVisibleOwnerIds(input: {
  userId: string;
  role: Role;
  teamMemberIdsOfManagedTeams: string[];
  teamMemberIdsOfOwnTeam: string[];
}): string[] {
  const ids = new Set<string>([input.userId]);
  if (input.role === "MANAGER" || input.role === "ADMIN") {
    for (const id of input.teamMemberIdsOfManagedTeams) ids.add(id);
    for (const id of input.teamMemberIdsOfOwnTeam) ids.add(id);
  }
  return [...ids];
}

/** Roles that a person is allowed to hand out when inviting or editing users. */
export function assignableRoles(actor: Pick<Actor, "role">): Role[] {
  return actor.role === "ADMIN" ? ["ADMIN", "MANAGER", "REP"] : [];
}
