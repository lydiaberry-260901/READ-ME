// Recalculates the health of every deal now, rather than waiting for the 05:30 job.
// Run with: npm run deals:recalculate
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { recalculateOrganisation } from "../src/lib/deals/recalculate";

async function main() {
  const orgs = await prisma.organisation.findMany({ select: { id: true, name: true } });
  for (const o of orgs) console.log(`${o.name}: ${await recalculateOrganisation(o.id)} deals recalculated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
