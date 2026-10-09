import type { Prisma } from "@/generated/prisma/client";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { EntryRepository, SeriesRecord } from "../application/ports";
import { FinancialEntry, type EntryProps } from "../domain/financial-entry";

const day = (date: Date): string => date.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

type EntryRow = {
  id: string;
  organizationId: string;
  kind: string;
  description: string;
  categoryId: string;
  unitId: string | null;
  currency: string;
  amountMinor: bigint;
  dueDate: Date;
  status: string;
  seriesId: string | null;
  occurrenceIndex: number | null;
  attachmentId: string | null;
  deletedAt: Date | null;
  deletedById: string | null;
  createdById: string;
  version: number;
};

function toProps(row: EntryRow): EntryProps {
  return {
    id: row.id,
    organizationId: row.organizationId,
    kind: row.kind as EntryProps["kind"],
    description: row.description,
    categoryId: row.categoryId,
    unitId: row.unitId,
    currency: row.currency,
    amountMinor: Number(row.amountMinor),
    dueDate: day(row.dueDate),
    status: row.status as EntryProps["status"],
    seriesId: row.seriesId,
    occurrenceIndex: row.occurrenceIndex,
    attachmentId: row.attachmentId,
    deletedAt: row.deletedAt,
    deletedById: row.deletedById,
    createdById: row.createdById,
    version: row.version,
  };
}

async function lock(uow: UnitOfWork, entryId: string) {
  await uow.tx.$queryRaw`SELECT id FROM financial_entry WHERE id = ${entryId}::uuid FOR UPDATE`;
}

function seriesRecord(
  row: {
    id: string;
    kind: string;
    description: string;
    categoryId: string;
    unitId: string | null;
    currency: string;
    amountMinor: bigint;
    active: boolean;
  },
  firstDueDate: string,
): SeriesRecord {
  return {
    id: row.id,
    kind: row.kind as SeriesRecord["kind"],
    description: row.description,
    categoryId: row.categoryId,
    unitId: row.unitId,
    currency: row.currency,
    amountMinor: Number(row.amountMinor),
    firstDueDate,
    active: row.active,
  };
}

// The first due date of a series is the due date of its occurrence 0, which a deleted occurrence
// still keeps (entries are soft deleted).
async function firstDue(uow: UnitOfWork, seriesId: string): Promise<string> {
  const first = await uow.tx.financialEntry.findFirst({
    where: { seriesId, occurrenceIndex: 0 },
    select: { dueDate: true },
  });
  return first ? day(first.dueDate) : "1970-01-01";
}

