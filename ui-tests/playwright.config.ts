import { defineConfig, devices } from "@playwright/test";

const FRONTEND = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const BACKEND = process.env.PLAYWRIGHT_BACKEND ?? "http://127.0.0.1:4000";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: FRONTEND,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../backend",
      url: `${BACKEND}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      cwd: "../frontend",
      url: FRONTEND,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
