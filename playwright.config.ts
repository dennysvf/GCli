import { defineConfig, devices } from "@playwright/test";

// E2E runs against the Docker Compose services (docker compose up -d) using a dedicated
// database, so local development data is never touched. See tests/e2e/global-setup.ts.
const E2E_DATABASE = "gcli_e2e";
const e2eEnv = {
  DATABASE_URL: `postgresql://gcli_app:gcli_app@localhost:5432/${E2E_DATABASE}`,
  DATABASE_MIGRATION_URL: `postgresql://gcli_owner:gcli_owner@localhost:5432/${E2E_DATABASE}`,
  APP_URL: "http://localhost:3001",
  S3_BUCKET: "gcli-local",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3001",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start -- -p 3001" : "npm run dev",
    url: "http://localhost:3001/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: e2eEnv,
  },
});

export { e2eEnv };
