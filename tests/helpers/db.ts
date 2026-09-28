// Test database helpers. Only ever points at TEST_DATABASE_URL.
import { createClient } from "@/lib/db";

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

export const testDb = hasTestDb ? createClient(process.env.TEST_DATABASE_URL) : (null as never);

/** Empties every table in the test database. */
export async function resetTestDb() {
  const url = process.env.TEST_DATABASE_URL ?? "";
  if (!url.includes("_test")) throw new Error("Refusing to wipe a database whose name does not end in _test.");
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
