import { forTenant } from "@/shared/db/tenant";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { RegisterRepository } from "../application/ports";
import { CashRegister, type RegisterProps } from "../domain/cash-register";
import type { MethodTotals } from "../domain/expected-cash";

const day = (date: Date): string => date.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

function toRegister(row: {
  id: string;
  organizationId: string;
  unitId: string;
  businessDate: Date;
  currency: string;
  openingMinor: bigint;
  suggestedOpeningMinor: bigint;
  openingReason: string | null;
  status: string;
  flaggedUnclosed: boolean;
  flaggedAt: Date | null;
  openedById: string;
  openedAt: Date;
  version: number;
}): CashRegister {
  const props: RegisterProps = {
    id: row.id,
    organizationId: row.organizationId,
    unitId: row.unitId,
    businessDate: day(row.businessDate),
    currency: row.currency,
    openingMinor: Number(row.openingMinor),
    suggestedOpeningMinor: Number(row.suggestedOpeningMinor),
    openingReason: row.openingReason,
    status: row.status as RegisterProps["status"],
    flaggedUnclosed: row.flaggedUnclosed,
    flaggedAt: row.flaggedAt,
    openedById: row.openedById,
    openedAt: row.openedAt,
    version: row.version,
  };
  return CashRegister.rehydrate(props);
}

// The register row is locked by id; the scoped read that follows keeps other organizations out.
async function lock(uow: UnitOfWork, registerId: string) {
  await uow.tx.$queryRaw`SELECT id FROM cash_register WHERE id = ${registerId}::uuid FOR UPDATE`;
}

