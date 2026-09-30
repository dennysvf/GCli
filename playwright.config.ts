import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, e2eEnv } from "./tests/e2e/env";

// E2E runs a production build against the Docker Compose services (docker compose up -d) with a
// dedicated database (gcli_e2e) and port 3101, so local development data and the dev server on
// 3001 are never touched. tests/e2e/global-setup.ts resets the database and starts the worker.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  // No retries: the journeys share database state (an accepted invitation cannot be accepted again),
  // so a retry would fail for a different reason and hide the real one.
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx next start -p 3101",
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: e2eEnv(),
  },
});
