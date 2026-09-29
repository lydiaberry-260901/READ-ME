import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Database tests share one test database, so run files one at a time.
    fileParallelism: false,
    // A stuck test fails with a clear message instead of hanging the whole run.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
