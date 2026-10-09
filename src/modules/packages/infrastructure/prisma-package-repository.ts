import type { UnitOfWork } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { SessionPackage, type PackageProps, type PackageStatus } from "../domain/package";
import type { LinkRecord, LinkStatus, PackageRepository } from "../application/ports";

const LIVE: LinkStatus[] = ["LINKED", "DEBITED"];
const day = (date: Date): string => date.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

type PackageRow = {
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
};

function toPackage(row: PackageRow, openLinks: number): SessionPackage {
  const props: PackageProps = {
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
    soldOn: day(row.soldOn),
    validityDays: row.validityDays,
    extendedDays: row.extendedDays,
    expiresOn: day(row.expiresOn),
    status: row.status as PackageStatus,
    chargeId: row.chargeId,
    soldById: row.soldById,
    closedAt: row.closedAt,
    closedById: row.closedById,
    closeReason: row.closeReason,
    openLinks,
    version: row.version,
  };
  return SessionPackage.rehydrate(props);
}

function toLink(row: {
  id: string;
  packageId: string;
  appointmentId: string;
  status: string;
  flagged: boolean;
  linkedAt: Date;
  debitedAt: Date | null;
  closedAt: Date | null;
}): LinkRecord {
  return { ...row, status: row.status as LinkStatus };
}

async function lock(uow: UnitOfWork, packageId: string) {
  // The id is unique; the scoped read that follows keeps other organizations out.
  await uow.tx.$queryRaw`SELECT id FROM patient_package WHERE id = ${packageId}::uuid FOR UPDATE`;
}

async function load(uow: UnitOfWork, packageId: string): Promise<SessionPackage | null> {
  const row = await uow.tx.patientPackage.findFirst({ where: { id: packageId } });
  if (!row) return null;
  const open = await uow.tx.packageAppointment.count({ where: { packageId, status: "LINKED" } });
  return toPackage(row, open);
}

export const prismaPackageRepository: PackageRepository = {
  async findById(uow, packageId, options) {
    if (options.lock) await lock(uow, packageId);
    return load(uow, packageId);
  },

  async findByAppointment(uow, appointmentId, options) {
    const link = await uow.tx.packageAppointment.findFirst({
      where: { appointmentId, status: { in: LIVE } },
    });
    if (!link) return null;
    if (options.lock) await lock(uow, link.packageId);
    const pkg = await load(uow, link.packageId);
    // The link may have changed while waiting for the lock.
    const fresh = options.lock ? await uow.tx.packageAppointment.findFirst({ where: { id: link.id } }) : link;
    return pkg && fresh ? { pkg, link: toLink(fresh) } : null;
  },

  async insert(uow, pkg) {
    const s = pkg.snapshot;
    await uow.tx.patientPackage.create({
      data: {
        id: s.id,
        organizationId: s.organizationId,
        patientId: s.patientId,
        templateId: s.templateId,
        name: s.name,
        serviceId: s.serviceId,
        totalSessions: s.totalSessions,
        usedSessions: 0,
        forfeitedSessions: 0,
        unitId: s.unitId,
        currency: s.currency,
        priceMinor: BigInt(s.priceMinor),
        soldOn: asDate(s.soldOn),
        validityDays: s.validityDays,
        extendedDays: 0,
        expiresOn: asDate(s.expiresOn),
        status: s.status,
        chargeId: s.chargeId,
        soldById: s.soldById,
        version: 1,
      },
    });
    for (const movement of pkg.movements) {
      await uow.tx.packageMovement.create({
        data: {
          id: newId(),
          organizationId: s.organizationId,
          packageId: s.id,
          appointmentId: movement.appointmentId,
          kind: movement.kind,
          sessions: movement.sessions,
          days: movement.days,
          reason: movement.reason,
          actorUserId: movement.actorUserId,
          occurredAt: movement.occurredAt,
        },
      });
    }
    pkg.markPersisted(1);
  },

  async save(uow, pkg) {
    const s = pkg.snapshot;
    const updated = await uow.tx.patientPackage.updateMany({
      where: { id: s.id, version: s.version },
      data: {
        usedSessions: s.usedSessions,
        forfeitedSessions: s.forfeitedSessions,
        extendedDays: s.extendedDays,
        expiresOn: asDate(s.expiresOn),
        status: s.status,
        closedAt: s.closedAt,
        closedById: s.closedById,
        closeReason: s.closeReason,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return "STALE";
    for (const movement of pkg.movements) {
      await uow.tx.packageMovement.create({
        data: {
          id: newId(),
          organizationId: s.organizationId,
          packageId: s.id,
          appointmentId: movement.appointmentId,
          kind: movement.kind,
          sessions: movement.sessions,
          days: movement.days,
          reason: movement.reason,
          actorUserId: movement.actorUserId,
          occurredAt: movement.occurredAt,
        },
      });
    }
    pkg.markPersisted(s.version + 1);
    return "OK";
  },

  async addLink(uow, organizationId, link) {
    await uow.tx.packageAppointment.create({
      data: {
        id: link.id,
        organizationId,
        packageId: link.packageId,
        appointmentId: link.appointmentId,
        status: link.status,
        flagged: link.flagged,
        linkedAt: link.linkedAt,
        debitedAt: link.debitedAt,
        closedAt: link.closedAt,
      },
    });
  },

  async updateLink(uow, linkId, patch) {
    await uow.tx.packageAppointment.updateMany({ where: { id: linkId }, data: patch });
  },

  async openLinks(uow, packageId) {
    const rows = await uow.tx.packageAppointment.findMany({
      where: { packageId, status: "LINKED" },
      orderBy: { linkedAt: "asc" },
    });
    return rows.map(toLink);
  },

  async clearFlags(uow, appointmentId) {
    await uow.tx.packageAppointment.updateMany({
      where: { appointmentId, flagged: true },
      data: { flagged: false },
    });
  },

  async unitTimeZone(uow, unitId) {
    const unit = await uow.tx.unit.findFirst({ where: { id: unitId }, select: { timeZone: true } });
    return unit?.timeZone ?? null;
  },

  async debitNoShow(uow) {
    const settings = await uow.tx.packageSettings.findFirst({ select: { debitNoShow: true } });
    return settings?.debitNoShow ?? false;
  },

  async expirable(uow, today) {
    const rows = await uow.tx.patientPackage.findMany({
      where: { status: "ACTIVE", expiresOn: { lt: asDate(today) } },
      select: { id: true },
      orderBy: { expiresOn: "asc" },
    });
    return rows.map((row) => row.id);
  },
};
