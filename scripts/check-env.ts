// Checks the server's settings. Run before starting the live site: npm run check:env
// Exits with an error if anything must be fixed first.
import "dotenv/config";
import { checkEnvironment } from "../src/lib/env-check";

const { problems, warnings } = checkEnvironment(process.env);
for (const w of warnings) console.log(`Check: ${w}`);
for (const p of problems) console.error(`Must fix: ${p}`);
if (problems.length) {
  console.error(`\n${problems.length} ${problems.length === 1 ? "setting needs" : "settings need"} fixing before the CRM can start.`);
  process.exit(1);
}
console.log(`\nSettings look right${warnings.length ? `, with ${warnings.length} things to check` : ""}.`);
