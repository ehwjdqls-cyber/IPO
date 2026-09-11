import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * S01-S05 flows hit a real Supabase Auth project (there is no local/mock
 * auth backend), so this suite needs real credentials -- copy .env.example
 * to .env.local with a "test" Supabase project's values (see root
 * .env.example for the full var list `next start` needs). In that test
 * project's Auth settings, disable "Confirm email", or signup can't
 * complete without a human clicking the confirmation link.
 */
export default defineConfig({
  testDir: path.resolve(__dirname, "../../tests/e2e"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
