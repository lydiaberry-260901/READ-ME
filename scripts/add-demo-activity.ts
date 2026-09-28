// Adds the fictional demo activity history to an existing demo database, without wiping it.
// Development only. Run with: npm run db:demo-activity
import "dotenv/config";
import { createClient } from "../src/lib/db";
import { addDemoActivity } from "../prisma/demo-activity";
import { recalculateOrganisation } from "../src/lib/deals/recalculate";

const prisma = createClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo data must never be added to the live database.");
  for (const org of await prisma.organisation.findMany()) {
    const r = await addDemoActivity(prisma, org.id);
    await recalculateOrganisation(org.id);
    console.log(r.skipped ? `${org.name}: demo activity already present.` : `${org.name}: added ${r.activities} fictional activities and closed deals.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
