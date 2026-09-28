import { beforeEach, describe, expect, it, vi } from "vitest";
import { csvLine, csvStream, safeCell, toCsv } from "@/lib/csv";

describe("CSV safety", () => {
  it("stops spreadsheet formula tricks by prefixing risky cells", () => {
    expect(safeCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
    expect(safeCell("+44 1632 960100")).toBe("'+44 1632 960100");
    expect(safeCell("-5")).toBe("'-5");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("\tcmd")).toBe("'\tcmd");
  });

  it("leaves ordinary values alone and quotes commas, quotes and new lines", () => {
    expect(safeCell("Harbourline")).toBe("Harbourline");
    expect(safeCell(48000)).toBe("48000");
    expect(safeCell("Leeds, Yorkshire")).toBe('"Leeds, Yorkshire"');
    expect(safeCell('Say "hello"')).toBe('"Say ""hello"""');
    expect(safeCell("two\nlines")).toBe('"two\nlines"');
    expect(safeCell(null)).toBe("");
  });

  it("builds a file Excel opens as UTF-8, with Windows line endings", () => {
    const csv = toCsv(["Name", "Value (£)"], [["A", 1]]);
    expect(csv.startsWith("﻿Name,Value (£)\r\n")).toBe(true);
    expect(csvLine(["a", "b"])).toBe("a,b\r\n");
  });

  it("streams large lists page by page", async () => {
    const pages = [[["a"]], [["b"]], []];
    const stream = csvStream(["H"], async (p) => pages[p] ?? []);
    // Decode the raw bytes keeping the byte order mark, which .text() would silently drop.
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe("﻿H\r\na\r\nb\r\n");
  });
});

// Downloads follow each person's access rights, and are recorded in the audit log.
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import type { LoadedActor } from "@/lib/actor";

let currentUser: LoadedActor | null = null;
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => currentUser }));

describe.skipIf(!hasTestDb)("CSV downloads and access rights", () => {
  let rep: LoadedActor;
  let admin: LoadedActor;

  beforeEach(async () => {
    await resetTestDb();
    const org = await createOrganisation(testDb, "Moca");
    const [r, r2, a] = await Promise.all([
      testDb.user.create({ data: { email: "rep@example.com", name: "Rep", organisationId: org.id, role: "REP" } }),
      testDb.user.create({ data: { email: "rep2@example.com", name: "Rep Two", organisationId: org.id, role: "REP" } }),
      testDb.user.create({ data: { email: "admin@example.com", name: "Admin", organisationId: org.id, role: "ADMIN" } }),
    ]);
    const base = { organisationId: org.id, organisationName: "Moca", image: null, teamId: null };
    rep = { ...base, id: r.id, role: "REP", name: "Rep", email: r.email, visibleOwnerIds: [r.id] };
    admin = { ...base, id: a.id, role: "ADMIN", name: "Admin", email: a.email, visibleOwnerIds: [a.id] };
    await testDb.company.createMany({
      data: [
        { organisationId: org.id, name: "Mine private", ownerId: r.id, isShared: false },
        { organisationId: org.id, name: "Theirs private", ownerId: r2.id, isShared: false },
        { organisationId: org.id, name: "=Shared formula", ownerId: r2.id, isShared: true },
      ],
    });
  });

  async function download(kind: string, who: LoadedActor | null) {
    currentUser = who;
    const { GET } = await import("@/app/api/export/[kind]/route");
    return GET(new Request(`http://localhost/api/export/${kind}`), { params: Promise.resolve({ kind }) });
  }

  it("gives a rep only their own and shared companies, with risky cells made safe", async () => {
    const text = await (await download("companies", rep)).text();
    expect(text).toContain("Mine private");
    expect(text).toContain("'=Shared formula");
    expect(text).not.toContain("Theirs private");
  });

  it("gives an admin everything", async () => {
    const text = await (await download("companies", admin)).text();
    expect(text).toContain("Theirs private");
  });

  it("refuses people who are not signed in", async () => {
    expect((await download("companies", null)).status).toBe(401);
  });

  it("records who downloaded what", async () => {
    await (await download("companies", rep)).text();
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "export.companies" } });
    expect(log.userId).toBe(rep.id);
  });
});
