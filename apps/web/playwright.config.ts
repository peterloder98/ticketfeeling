import { defineConfig, devices } from "@playwright/test";

/**
 * CI-friendly HTTP smoke — no auth, no Stripe live keys.
 * Point at a running app via BASE_URL, or let Playwright start `next start`
 * when PLAYWRIGHT_WEB_SERVER=1 (needs build + DATABASE_URL).
 */
const baseURL = process.env.BASE_URL?.trim() || "http://127.0.0.1:3000";
const startWebServer = process.env.PLAYWRIGHT_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(startWebServer
    ? {
        webServer: {
          command: "npm run start",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
