// Log of important changes, and of who viewed or downloaded personal data.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function audit(entry: {
  organisationId: string;
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({ data: entry });
}
