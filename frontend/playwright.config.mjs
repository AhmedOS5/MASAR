import { defineConfig } from "@playwright/test";

const PORT = process.env.E2E_APP_PORT || "3100";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1, // one shared in-memory mock backend
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ar",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
