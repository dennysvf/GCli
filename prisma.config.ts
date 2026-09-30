import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations run with the owner role; the application runs with DATABASE_URL (runtime role).
// The URL is optional here so `prisma generate` works without a database (Docker build);
// migrate commands fail with a clear error when it is missing.
const migrationUrl = process.env.DATABASE_MIGRATION_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
