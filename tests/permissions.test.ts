import { describe, expect, it } from "vitest";
import { can, canEdit, canView, computeVisibleOwnerIds, visibleWhere, assignableRoles, type Actor } from "@/lib/permissions";

const ORG = "org_1";

const admin: Actor = { id: "admin", organisationId: ORG, role: "ADMIN", visibleOwnerIds: ["admin"] };
const manager: Actor = {
  id: "mgr",
  organisationId: ORG,
  role: "MANAGER",
  visibleOwnerIds: computeVisibleOwnerIds({
    userId: "mgr",
    role: "MANAGER",
    teamMemberIdsOfManagedTeams: ["mgr", "rep1", "rep2"],
    teamMemberIdsOfOwnTeam: [],
  }),
};
const rep1: Actor = {
  id: "rep1",
  organisationId: ORG,
  role: "REP",
  visibleOwnerIds: computeVisibleOwnerIds({
    userId: "rep1",
    role: "REP",
    teamMemberIdsOfManagedTeams: [],
    teamMemberIdsOfOwnTeam: ["mgr", "rep1", "rep2"],
  }),
};

const record = (ownerId: string | null, isShared = false, organisationId = ORG) => ({ ownerId, isShared, organisationId });

describe("who can see a record", () => {
  it("lets reps see only their own records and shared ones", () => {
    expect(canView(rep1, record("rep1"))).toBe(true);
    expect(canView(rep1, record("rep2"))).toBe(false);
    expect(canView(rep1, record("rep2", true))).toBe(true);
    expect(canView(rep1, record(null))).toBe(false);
  });

  it("does not give reps sight of teammates' private records just because they share a team", () => {
    expect(rep1.visibleOwnerIds).toEqual(["rep1"]);
  });

  it("lets managers see their team's records but not other teams'", () => {
    expect(canView(manager, record("rep1"))).toBe(true);
    expect(canView(manager, record("rep2"))).toBe(true);
    expect(canView(manager, record("rep9"))).toBe(false);
    expect(canView(manager, record("rep9", true))).toBe(true);
  });

  it("lets admins see everything in their own organisation", () => {
    expect(canView(admin, record("rep9"))).toBe(true);
    expect(canView(admin, record(null))).toBe(true);
  });

  it("never shows records from another organisation, even shared ones or to admins", () => {
    expect(canView(admin, record("rep1", true, "org_2"))).toBe(false);
    expect(canView(rep1, record("rep1", true, "org_2"))).toBe(false);
  });
});

describe("who can change a record", () => {
  it("lets anyone update shared companies and contacts", () => {
    expect(canEdit(rep1, record("rep2", true), { sharedIsEditable: true })).toBe(true);
  });

  it("stops reps changing someone else's shared deal", () => {
    expect(canEdit(rep1, record("rep2", true), { sharedIsEditable: false })).toBe(false);
  });

  it("lets managers change their team's deals", () => {
    expect(canEdit(manager, record("rep1"), { sharedIsEditable: false })).toBe(true);
  });
});

describe("database filter", () => {
  it("limits admins by organisation only", () => {
    expect(visibleWhere(admin)).toEqual({ organisationId: ORG });
  });

  it("limits reps to their own and shared records", () => {
    expect(visibleWhere(rep1)).toEqual({
      organisationId: ORG,
      OR: [{ isShared: true }, { ownerId: { in: ["rep1"] } }],
    });
  });
});

describe("role permissions", () => {
  it("keeps people management and privacy for admins", () => {
    expect(can(admin, "users.manage")).toBe(true);
    expect(can(manager, "users.manage")).toBe(false);
    expect(can(rep1, "users.manage")).toBe(false);
    expect(can(rep1, "privacy.access")).toBe(false);
  });

  it("gives the named data protection lead the privacy area whatever their role", () => {
    expect(can({ ...rep1, isDataProtectionLead: true }, "privacy.access")).toBe(true);
    expect(can({ ...rep1, isDataProtectionLead: true }, "users.manage")).toBe(false);
  });

  it("lets managers and admins, but not reps, open the pipeline review", () => {
    expect(can(manager, "pipelineReview.view")).toBe(true);
    expect(can(admin, "pipelineReview.view")).toBe(true);
    expect(can(rep1, "pipelineReview.view")).toBe(false);
  });

  it("only lets admins hand out roles", () => {
    expect(assignableRoles(admin)).toEqual(["ADMIN", "MANAGER", "REP"]);
    expect(assignableRoles(manager)).toEqual([]);
  });
});
