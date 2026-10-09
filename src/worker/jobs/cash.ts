import { cash } from "@/modules/cash";
import { db } from "@/shared/db/client";

// PRD F11 jobs. Each runs for every organization; the use cases decide per unit and per day what is
// left to do, so a retry or a second run finds nothing.

async function forEachOrganization(run: (organizationId: string) => Promise<number>): Promise<number> {
  const organizations = await db().organization.findMany({ select: { id: true } });
  let total = 0;
  for (const organization of organizations) total += await run(organization.id);
  return total;
}

// Open registers of earlier days are flagged "Não fechado" after 00:05 of each unit's local day.
export function flagUnclosedRegistersJob(now = new Date()): Promise<number> {
  return forEachOrganization(async (organizationId) => {
    const result = await cash.flagUnclosedRegisters({ organizationId, now });
    return result.ok ? result.value.flagged : 0;
  });
}

// Monthly series keep 12 future occurrences until a manager ends them.
export function extendRecurrencesJob(now = new Date()): Promise<number> {
  return forEachOrganization(async (organizationId) => {
    const result = await cash.extendRecurrences({ organizationId, now });
    return result.ok ? result.value.created : 0;
  });
}

// Receipts that no movement or entry claimed within a day are removed.
export function cleanupFinanceUploadsJob(now = new Date()): Promise<number> {
  return forEachOrganization(async (organizationId) => {
    const result = await cash.cleanupUploads({ organizationId, now });
    return result.ok ? result.value.removed : 0;
  });
}