export const prismaEntryRepository: EntryRepository = {
  async findById(uow, entryId, options) {
    if (options.lock) await lock(uow, entryId);
    const row = await uow.tx.financialEntry.findFirst({ where: { id: entryId, deletedAt: null } });
    return row ? FinancialEntry.rehydrate(toProps(row)) : null;
  },

  async insert(uow, entry) {
    const s = entry.snapshot;
    await uow.tx.financialEntry.create({
      data: {
        id: s.id,
        organizationId: s.organizationId,
        kind: s.kind,
        description: s.description,
        categoryId: s.categoryId,
        unitId: s.unitId,
        currency: s.currency,
        amountMinor: BigInt(s.amountMinor),
        dueDate: asDate(s.dueDate),
        status: "PENDING",
        seriesId: s.seriesId,
        occurrenceIndex: s.occurrenceIndex,
        attachmentId: s.attachmentId,
        createdById: s.createdById,
        version: 1,
      },
    });
    if (s.attachmentId) {
      await uow.tx.financialAttachment.updateMany({
        where: { id: s.attachmentId },
        data: { status: "ATTACHED" },
      });
    }
    entry.markPersisted(1);
  },

  async save(uow, entry) {
    const s = entry.snapshot;
    const updated = await uow.tx.financialEntry.updateMany({
      where: { id: s.id, version: s.version },
      data: {
        description: s.description,
        categoryId: s.categoryId,
        unitId: s.unitId,
        currency: s.currency,
        amountMinor: BigInt(s.amountMinor),
        dueDate: asDate(s.dueDate),
        attachmentId: s.attachmentId,
        status: s.status,
        deletedAt: s.deletedAt,
        deletedById: s.deletedById,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return "STALE";
    if (s.attachmentId) {
      await uow.tx.financialAttachment.updateMany({
        where: { id: s.attachmentId },
        data: { status: "ATTACHED" },
      });
    }
    if (entry.newPayment) {
      const p = entry.newPayment;
      await uow.tx.financialEntryPayment.create({
        data: {
          id: p.id,
          organizationId: s.organizationId,
          entryId: s.id,
          paidOn: asDate(p.paidOn),
          method: p.method,
          amountMinor: BigInt(p.amountMinor),
          currency: p.currency,
          recordedById: p.recordedById,
          recordedAt: p.recordedAt,
        },
      });
    }
    if (entry.reversal) {
      await uow.tx.financialEntryPayment.updateMany({
        where: { entryId: s.id, reversedAt: null },
        data: {
          reversedAt: entry.reversal.at,
          reversedById: entry.reversal.userId,
          reversalReason: entry.reversal.reason,
        },
      });
    }
    entry.markPersisted(s.version + 1);
    return "OK";
  },

  async list(uow, filter) {
    const where: Prisma.FinancialEntryWhereInput = {
      kind: filter.kind,
      deletedAt: null,
      ...(filter.from || filter.to
        ? {
            dueDate: {
              ...(filter.from ? { gte: asDate(filter.from) } : {}),
              ...(filter.to ? { lte: asDate(filter.to) } : {}),
            },
          }
        : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.unit === "GENERAL"
        ? { unitId: null }
        : filter.unit !== "ALL"
          ? { unitId: filter.unit }
          : {}),
      ...(filter.status === "PENDING" ? { status: "PENDING" } : {}),
      ...(filter.status === "PAID" ? { status: "PAID" } : {}),
      ...(filter.status === "OVERDUE" ? { status: "PENDING", dueDate: { lt: asDate(filter.today) } } : {}),
    };
    const rows = await uow.tx.financialEntry.findMany({
      where,
      include: {
        category: { select: { name: true } },
        attachment: { select: { fileName: true } },
        payments: { where: { reversedAt: null }, select: { paidOn: true, method: true } },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 500,
    });
    return rows.map((row) => ({
      ...toProps(row),
      categoryName: row.category.name,
      paidOn: row.payments[0] ? day(row.payments[0].paidOn) : null,
      paymentMethod: row.payments[0]?.method ?? null,
      attachmentName: row.attachment?.fileName ?? null,
    }));
  },

  async insertSeries(uow, organizationId, series) {
    await uow.tx.financialEntrySeries.create({
      data: {
        id: series.id,
        organizationId,
        kind: series.kind,
        description: series.description,
        categoryId: series.categoryId,
        unitId: series.unitId,
        currency: series.currency,
        amountMinor: BigInt(series.amountMinor),
        dayOfMonth: Number(series.firstDueDate.slice(8, 10)),
        active: true,
        createdById: series.createdById,
      },
    });
  },

  async findSeries(uow, seriesId, options) {
    if (options.lock) {
      await uow.tx.$queryRaw`SELECT id FROM financial_entry_series WHERE id = ${seriesId}::uuid FOR UPDATE`;
    }
    const row = await uow.tx.financialEntrySeries.findFirst({ where: { id: seriesId } });
    return row ? seriesRecord(row, await firstDue(uow, seriesId)) : null;
  },

  async seriesIndexes(uow, seriesId) {
    const rows = await uow.tx.financialEntry.findMany({
      // Deleted occurrences keep their index, so the daily extension never recreates them.
      where: { seriesId },
      select: { occurrenceIndex: true },
    });
    return rows.flatMap((row) => (row.occurrenceIndex === null ? [] : [row.occurrenceIndex]));
  },

  async activeSeries(uow) {
    const rows = await uow.tx.financialEntrySeries.findMany({ where: { active: true } });
    const result: SeriesRecord[] = [];
    for (const row of rows) result.push(seriesRecord(row, await firstDue(uow, row.id)));
    return result;
  },

  async updateSeries(uow, seriesId, patch) {
    await uow.tx.financialEntrySeries.updateMany({
      where: { id: seriesId },
      data: {
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.unitId !== undefined ? { unitId: patch.unitId } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.amountMinor !== undefined ? { amountMinor: BigInt(patch.amountMinor) } : {}),
      },
    });
  },

  async endSeries(uow, seriesId, userId, now, fromDate) {
    await uow.tx.financialEntrySeries.updateMany({
      where: { id: seriesId },
      data: { active: false, endedAt: now, endedById: userId },
    });
    const removed = await uow.tx.financialEntry.updateMany({
      where: { seriesId, status: "PENDING", deletedAt: null, dueDate: { gte: asDate(fromDate) } },
      data: { deletedAt: now, deletedById: userId, version: { increment: 1 } },
    });
    return removed.count;
  },

  async followingPending(uow, seriesId, fromDate) {
    const rows = await uow.tx.financialEntry.findMany({
      where: { seriesId, status: "PENDING", deletedAt: null, dueDate: { gte: asDate(fromDate) } },
      orderBy: { dueDate: "asc" },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },
};
