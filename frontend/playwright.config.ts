import { defineConfig } from "@playwright/test";

const previewUrl = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../.tmp/playwright-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "../.tmp/playwright-report" }],
      ]
    : "list",
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    baseURL: previewUrl,
    colorScheme: "dark",
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "compact",
      use: { viewport: { width: 800, height: 600 } },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
