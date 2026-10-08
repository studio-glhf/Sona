import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "sona-browser-"));
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-results.json" }],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4318",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      executablePath:
        process.env.SONA_CHROMIUM_PATH ||
        (process.platform === "linux" ? "/usr/bin/chromium" : undefined),
    },
  },
  projects: [
    {
      name: "chromium-local",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1024 },
      },
    },
  ],
  webServer: {
    command: "node dist/server.mjs",
    url: "http://127.0.0.1:4318/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SONA_PORT: "4318",
      SONA_DATA_DIR: dataDir,
      OPENAI_API_KEY: "",
      OPENAI_ADMIN_KEY: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_CALENDAR_ID: "",
      NODE_ENV: "test",
    },
  },
});
