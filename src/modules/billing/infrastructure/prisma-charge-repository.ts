import type { Prisma } from "@/generated/prisma/client";
import type { UnitOfWork } from "@/shared/db/transaction";
import { Charge, type ChargeProps, type DiscountRequestRecord, type PaymentRecord } from "../domain/charge";
import { formatChargeNumber, type ChargeOrigin, type ChargeStatus } from "../domain/status";
import type { ChargeRepository } from "../application/ports";

export const CHARGE_INCLUDE = {
  payments: { orderBy: [{ receivedAt: "asc" }, { recordedAt: "asc" }, { id: "asc" }] },
  requests: { where: { status: "PENDING" } },
} satisfies Prisma.ChargeInclude;

export type ChargeRow = Prisma.ChargeGetPayload<{ include: typeof CHARGE_INCLUDE }>;

const num = (value: bigint): number => Number(value);

function toPayment(row: ChargeRow["payments"][number]): PaymentRecord {
  return {
    id: row.id,
    kind: row.kind as PaymentRecord["kind"],
    refundedPaymentId: row.refundedPaymentId,
    submissionId: row.submissionId,
    method: row.method,
    installments: row.installments,
    amountMinor: num(row.amountMinor),
    refundedMinor: num(row.refundedMinor),
    unitId: row.unitId,
    receivedAt: row.receivedAt,
    recordedAt: row.recordedAt,
    userId: row.userId,
    reason: row.reason,
  };
}

export function toRequest(row: ChargeRow["requests"][number]): DiscountRequestRecord {
  return {
    id: row.id,
    kind: row.kind as DiscountRequestRecord["kind"],
    value: row.value,
    discountMinor: num(row.discountMinor),
    reason: row.reason,
    status: row.status as DiscountRequestRecord["status"],
    method: row.method as DiscountRequestRecord["method"],
    requestedById: row.requestedById,
    requestedAt: row.requestedAt,
    decidedById: row.decidedById,
    decidedAt: row.decidedAt,
    rejectionReason: row.rejectionReason,
  };
}

export function toChargeProps(row: ChargeRow): ChargeProps {
  const props: ChargeProps = {
    id: row.id,
    organizationId: row.organizationId,
    number: row.number,
    patientId: row.patientId,
    origin: row.origin as ChargeOrigin,
    appointmentId: row.appointmentId,
    packageId: row.packageId,
    serviceId: row.serviceId,
    description: row.description,
    professionalId: row.professionalId,
    unitId: row.unitId,
    currency: row.currency,
    grossMinor: num(row.grossMinor),
    discount: row.discountKind
      ? { kind: row.discountKind as "PERCENT" | "AMOUNT", value: row.discountValue ?? 0 }
      : null,
    discountMinor: num(row.discountMinor),
    discountReason: row.discountReason,
    netMinor: num(row.netMinor),
    paidMinor: num(row.paidMinor),
    status: row.status as ChargeStatus,
    cancelledAt: row.cancelledAt,
    cancelledById: row.cancelledById,
    cancelReason: row.cancelReason,
    createdById: row.createdById,
    version: row.version,
    createdAt: row.createdAt,
    payments: row.payments.map(toPayment),
    pendingRequest: row.requests[0] ? toRequest(row.requests[0]) : null,
  };
  return props;
}

function toCharge(row: ChargeRow): Charge {
  return Charge.rehydrate(toChargeProps(row));
}

