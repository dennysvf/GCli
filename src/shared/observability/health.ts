import { db } from "@/shared/db/client";
import { objectStorage } from "@/shared/storage/object-storage";

// Health check for the load balancer and uptime monitoring (spec F01 section 5). Reports only
// ok/error per dependency: no versions, hostnames, or error details.
export type HealthReport = {
  status: "ok" | "degraded";
  checks: { database: "ok" | "error"; storage: "ok" | "error" };
};

async function check(probe: () => Promise<unknown>): Promise<"ok" | "error"> {
  try {
    await probe();
    return "ok";
  } catch {
    return "error";
  }
}

export async function healthReport(): Promise<HealthReport> {
  const [database, storage] = await Promise.all([
    check(() => db().$queryRaw`SELECT 1`),
    check(() => objectStorage().ping()),
  ]);
  return { status: database === "ok" && storage === "ok" ? "ok" : "degraded", checks: { database, storage } };
}
