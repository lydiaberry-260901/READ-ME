// Builds today's task lists now, exactly as the 07:00 job does. Safe to run again: nothing is duplicated.
// Run with: npm run tasks:daily
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runDailyTasks } from "../src/lib/tasks/daily";

runDailyTasks()
  .then((r) => console.log(`Task lists built for ${r.people} people: ${r.created} new tasks.`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
