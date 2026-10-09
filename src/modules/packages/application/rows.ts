import type { PackageProps, PackageStatus } from "../domain/package";

// A patient_package row as the aggregate props (dates as "YYYY-MM-DD").
export function toPackageProps(
  row: {
    id: string;
    organizationId: string;
    patientId: string;
    templateId: string;
    name: string;
    serviceId: string;
    totalSessions: number;
    usedSessions: number;
    forfeitedSessions: number;
    unitId: string;
    currency: string;
    priceMinor: bigint;
    soldOn: Date;
    validityDays: number;
    extendedDays: number;
    expiresOn: Date;
    status: string;
    chargeId: string;
    soldById: string;
    closedAt: Date | null;
    closedById: string | null;
    closeReason: string | null;
    version: number;
  },
  openLinks: number,
): PackageProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    patientId: row.patientId,
    templateId: row.templateId,
    name: row.name,
    serviceId: row.serviceId,
    totalSessions: row.totalSessions,
    usedSessions: row.usedSessions,
    forfeitedSessions: row.forfeitedSessions,
    unitId: row.unitId,
    currency: row.currency,
    priceMinor: Number(row.priceMinor),
    soldOn: row.soldOn.toISOString().slice(0, 10),
    validityDays: row.validityDays,
    extendedDays: row.extendedDays,
    expiresOn: row.expiresOn.toISOString().slice(0, 10),
    status: row.status as PackageStatus,
    chargeId: row.chargeId,
    soldById: row.soldById,
    closedAt: row.closedAt,
    closedById: row.closedById,
    closeReason: row.closeReason,
    openLinks,
    version: row.version,
  };
}