export const prismaRegisterRepository: RegisterRepository = {
  async findById(uow, registerId, options) {
    if (options.lock) await lock(uow, registerId);
    const row = await uow.tx.cashRegister.findFirst({ where: { id: registerId } });
    return row ? toRegister(row) : null;
  },

  async findByUnitDay(uow, unitId, businessDate, options) {
    const row = await uow.tx.cashRegister.findFirst({
      where: { unitId, businessDate: asDate(businessDate) },
    });
    if (!row) return null;
    if (options.lock) await lock(uow, row.id);
    const fresh = options.lock ? await uow.tx.cashRegister.findFirst({ where: { id: row.id } }) : row;
    return fresh ? toRegister(fresh) : null;
  },

  async insertIfAbsent(uow, register) {
    const s = register.snapshot;
    const created = await uow.tx.cashRegister.createMany({
      data: [
        {
          id: s.id,
          organizationId: s.organizationId,
          unitId: s.unitId,
          businessDate: asDate(s.businessDate),
          currency: s.currency,
          openingMinor: BigInt(s.openingMinor),
          suggestedOpeningMinor: BigInt(s.suggestedOpeningMinor),
          openingReason: s.openingReason,
          status: s.status,
          flaggedUnclosed: false,
          openedById: s.openedById,
          openedAt: s.openedAt,
          version: 1,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 1) register.markPersisted(1);
    return created.count === 1 ? "INSERTED" : "EXISTS";
  },

  async save(uow, register) {
    const s = register.snapshot;
    const updated = await uow.tx.cashRegister.updateMany({
      where: { id: s.id, version: s.version },
      data: {
        status: s.status,
        flaggedUnclosed: s.flaggedUnclosed,
        flaggedAt: s.flaggedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return "STALE";
    if (register.newClosing) {
      const c = register.newClosing;
      await uow.tx.cashRegisterClosing.create({
        data: {
          id: c.id,
          organizationId: s.organizationId,
          registerId: s.id,
          sequence: c.sequence,
          expectedMinor: BigInt(c.expectedMinor),
          countedMinor: BigInt(c.countedMinor),
          differenceMinor: BigInt(c.differenceMinor),
          justification: c.justification,
          byMethod: c.byMethod,
          movementsInMinor: BigInt(c.movementsInMinor),
          movementsOutMinor: BigInt(c.movementsOutMinor),
          wasFlaggedUnclosed: c.wasFlaggedUnclosed,
          closedById: c.closedById,
          closedAt: c.closedAt,
        },
      });
    }
    if (register.newReopening) {
      const r = register.newReopening;
      await uow.tx.cashRegisterReopening.create({
        data: {
          id: r.id,
          organizationId: s.organizationId,
          registerId: s.id,
          closingId: r.closingId,
          reason: r.reason,
          reopenedById: r.reopenedById,
          reopenedAt: r.reopenedAt,
        },
      });
    }
    register.markPersisted(s.version + 1);
    return "OK";
  },

  async lastCounted(uow, unitId, businessDate) {
    const row = await uow.tx.cashRegisterClosing.findFirst({
      where: { register: { unitId, businessDate: { lt: asDate(businessDate) } } },
      orderBy: [{ register: { businessDate: "desc" } }, { sequence: "desc" }],
      select: { countedMinor: true },
    });
    return row ? Number(row.countedMinor) : null;
  },

  async closings(uow, registerId) {
    const rows = await uow.tx.cashRegisterClosing.findMany({
      where: { registerId },
      orderBy: { sequence: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      registerId: row.registerId,
      sequence: row.sequence,
      expectedMinor: Number(row.expectedMinor),
      countedMinor: Number(row.countedMinor),
      differenceMinor: Number(row.differenceMinor),
      justification: row.justification,
      byMethod: row.byMethod as unknown as MethodTotals[],
      movementsInMinor: Number(row.movementsInMinor),
      movementsOutMinor: Number(row.movementsOutMinor),
      wasFlaggedUnclosed: row.wasFlaggedUnclosed,
      closedById: row.closedById,
      closedAt: row.closedAt,
    }));
  },

  async reopenings(uow, registerId) {
    const rows = await uow.tx.cashRegisterReopening.findMany({
      where: { registerId },
      orderBy: { reopenedAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      registerId: row.registerId,
      closingId: row.closingId,
      reason: row.reason,
      reopenedById: row.reopenedById,
      reopenedAt: row.reopenedAt,
    }));
  },

  async movements(uow, registerId) {
    const rows = await uow.tx.cashMovement.findMany({
      where: { registerId },
      include: { category: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      registerId: row.registerId,
      direction: row.direction as "IN" | "OUT",
      amountMinor: Number(row.amountMinor),
      currency: row.currency,
      description: row.description,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      attachmentId: row.attachmentId,
      createdById: row.createdById,
      createdAt: row.createdAt,
      reversedAt: row.reversedAt,
      reversedById: row.reversedById,
      reversalReason: row.reversalReason,
    }));
  },

  async findMovement(uow, movementId, options) {
    if (options.lock) {
      await uow.tx.$queryRaw`SELECT id FROM cash_movement WHERE id = ${movementId}::uuid FOR UPDATE`;
    }
    const row = await uow.tx.cashMovement.findFirst({
      where: { id: movementId },
      include: { category: { select: { name: true } } },
    });
    return row
      ? {
          id: row.id,
          registerId: row.registerId,
          direction: row.direction as "IN" | "OUT",
          amountMinor: Number(row.amountMinor),
          currency: row.currency,
          description: row.description,
          categoryId: row.categoryId,
          categoryName: row.category.name,
          attachmentId: row.attachmentId,
          createdById: row.createdById,
          createdAt: row.createdAt,
          reversedAt: row.reversedAt,
          reversedById: row.reversedById,
          reversalReason: row.reversalReason,
        }
      : null;
  },

  async insertMovement(uow, organizationId, movement) {
    await uow.tx.cashMovement.create({
      data: {
        id: movement.id,
        organizationId,
        registerId: movement.registerId,
        direction: movement.direction,
        amountMinor: BigInt(movement.amountMinor),
        currency: movement.currency,
        description: movement.description,
        categoryId: movement.categoryId,
        attachmentId: movement.attachmentId,
        createdById: movement.createdById,
        createdAt: movement.createdAt,
      },
    });
    if (movement.attachmentId) {
      await uow.tx.financialAttachment.updateMany({
        where: { id: movement.attachmentId },
        data: { status: "ATTACHED" },
      });
    }
  },

  async reverseMovement(uow, movementId, reversal) {
    await uow.tx.cashMovement.updateMany({
      where: { id: movementId, reversedAt: null },
      data: { reversedAt: reversal.at, reversedById: reversal.userId, reversalReason: reversal.reason },
    });
  },

  async unclosedBefore(uow, unitId, businessDate) {
    const rows = await uow.tx.cashRegister.findMany({
      where: { unitId, status: "OPEN", businessDate: { lt: asDate(businessDate) } },
      orderBy: { businessDate: "asc" },
      select: { id: true, businessDate: true },
    });
    return rows.map((row) => ({ id: row.id, businessDate: day(row.businessDate) }));
  },

  async openBefore(uow, unitId, businessDate) {
    const rows = await uow.tx.cashRegister.findMany({
      where: { unitId, status: "OPEN", flaggedUnclosed: false, businessDate: { lt: asDate(businessDate) } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },

  async hasAnyInUnit(organizationId, unitId) {
    const tenant = forTenant(organizationId);
    const [registers, entries, series] = await Promise.all([
      tenant.cashRegister.count({ where: { unitId } }),
      tenant.financialEntry.count({ where: { unitId } }),
      tenant.financialEntrySeries.count({ where: { unitId } }),
    ]);
    return registers + entries + series > 0;
  },
};
