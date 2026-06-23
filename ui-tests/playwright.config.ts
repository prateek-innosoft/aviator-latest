import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const isCI = !!process.env.CI;
const isVisual = !!process.env.VISUAL;
const isSlowOnly = !!process.env.SLOW_ONLY;
const isFull = !!process.env.FULL;

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: "./results",
  globalSetup: "./global-setup.ts",
  reporter: [
    ["list"],
    ["html", { outputFolder: "report", open: "never" }],
    ["json", { outputFile: "results/summary.json" }],
  ],
  use: {
    baseURL: process.env.UI_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "on",
    video: "retain-on-failure",
    actionTimeout: 30_000,
  },
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: "npm run dev",
          cwd: path.join(ROOT, "backend"),
          url: "http://localhost:4000/api/health",
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
        {
          command: "npm run dev",
          cwd: path.join(ROOT, "frontend"),
          url: "http://localhost:5173",
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      ],
  grep: isSlowOnly ? /@slow/ : undefined,
  grepInvert: isVisual ? undefined : isFull ? /@visual/ : /@visual|@slow/,
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
