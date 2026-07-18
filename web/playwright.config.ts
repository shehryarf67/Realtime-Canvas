import { defineConfig, devices } from "@playwright/test";

// E2E runs the whole stack on isolated ports so it never collides with the
// normal dev servers (3000 web / 4000 api) or touches a real database:
//   - API: server/scripts/e2e-server.ts on :4100 (in-memory MongoDB)
//   - Web: next dev on :3100, pointed at the test API
const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // One worker against one shared backend keeps realtime/DB state deterministic.
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
        // Overrides .env.local (real env vars take precedence in Next), so the
        // web app talks to the isolated test API rather than the dev backend.
        NEXT_PUBLIC_SERVER_URL: API_ORIGIN,
      },
    },
  ],
});
