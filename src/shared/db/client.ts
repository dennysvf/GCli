import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/shared/config/env";

// Unscoped client. Application code uses forTenant() from ./tenant instead; ESLint restricts
// direct imports of this file to infrastructure code.
const globalForPrisma = globalThis as unknown as { gcliPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.gcliPrisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalForPrisma.gcliPrisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.gcliPrisma;
}

export type Db = PrismaClient;
