import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.FINANZAS_REVIEW_URL ?? "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
  },
  reporter: "list",
  outputDir: "test-results",
});
