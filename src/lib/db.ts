// One shared database client for the web app and the worker.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Reuse the client during development so hot reloads do not open new connections each time.
export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { createClient };
export type { PrismaClient };
