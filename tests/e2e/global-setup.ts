import { execSync, spawn } from "node:child_process";
import { Pool } from "pg";
import { e2eEnv, MAILPIT_URL } from "./env";

// Fresh E2E database, empty mailbox, first administrator invited, and a worker process that
// delivers outbox emails. Returns the teardown that stops the worker.
export const ADMIN = { name: "Ana Administradora", email: "ana.admin@e2e.gcli" };

export default async function globalSetup() {
  const env = e2eEnv();

  const owner = new Pool({ connectionString: env.DATABASE_MIGRATION_URL, max: 1 });
  try {
    await owner.query(`
      DROP SCHEMA IF EXISTS pgboss CASCADE;
      DROP SCHEMA IF EXISTS audit_partitions CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT USAGE ON SCHEMA public TO gcli_app;
    `);
  } finally {
    await owner.end();
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });

  execSync(
    `npx tsx src/scripts/setup-admin.ts --org-name "Clínica E2E" --admin-name "${ADMIN.name}" --admin-email ${ADMIN.email}`,
    { stdio: "inherit", env },
  );

  const worker = spawn("npx", ["tsx", "src/worker/index.ts"], {
    env: { ...env, GCLI_PROCESS: "worker" },
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });

  // tsx runs the worker in a child process, so the whole process tree must be stopped;
  // otherwise the worker outlives the run and keeps polling the next run's database.
  return async () => {
    if (!worker.pid) return;
    if (process.platform === "win32") execSync(`taskkill /pid ${worker.pid} /T /F`, { stdio: "ignore" });
    else process.kill(-worker.pid, "SIGTERM");
  };
}
