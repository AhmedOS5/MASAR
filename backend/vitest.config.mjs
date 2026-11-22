import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    env: { NODE_ENV: "test" },
    restoreMocks: true,
    // each test creates and migrates its own database; PostgreSQL (TEST_DATABASE_URL) needs more time than in-memory SQLite
    ...(process.env.TEST_DATABASE_URL ? { testTimeout: 60_000, hookTimeout: 60_000, globalSetup: ["test/pg-cleanup.js"] } : {}),
  },
});
