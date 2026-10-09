import { packages } from "@/modules/packages";
import { db } from "@/shared/db/client";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";

// PRD F10: packages past their last day expire once a day at 00:10 in each organization's time zone.
// The job runs every 15 minutes, handles the organizations whose local clock is past 00:10, and the
// expiration itself remembers the days it already ran.
const RUN_AFTER_MINUTE = 10;

export async function expirePackagesJob(now = new Date()): Promise<number> {
  const organizations = await db().organization.findMany({ select: { id: true, timeZone: true } });
  let expired = 0;
  for (const organization of organizations) {
    if (utcToZonedParts(now, organization.timeZone).minute < RUN_AFTER_MINUTE) continue;
    const result = await packages.expirePackages({
      organizationId: organization.id,
      timeZone: organization.timeZone,
      now,
    });
    if (result.ok) expired += result.value.expired;
  }
  return expired;
}
