import type { CashReads } from "../application/ports";

const day = (date: Date): string => date.toISOString().slice(0, 10);
const asDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

export const prismaCashReads: CashReads = {
  async categories(uow) {
    const rows = await uow.tx.financialCategory.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as "EXPENSE" | "REVENUE" | "TRANSFER",
      name: row.name,
      system: row.system,
      active: row.active,
    }));
  },

  async category(uow, categoryId) {
    const row = await uow.tx.financialCategory.findFirst({ where: { id: categoryId } });
    return row
      ? {
          id: row.id,
          kind: row.kind as "EXPENSE" | "REVENUE" | "TRANSFER",
          name: row.name,
          system: row.system,
          active: row.active,
        }
      : null;
  },

  async paidEntries(uow, filter) {
    const unitFilter =
      filter.unitIds === null
        ? {}
        : filter.includeGeneral
          ? { OR: [{ unitId: { in: filter.unitIds } }, { unitId: null }] }
          : { unitId: { in: filter.unitIds } };
    const rows = await uow.tx.financialEntryPayment.findMany({
      where: {
        reversedAt: null,
        currency: filter.currency,
        ...(filter.from || filter.to
          ? {
              paidOn: {
                ...(filter.from ? { gte: asDate(filter.from) } : {}),
                ...(filter.to ? { lte: asDate(filter.to) } : {}),
              },
            }
          : {}),
        entry: { deletedAt: null, ...unitFilter },
      },
      include: { entry: { include: { category: { select: { name: true } } } } },
      orderBy: [{ paidOn: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.entryId,
      kind: row.entry.kind as "EXPENSE" | "REVENUE",
      description: row.entry.description,
      categoryName: row.entry.category.name,
      amountMinor: Number(row.amountMinor),
      paidOn: day(row.paidOn),
      paymentId: row.id,
    }));
  },

  async statementMovements(uow, filter) {
    const rows = await uow.tx.cashMovement.findMany({
      where: {
        reversedAt: null,
        currency: filter.currency,
        category: { kind: { not: "TRANSFER" } },
        register: {
          unitId: { in: filter.unitIds },
          ...(filter.from || filter.to
            ? {
                businessDate: {
                  ...(filter.from ? { gte: asDate(filter.from) } : {}),
                  ...(filter.to ? { lte: asDate(filter.to) } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        category: { select: { name: true } },
        register: { select: { businessDate: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      direction: row.direction as "IN" | "OUT",
      description: row.description,
      categoryName: row.category.name,
      amountMinor: Number(row.amountMinor),
      businessDate: day(row.register.businessDate),
      createdAt: row.createdAt,
    }));
  },

  async attachment(uow, attachmentId) {
    const row = await uow.tx.financialAttachment.findFirst({ where: { id: attachmentId } });
    return row
      ? {
          id: row.id,
          objectKey: row.objectKey,
          fileName: row.fileName,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
          status: row.status as "PENDING" | "ATTACHED",
          uploadedById: row.uploadedById,
        }
      : null;
  },
};
