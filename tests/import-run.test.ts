// Runs the real import against the test database, using the sample CSV file.
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { beforeEach, describe, expect, it } from "vitest";
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { guessMapping } from "@/lib/import/fields";
import { runImport } from "@/lib/import/run";
import { suppressionHash } from "@/lib/crypto";
import type { Actor } from "@/lib/permissions";

const csv = readFileSync("public/samples/moca-import-sample.csv", "utf8");
const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy" });

describe.skipIf(!hasTestDb)("importing the sample CSV file", () => {
  let actor: Actor;

  beforeEach(async () => {
    await resetTestDb();
    const org = await createOrganisation(testDb, "Moca");
    const user = await testDb.user.create({ data: { email: "rep@example.com", organisationId: org.id, role: "REP" } });
    actor = { id: user.id, organisationId: org.id, role: "REP", visibleOwnerIds: [user.id] };
    // An existing company, and someone who opted out earlier.
    await testDb.company.create({ data: { organisationId: org.id, name: "Harbourline Real Estate Partners", domain: "harbourline-demo.example" } });
    await testDb.suppression.create({ data: { organisationId: org.id, emailHash: suppressionHash("rachel.obi@thornbury-demo.example"), reason: "Opted out" } });
  });

  const settings = () => ({
    fileName: "moca-import-sample.csv",
    source: "Test import",
    collectedAt: new Date("2026-09-01"),
    lawfulBasis: "LEGITIMATE_INTERESTS" as const,
    defaultEntityType: "LIMITED_COMPANY" as const,
    defaultCustomerGroup: null,
    ownerId: actor.id,
    isShared: true,
    duplicateContacts: "skip" as const,
  });

  it("creates each company once, links existing ones, and skips duplicates, opt outs and personal emails", async () => {
    const { counts, report } = await runImport(actor, parsed.data, guessMapping(parsed.meta.fields ?? []), settings());

    // Ashdown, Thornbury, Linden, Beacon and Corrie are new. Harbourline already existed.
    expect(counts.companiesCreated).toBe(5);
    expect(counts.companiesMatched).toBe(1);
    // Priya, Mark, Omar and Nina are created. Omar's repeat, Rachel (opted out) and Sam (Gmail) are skipped.
    expect(counts.contactsCreated).toBe(4);
    expect(counts.skipped).toBe(3);
    expect(await testDb.company.count()).toBe(6);

    const priya = await testDb.contact.findFirstOrThrow({ where: { emailNormalised: "priya.nair@ashdown-demo.example" } });
    expect(priya).toMatchObject({ source: "Test import", lawfulBasis: "LEGITIMATE_INTERESTS", entityType: "LIMITED_COMPANY", ownerId: actor.id });
    expect(priya.collectedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");

    expect(await testDb.contact.count({ where: { emailNormalised: "rachel.obi@thornbury-demo.example" } })).toBe(0);
    expect(report.find((l) => l.row === 3)?.notes.join(" ")).toMatch(/asked not to be contacted/);

    const ashdown = await testDb.company.findFirstOrThrow({ where: { domain: "ashdown-demo.example" }, include: { tags: { include: { tag: true } }, contacts: true } });
    expect(ashdown.contacts).toHaveLength(2);
    expect(ashdown.tags.map((t) => t.tag.name).sort()).toEqual(["EPC risk", "Q4 targets"]);

    expect(await testDb.importRun.count()).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "import.completed" } })).toBe(1);
  });

  it("running the same file twice creates nothing new", async () => {
    const mapping = guessMapping(parsed.meta.fields ?? []);
    await runImport(actor, parsed.data, mapping, settings());
    const second = await runImport(actor, parsed.data, mapping, settings());
    expect(second.counts.companiesCreated).toBe(0);
    expect(second.counts.contactsCreated).toBe(0);
    expect(await testDb.company.count()).toBe(6);
  });
});
