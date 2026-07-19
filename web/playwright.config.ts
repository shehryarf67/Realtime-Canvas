import { defineConfig, devices } from "@playwright/test";

// E2E uses ports 3100/4100 and an in-memory DB, separate from normal dev work.
const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // One worker keeps the shared test server and realtime state predictable.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "npm --prefix ../server run e2e:server",
      url: `${API_ORIGIN}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        E2E_SERVER_PORT: String(API_PORT),
        E2E_CLIENT_ORIGIN: WEB_ORIGIN,
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT}`,
      url: WEB_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Point this Next process at the isolated test API, not the dev API.
        NEXT_PUBLIC_SERVER_URL: API_ORIGIN,
      },
    },
  ],
});
