import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Migrations run with the owner role; the application runs with DATABASE_URL (runtime role).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_MIGRATION_URL") },
});
