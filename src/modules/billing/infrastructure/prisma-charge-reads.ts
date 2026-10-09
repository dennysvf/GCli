import type { Prisma } from "@/generated/prisma/client";
import { forTenant } from "@/shared/db/tenant";
import type { ChargeFilter, ChargeReads, ChargeTotals } from "../application/ports";
import { CHARGE_INCLUDE, toChargeProps, toRequest } from "./prisma-charge-repository";

function whereOf(filter: ChargeFilter): Prisma.ChargeWhereInput {
  return {
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : {}),
    ...(filter.unitId ? { unitId: filter.unitId } : {}),
    ...(filter.statuses?.length ? { status: { in: filter.statuses } } : {}),
    ...(filter.professionalId ? { professionalId: filter.professionalId } : {}),
    ...(filter.patientId ? { patientId: filter.patientId } : {}),
    ...(filter.method ? { payments: { some: { method: filter.method, kind: "PAYMENT" } } } : {}),
  };
}

export const prismaChargeReads: ChargeReads = {
  async listPending(uow) {
    const rows = await uow.tx.charge.findMany({
      where: { status: "PENDING_APPROVAL" },
      include: CHARGE_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toChargeProps);
  },

  countPending: (uow) => uow.tx.charge.count({ where: { status: "PENDING_APPROVAL" } }),

  async list(uow, filter, page) {
    const base = whereOf(filter);
    const cursor = page.cursor;
    const where: Prisma.ChargeWhereInput = cursor
      ? {
          AND: [
            base,
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : base;
    const rows = await uow.tx.charge.findMany({
      where,
      include: CHARGE_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.take + 1,
    });
    // Voided charges are not receivables, so the totals leave them out.
    const grouped = await uow.tx.charge.groupBy({
      by: ["currency"],
      where: { AND: [base, { status: { not: "CANCELLED" } }] },
      _sum: { grossMinor: true, discountMinor: true, netMinor: true, paidMinor: true },
      orderBy: { currency: "asc" },
    });
    const totals: ChargeTotals[] = grouped.map((row) => {
      const net = Number(row._sum.netMinor ?? 0n);
      const paid = Number(row._sum.paidMinor ?? 0n);
      return {
        currency: row.currency,
        grossMinor: Number(row._sum.grossMinor ?? 0n),
        discountMinor: Number(row._sum.discountMinor ?? 0n),
        netMinor: net,
        paidMinor: paid,
        balanceMinor: net - paid,
      };
    });
    return { items: rows.slice(0, page.take).map(toChargeProps), hasMore: rows.length > page.take, totals };
  },

  async requestHistory(uow, chargeId) {
    const rows = await uow.tx.chargeDiscountRequest.findMany({
      where: { chargeId },
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => toRequest(row));
  },

  async hasAnyInUnit(organizationId, unitId) {
    const tenant = forTenant(organizationId);
    const [charges, payments] = await Promise.all([
      tenant.charge.count({ where: { unitId } }),
      tenant.payment.count({ where: { unitId } }),
    ]);
    return charges + payments > 0;
  },

  async paymentsInWindow(uow, filter) {
    const rows = await uow.tx.payment.findMany({
      where: {
        ...(filter.unitIds ? { unitId: { in: filter.unitIds } } : {}),
        ...(filter.currency ? { currency: filter.currency } : {}),
        ...(filter.from || filter.to
          ? {
              receivedAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lt: filter.to } : {}),
              },
            }
          : {}),
      },
      include: { charge: { select: { number: true, patientId: true } } },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as "PAYMENT" | "REFUND",
      method: row.method,
      amountMinor: Number(row.amountMinor),
      currency: row.currency,
      unitId: row.unitId,
      receivedAt: row.receivedAt,
      chargeId: row.chargeId,
      chargeNumber: row.charge.number,
      patientId: row.charge.patientId,
      userId: row.userId,
    }));
  },
};
