import type { PackageProps } from "../domain/package";
import type { SessionPackage } from "../domain/package";

// Shapes the screens and Server Actions receive (dates as "YYYY-MM-DD" or ISO strings).
export type PackageView = {
  id: string;
  name: string;
  serviceId: string;
  serviceName: string;
  patientId: string;
  totalSessions: number;
  usedSessions: number;
  forfeitedSessions: number;
  freeSessions: number;
  remainingSessions: number;
  soldOn: string;
  expiresOn: string;
  status: PackageProps["status"];
  unitId: string;
  currency: string;
  priceMinor: number;
  chargeId: string;
  chargeStatus: string | null;
  closeReason: string | null;
  version: number;
};

export type PackageLinkView = {
  id: string;
  appointmentId: string;
  status: string;
  flagged: boolean;
  startsAt: string | null;
  professionalName: string | null;
  appointmentStatus: string | null;
  unitTimeZone: string | null;
  session: number | null;
};

export type PackageCard = PackageView & { links: PackageLinkView[] };

export function packageView(
  pkg: SessionPackage | Readonly<PackageProps>,
  extra: { serviceName: string; chargeStatus: string | null },
): PackageView {
  const s: Readonly<PackageProps> = "snapshot" in pkg ? pkg.snapshot : pkg;
  const remaining = s.totalSessions - s.usedSessions - s.forfeitedSessions;
  return {
    id: s.id,
    name: s.name,
    serviceId: s.serviceId,
    serviceName: extra.serviceName,
    patientId: s.patientId,
    totalSessions: s.totalSessions,
    usedSessions: s.usedSessions,
    forfeitedSessions: s.forfeitedSessions,
    freeSessions: remaining - s.openLinks,
    remainingSessions: remaining,
    soldOn: s.soldOn,
    expiresOn: s.expiresOn,
    status: s.status,
    unitId: s.unitId,
    currency: s.currency,
    priceMinor: s.priceMinor,
    chargeId: s.chargeId,
    chargeStatus: extra.chargeStatus,
    closeReason: s.closeReason,
    version: s.version,
  };
}
