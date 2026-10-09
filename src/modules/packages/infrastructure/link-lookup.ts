import type { PackageLinkLookup, PackageLinkState } from "@/modules/scheduling";
import { forTenant } from "@/shared/db/tenant";

// The package mark of the agenda (PRD F10): "Sessão 4/10" counts the debited sessions and the open
// links of a package in the order of the appointments, and a flagged link shows "Pacote expirado".
export const packageLinkLookup: PackageLinkLookup = {
  async linkStates(organizationId, appointmentIds) {
    const result = new Map<string, PackageLinkState>();
    if (appointmentIds.length === 0) return result;
    const tenant = forTenant(organizationId);
    const mine = await tenant.packageAppointment.findMany({
      where: {
        appointmentId: { in: appointmentIds },
        OR: [{ status: { in: ["LINKED", "DEBITED"] } }, { flagged: true }],
      },
      select: { appointmentId: true, packageId: true, status: true, flagged: true },
    });
    if (mine.length === 0) return result;

    const packageIds = [...new Set(mine.map((link) => link.packageId))];
    const [packages, live] = await Promise.all([
      tenant.patientPackage.findMany({
        where: { id: { in: packageIds } },
        select: { id: true, totalSessions: true },
      }),
      tenant.packageAppointment.findMany({
        where: { packageId: { in: packageIds }, status: { in: ["LINKED", "DEBITED"] } },
        select: { packageId: true, appointmentId: true },
      }),
    ]);
    const starts = await tenant.appointment.findMany({
      where: { id: { in: live.map((link) => link.appointmentId) } },
      select: { id: true, startsAt: true },
    });
    const startOf = new Map(starts.map((item) => [item.id, item.startsAt.getTime()]));
    const total = new Map(packages.map((item) => [item.id, item.totalSessions]));
    const order = new Map<string, number>();
    for (const packageId of packageIds) {
      const sorted = live
        .filter((link) => link.packageId === packageId)
        .sort((a, b) => (startOf.get(a.appointmentId) ?? 0) - (startOf.get(b.appointmentId) ?? 0));
      sorted.forEach((link, index) => order.set(link.appointmentId, index + 1));
    }
    for (const link of mine) {
      const isLive = link.status === "LINKED" || link.status === "DEBITED";
      result.set(link.appointmentId, {
        packageId: link.packageId,
        session: isLive ? (order.get(link.appointmentId) ?? 0) : 0,
        total: total.get(link.packageId) ?? 0,
        flagged: link.flagged,
      });
    }
    return result;
  },
};