async function lock(uow: UnitOfWork, organizationId: string, where: { id?: string; appointmentId?: string }) {
  if (where.id) {
    await uow.tx.$queryRaw`
      SELECT id FROM charge WHERE id = ${where.id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  } else if (where.appointmentId) {
    await uow.tx.$queryRaw`
      SELECT id FROM charge
      WHERE appointment_id = ${where.appointmentId}::uuid AND organization_id = ${organizationId}::uuid
        AND status <> 'CANCELLED' FOR UPDATE`;
  }
}

function requestData(request: DiscountRequestRecord) {
  return {
    kind: request.kind,
    value: request.value,
    discountMinor: BigInt(request.discountMinor),
    reason: request.reason,
    status: request.status,
    method: request.method,
    requestedById: request.requestedById,
    requestedAt: request.requestedAt,
    decidedById: request.decidedById,
    decidedAt: request.decidedAt,
    rejectionReason: request.rejectionReason,
  };
}

export const prismaChargeRepository: ChargeRepository = {
  async nextNumber(uow, organizationId, now) {
    const year = now.getUTCFullYear();
    const rows = await uow.tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO charge_number_sequence (organization_id, year, last_value)
      VALUES (${organizationId}::uuid, ${year}, 1)
      ON CONFLICT (organization_id, year)
      DO UPDATE SET last_value = charge_number_sequence.last_value + 1
      RETURNING last_value`;
    return formatChargeNumber(year, rows[0]?.last_value ?? 1);
  },

  async insert(uow, charge) {
    const s = charge.snapshot;
    await uow.tx.charge.create({
      data: {
        id: s.id,
        organizationId: s.organizationId,
        number: s.number,
        patientId: s.patientId,
        origin: s.origin,
        appointmentId: s.appointmentId,
        packageId: s.packageId,
        serviceId: s.serviceId,
        description: s.description,
        professionalId: s.professionalId,
        unitId: s.unitId,
        currency: s.currency,
        grossMinor: BigInt(s.grossMinor),
        discountMinor: BigInt(s.discountMinor),
        netMinor: BigInt(s.netMinor),
        paidMinor: BigInt(s.paidMinor),
        status: s.status,
        createdById: s.createdById,
        version: 1,
      },
    });
    charge.markPersisted(1);
  },

  async findById(uow, organizationId, chargeId, options) {
    if (options.lock) await lock(uow, organizationId, { id: chargeId });
    const row = await uow.tx.charge.findFirst({ where: { id: chargeId }, include: CHARGE_INCLUDE });
    return row ? toCharge(row) : null;
  },

  async findLiveByAppointment(uow, organizationId, appointmentId, options) {
    if (options.lock) await lock(uow, organizationId, { appointmentId });
    const row = await uow.tx.charge.findFirst({
      where: { appointmentId, status: { not: "CANCELLED" } },
      include: CHARGE_INCLUDE,
    });
    return row ? toCharge(row) : null;
  },

  async save(uow, charge) {
    const s = charge.snapshot;
    const updated = await uow.tx.charge.updateMany({
      where: { id: s.id, version: s.version },
      data: {
        discountKind: s.discount?.kind ?? null,
        discountValue: s.discount?.value ?? null,
        discountMinor: BigInt(s.discountMinor),
        discountReason: s.discountReason,
        netMinor: BigInt(s.netMinor),
        paidMinor: BigInt(s.paidMinor),
        status: s.status,
        cancelledAt: s.cancelledAt,
        cancelledById: s.cancelledById,
        cancelReason: s.cancelReason,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return "STALE";
    for (const change of charge.changes) {
      switch (change.type) {
        case "PAYMENT_ADDED": {
          const p = change.payment;
          await uow.tx.payment.create({
            data: {
              id: p.id,
              organizationId: s.organizationId,
              chargeId: s.id,
              kind: p.kind,
              refundedPaymentId: p.refundedPaymentId,
              submissionId: p.submissionId,
              method: p.method,
              installments: p.installments,
              amountMinor: BigInt(p.amountMinor),
              refundedMinor: BigInt(p.refundedMinor),
              currency: s.currency,
              unitId: p.unitId,
              receivedAt: p.receivedAt,
              recordedAt: p.recordedAt,
              userId: p.userId,
              reason: p.reason,
            },
          });
          break;
        }
        case "PAYMENT_REFUNDED":
          await uow.tx.payment.updateMany({
            where: { id: change.paymentId },
            data: { refundedMinor: BigInt(change.refundedMinor) },
          });
          break;
        case "REQUEST_ADDED":
          await uow.tx.chargeDiscountRequest.create({
            data: {
              id: change.request.id,
              organizationId: s.organizationId,
              chargeId: s.id,
              ...requestData(change.request),
            },
          });
          break;
        case "REQUEST_UPDATED":
          await uow.tx.chargeDiscountRequest.updateMany({
            where: { id: change.request.id },
            data: requestData(change.request),
          });
          break;
      }
    }
    charge.markPersisted(s.version + 1);
    return "OK";
  },

  async delete(uow, chargeId) {
    await uow.tx.charge.deleteMany({ where: { id: chargeId } });
  },

  async findSubmission(uow, submissionId) {
    const row = await uow.tx.paymentSubmission.findFirst({
      where: { id: submissionId },
      select: { chargeId: true },
    });
    return row ? { chargeId: row.chargeId } : null;
  },

  async insertSubmission(uow, submission) {
    await uow.tx.paymentSubmission.create({
      data: {
        id: submission.id,
        organizationId: submission.organizationId,
        chargeId: submission.chargeId,
        userId: submission.userId,
      },
    });
  },
};
