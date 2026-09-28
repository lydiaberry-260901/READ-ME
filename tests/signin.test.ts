// Who may sign in, and how new people join the organisation. Uses the test database.
import { beforeEach, describe, expect, it } from "vitest";
import { testDb, resetTestDb, hasTestDb } from "./helpers/db";
import { attachUserToOrganisation, createOrganisation, decideSignIn, DEFAULT_STAGES } from "@/lib/organisation";

describe.skipIf(!hasTestDb)("sign in and invitations", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lets the very first person in and makes them an admin of a new organisation with the default stages", async () => {
    expect(await decideSignIn(testDb, "first@example.com")).toEqual({ allowed: true, reason: "first_user" });

    const user = await testDb.user.create({ data: { email: "first@example.com", name: "First Person" } });
    const updated = await attachUserToOrganisation(testDb, user.id);

    expect(updated?.role).toBe("ADMIN");
    expect(updated?.organisationId).toBeTruthy();
    const stages = await testDb.stage.findMany({ orderBy: { position: "asc" } });
    expect(stages.map((s) => s.name)).toEqual(DEFAULT_STAGES.map((s) => s.name));
    expect(await testDb.auditLog.count({ where: { action: "organisation.created" } })).toBe(1);
  });

  it("turns away people without an invitation once an organisation exists", async () => {
    await createOrganisation(testDb, "Moca");
    expect(await decideSignIn(testDb, "stranger@example.com")).toEqual({ allowed: false, reason: "not_invited" });
  });

  it("lets invited people join with the role and team from their invitation, whatever the capitals in their email", async () => {
    const org = await createOrganisation(testDb, "Moca");
    const admin = await testDb.user.create({ data: { email: "admin@example.com", organisationId: org.id, role: "ADMIN" } });
    const team = await testDb.team.create({ data: { organisationId: org.id, name: "Occupiers" } });
    await testDb.invitation.create({
      data: {
        organisationId: org.id, email: "new.rep@example.com", role: "MANAGER", teamId: team.id,
        token: "t1", invitedById: admin.id, expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    expect((await decideSignIn(testDb, "New.Rep@Example.com")).allowed).toBe(true);
    const user = await testDb.user.create({ data: { email: "new.rep@example.com" } });
    const joined = await attachUserToOrganisation(testDb, user.id);

    expect(joined?.organisationId).toBe(org.id);
    expect(joined?.role).toBe("MANAGER");
    expect(joined?.teamId).toBe(team.id);
    const invite = await testDb.invitation.findUniqueOrThrow({ where: { token: "t1" } });
    expect(invite.acceptedAt).not.toBeNull();
  });

  it("ignores expired and cancelled invitations", async () => {
    const org = await createOrganisation(testDb, "Moca");
    const admin = await testDb.user.create({ data: { email: "admin@example.com", organisationId: org.id, role: "ADMIN" } });
    await testDb.invitation.create({
      data: { organisationId: org.id, email: "late@example.com", token: "t2", invitedById: admin.id, expiresAt: new Date(Date.now() - 1000) },
    });
    await testDb.invitation.create({
      data: {
        organisationId: org.id, email: "cancelled@example.com", token: "t3", invitedById: admin.id,
        expiresAt: new Date(Date.now() + 86_400_000), revokedAt: new Date(),
      },
    });
    expect((await decideSignIn(testDb, "late@example.com")).allowed).toBe(false);
    expect((await decideSignIn(testDb, "cancelled@example.com")).allowed).toBe(false);
  });

  it("blocks people whose access has been switched off", async () => {
    const org = await createOrganisation(testDb, "Moca");
    await testDb.user.create({ data: { email: "left@example.com", organisationId: org.id, active: false } });
    expect(await decideSignIn(testDb, "left@example.com")).toEqual({ allowed: false, reason: "inactive" });
  });
});
