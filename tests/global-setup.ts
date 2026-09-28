// Brings the test database up to date with the latest database design before any tests run.
import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL is not set, so database tests will be skipped.");
    return;
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
