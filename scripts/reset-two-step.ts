// Resets two step sign in for one person, for example the only admin after losing their phone.
// Run on the server: npm run twostep:reset -- someone@moca.energy
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { resetTwoStep } from "../src/lib/two-step";
import { normaliseEmail } from "../src/lib/crypto";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Give the person's email address, for example: npm run twostep:reset -- someone@moca.energy");
  const user = await prisma.user.findUnique({ where: { email: normaliseEmail(email) } });
  if (!user) throw new Error(`Nobody with the email address ${email} was found.`);
  await resetTwoStep(user.id);
  if (user.organisationId) {
    await prisma.auditLog.create({ data: { organisationId: user.organisationId, userId: null, action: "two_step.reset", entityType: "User", entityId: user.id, details: { by: "server command" } } });
  }
  console.log(`Two step sign in reset for ${user.email}. They set it up again at their next sign in.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
