import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

// Environment for the E2E web server, worker and fixtures: the local .env (or .env.example in CI)
// with the database and URL switched to the E2E instance.
export const E2E_BASE_URL = "http://localhost:3101";
export const MAILPIT_URL = "http://localhost:8025";

export function e2eEnv(): NodeJS.ProcessEnv & Record<string, string> {
  const file = existsSync(".env") ? ".env" : ".env.example";
  const base = parse(readFileSync(file));
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return {
    ...inherited,
    ...base,
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://gcli_app:gcli_app@localhost:5432/gcli_e2e",
    DATABASE_MIGRATION_URL: "postgresql://gcli_owner:gcli_owner@localhost:5432/gcli_e2e",
    APP_URL: E2E_BASE_URL,
    BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET?.length
      ? base.BETTER_AUTH_SECRET
      : "e2e-secret-with-more-than-32-characters",
    LOG_LEVEL: "warn",
  };
}
