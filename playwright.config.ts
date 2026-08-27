import { defineConfig, devices } from "@playwright/test";

const PORT = 3124;
const isCI = Boolean(process.env.CI);

/**
 * Runs against a production build: the ?mock= scenarios must survive
 * `next build`, and CI has no API keys, so every spec is mock-only.
 * Locally the bundled Chromium is often stale, so prefer the installed
 * Google Chrome; CI installs a fresh Chromium and uses that.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: false,
    channel: isCI ? undefined : "chrome",
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 240_000,
  },
});
