// Adds any missing starter email templates and call scripts to every organisation.
// Safe to run more than once. Run with: npm run outreach:starter
import "dotenv/config";
import { createClient } from "../src/lib/db";
import { installStarterLibrary } from "../src/lib/outreach/starter-library";

const prisma = createClient();

async function main() {
  const orgs = await prisma.organisation.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    const added = await installStarterLibrary(prisma, org.id);
    console.log(`${org.name}: added ${added.emails} email templates and ${added.scripts} call scripts.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
