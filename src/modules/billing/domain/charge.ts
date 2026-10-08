import { fail, ok, type Result } from "@/shared/kernel/result";
import { discountMinor, isValidDiscount, needsApproval, needsReason, type DiscountInput } from "./discount";
import { BillingErrors } from "./errors";
import { REASON_MIN_LENGTH } from "./limits";
import { deriveStatus, type ChargeOrigin, type ChargeStatus } from "./status";

export type PaymentRecord = {
  id: string;
  kind: "PAYMENT" | "REFUND";
  refundedPaymentId: string | null;
  submissionId: string | null;
  method: string;
  installments: number | null;
  // Positive for payments, negative for refunds.
  amountMinor: number;
  refundedMinor: number;
  unitId: string;
  receivedAt: Date;
  recordedAt: Date;
  userId: string;
  reason: string | null;
};

export type DiscountRequestRecord = {
  id: string;
  kind: DiscountInput["kind"];
  value: number;
  discountMinor: number;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  method: "ROLE" | "PIN" | "LIST" | null;
  requestedById: string;
  requestedAt: Date;
  decidedById: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
};

export type ChargeProps = {
  id: string;
  organizationId: string;
  number: string;
  patientId: string;
  origin: ChargeOrigin;
  appointmentId: string | null;
  packageId: string | null;
  serviceId: string | null;
  description: string | null;
  professionalId: string | null;
  unitId: string;
  currency: string;
  grossMinor: number;
  discount: DiscountInput | null;
  discountMinor: number;
  discountReason: string | null;
  netMinor: number;
  paidMinor: number;
  status: ChargeStatus;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancelReason: string | null;
  createdById: string;
  version: number;
  createdAt: Date;
  payments: PaymentRecord[];
  pendingRequest: DiscountRequestRecord | null;
};

// What a command changed, for the repository to write in the same transaction.
export type ChargeChange =
  | { type: "PAYMENT_ADDED"; payment: PaymentRecord }
  | { type: "PAYMENT_REFUNDED"; paymentId: string; refundedMinor: number }
  | { type: "REQUEST_ADDED"; request: DiscountRequestRecord }
  | { type: "REQUEST_UPDATED"; request: DiscountRequestRecord };

export type PaymentLine = { method: string; amountMinor: number; installments: number | null };

const trimmed = (text: string | null | undefined) => (text ?? "").trim();
const hasReason = (text: string | null | undefined) => trimmed(text).length >= REASON_MIN_LENGTH;

// The charge aggregate (PRD F09). It owns the amounts, the discount rules, the payments and the
// derived status; the use cases around it handle permissions, units, methods and persistence.
export class Charge {
  readonly changes: ChargeChange[] = [];
  private props: ChargeProps;

  private constructor(props: ChargeProps) {
    this.props = { ...props, payments: [...props.payments] };
  }

  static rehydrate(props: ChargeProps): Charge {
    return new Charge(props);
  }

  static create(input: {
    id: string;
    organizationId: string;
    number: string;
    patientId: string;
    origin: ChargeOrigin;
    appointmentId?: string | null;
    packageId?: string | null;
    serviceId?: string | null;
    description?: string | null;
    professionalId?: string | null;
    unitId: string;
    currency: string;
    grossMinor: number;
    createdById: string;
    now: Date;
  }): Result<Charge> {
    if (!Number.isSafeInteger(input.grossMinor) || input.grossMinor <= 0)
      return fail(BillingErrors.amountInvalid());
    return ok(
      new Charge({
        id: input.id,
        organizationId: input.organizationId,
        number: input.number,
        patientId: input.patientId,
        origin: input.origin,
        appointmentId: input.appointmentId ?? null,
        packageId: input.packageId ?? null,
        serviceId: input.serviceId ?? null,
        description: input.description ?? null,
        professionalId: input.professionalId ?? null,
        unitId: input.unitId,
        currency: input.currency,
        grossMinor: input.grossMinor,
        discount: null,
        discountMinor: 0,
        discountReason: null,
        netMinor: input.grossMinor,
        paidMinor: 0,
        status: "OPEN",
        cancelledAt: null,
        cancelledById: null,
        cancelReason: null,
        createdById: input.createdById,
        version: 0,
        createdAt: input.now,
        payments: [],
        pendingRequest: null,
      }),
    );
  }

  get snapshot(): Readonly<ChargeProps> {
    return this.props;
  }

  get id(): string {
    return this.props.id;
  }

  get balanceMinor(): number {
    return this.props.netMinor - this.props.paidMinor;
  }

  // PRD F09: the check-in undo removes the charge only while no payment was ever recorded.
  // Called by the repository once the row (and the pending changes) were written.
  markPersisted(version: number): void {
    this.props.version = version;
    this.changes.length = 0;
  }

  get canBeDeletedOnUndo(): boolean {
    return this.props.payments.length === 0;
  }

  private refreshStatus(): void {
    this.props.status = deriveStatus({
      netMinor: this.props.netMinor,
      paidMinor: this.props.paidMinor,
      hasPendingDiscount: this.props.pendingRequest !== null,
      cancelled: this.props.cancelledAt !== null,
    });
  }

  private applyDiscountAmounts(discount: DiscountInput | null, reason: string | null): void {
    const amount = discount ? discountMinor(this.props.grossMinor, discount) : 0;
    this.props.discount = discount;
    this.props.discountMinor = amount;
    this.props.discountReason = discount ? trimmed(reason) || null : null;
    this.props.netMinor = this.props.grossMinor - amount;
  }

  private withdrawPending(now: Date, byUserId: string): void {
    const pending = this.props.pendingRequest;
    if (!pending) return;
    const withdrawn: DiscountRequestRecord = {
      ...pending,
      status: "WITHDRAWN",
      decidedById: byUserId,
      decidedAt: now,
    };
    this.props.pendingRequest = null;
    this.changes.push({ type: "REQUEST_UPDATED", request: withdrawn });
  }

  private guardDiscountChange(): Result<void> {
    if (this.props.cancelledAt) return fail(BillingErrors.chargeCancelled());
    // PRD F09 (interview): payments never depend on a discount that may change.
    if (this.props.payments.length > 0) return fail(BillingErrors.discountLocked());
    return ok(undefined);
  }

  // Sets, replaces or removes the discount. Above 20% it is applied at once when the actor may
  // approve or brings an approver (PIN), otherwise only when the actor sends it for approval.
  setDiscount(input: {
    discount: DiscountInput | null;
    reason: string | null;
    actor: { userId: string; canApprove: boolean };
    approverUserId?: string | null;
    submitForApproval?: boolean;
    requestId: string;
    now: Date;
  }): Result<{ request: DiscountRequestRecord | null }> {
    const guard = this.guardDiscountChange();
    if (!guard.ok) return guard;
    const { discount, actor, now } = input;

    if (!discount) {
      this.withdrawPending(now, actor.userId);
      this.applyDiscountAmounts(null, null);
      this.refreshStatus();
      return ok({ request: null });
    }
    if (!isValidDiscount(this.props.grossMinor, discount)) return fail(BillingErrors.discountInvalid());
    const amount = discountMinor(this.props.grossMinor, discount);
    if (needsReason(this.props.grossMinor, amount) && !hasReason(input.reason)) {
      return fail(BillingErrors.discountReasonRequired());
    }

    const reason = trimmed(input.reason) || null;
    if (!needsApproval(this.props.grossMinor, amount)) {
      this.withdrawPending(now, actor.userId);
      this.applyDiscountAmounts(discount, reason);
      this.refreshStatus();
      return ok({ request: null });
    }

    const request: DiscountRequestRecord = {
      id: input.requestId,
      kind: discount.kind,
      value: discount.value,
      discountMinor: amount,
      reason,
      status: "PENDING",
      method: null,
      requestedById: actor.userId,
      requestedAt: now,
      decidedById: null,
      decidedAt: null,
      rejectionReason: null,
    };
    if (actor.canApprove || input.approverUserId) {
      this.withdrawPending(now, actor.userId);
      const approved: DiscountRequestRecord = {
        ...request,
        status: "APPROVED",
        method: actor.canApprove ? "ROLE" : "PIN",
        decidedById: actor.canApprove ? actor.userId : (input.approverUserId ?? actor.userId),
        decidedAt: now,
      };
      this.applyDiscountAmounts(discount, reason);
      this.changes.push({ type: "REQUEST_ADDED", request: approved });
      this.refreshStatus();
      return ok({ request: approved });
    }
    if (input.submitForApproval) {
      this.withdrawPending(now, actor.userId);
      this.props.pendingRequest = request;
      this.changes.push({ type: "REQUEST_ADDED", request });
      this.refreshStatus();
      return ok({ request });
    }
    return fail(BillingErrors.discountNeedsApproval());
  }

  // Approving from the pending list (PRD F09). The discount of the request becomes the charge's.
  approvePending(input: { decidedById: string; now: Date }): Result<{ request: DiscountRequestRecord }> {
    const pending = this.props.pendingRequest;
    if (!pending) return fail(BillingErrors.noPendingDiscount());
    const approved: DiscountRequestRecord = {
      ...pending,
      status: "APPROVED",
      method: "LIST",
      decidedById: input.decidedById,
      decidedAt: input.now,
    };
    this.props.pendingRequest = null;
    this.applyDiscountAmounts({ kind: pending.kind, value: pending.value }, pending.reason);
    this.changes.push({ type: "REQUEST_UPDATED", request: approved });
    this.refreshStatus();
    return ok({ request: approved });
  }

  // PRD F09 (interview): a rejection needs a reason, removes the discount and reopens the charge.
  rejectPending(input: {
    decidedById: string;
    reason: string;
    now: Date;
  }): Result<{ request: DiscountRequestRecord }> {
    const pending = this.props.pendingRequest;
    if (!pending) return fail(BillingErrors.noPendingDiscount());
    if (!hasReason(input.reason)) return fail(BillingErrors.reasonRequired());
    const rejected: DiscountRequestRecord = {
      ...pending,
      status: "REJECTED",
      decidedById: input.decidedById,
      decidedAt: input.now,
      rejectionReason: trimmed(input.reason),
    };
    this.props.pendingRequest = null;
    this.applyDiscountAmounts(null, null);
    this.changes.push({ type: "REQUEST_UPDATED", request: rejected });
    this.refreshStatus();
    return ok({ request: rejected });
  }

  // One submission of the receive modal: all lines or none. Overpayment is refused (PRD F09).
  registerPayments(input: {
    lines: PaymentLine[];
    unitId: string;
    userId: string;
    submissionId: string;
    receivedAt: Date;
    now: Date;
    paymentIds: string[];
  }): Result<PaymentRecord[]> {
    if (this.props.cancelledAt) return fail(BillingErrors.chargeCancelled());
    if (this.props.pendingRequest) return fail(BillingErrors.discountPendingApproval());
    if (this.balanceMinor <= 0) return fail(BillingErrors.chargeAlreadyPaid());
    if (
      input.lines.length === 0 ||
      input.lines.some((line) => !Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0)
    ) {
      return fail(BillingErrors.amountInvalid());
    }
    const total = input.lines.reduce((sum, line) => sum + line.amountMinor, 0);
    if (total > this.balanceMinor) {
      return fail(BillingErrors.paymentExceedsBalance(total, this.balanceMinor, this.props.currency));
    }
    const records = input.lines.map<PaymentRecord>((line, index) => ({
      id: input.paymentIds[index] ?? "",
      kind: "PAYMENT",
      refundedPaymentId: null,
      submissionId: input.submissionId,
      method: line.method,
      installments: line.installments,
      amountMinor: line.amountMinor,
      refundedMinor: 0,
      unitId: input.unitId,
      receivedAt: input.receivedAt,
      recordedAt: input.now,
      userId: input.userId,
      reason: null,
    }));
    this.props.payments.push(...records);
    this.props.paidMinor += total;
    for (const payment of records) this.changes.push({ type: "PAYMENT_ADDED", payment });
    this.refreshStatus();
    return ok(records);
  }

  // PRD F09: a negative movement dated today; the original payment is kept.
  refund(input: {
    paymentId: string;
    amountMinor: number | null;
    reason: string;
    unitId: string;
    userId: string;
    now: Date;
    refundId: string;
  }): Result<PaymentRecord> {
    const original = this.props.payments.find(
      (payment) => payment.id === input.paymentId && payment.kind === "PAYMENT",
    );
    if (!original) return fail(BillingErrors.paymentNotFound());
    if (!hasReason(input.reason)) return fail(BillingErrors.reasonRequired());
    const available = original.amountMinor - original.refundedMinor;
    if (available <= 0) return fail(BillingErrors.notRefundable());
    const amount = input.amountMinor ?? available;
    if (!Number.isSafeInteger(amount) || amount <= 0) return fail(BillingErrors.amountInvalid());
    if (amount > available) {
      return fail(BillingErrors.refundExceeds(amount, available, this.props.currency));
    }
    const refund: PaymentRecord = {
      id: input.refundId,
      kind: "REFUND",
      refundedPaymentId: original.id,
      submissionId: null,
      method: original.method,
      installments: null,
      amountMinor: -amount,
      refundedMinor: 0,
      unitId: input.unitId,
      receivedAt: input.now,
      recordedAt: input.now,
      userId: input.userId,
      reason: trimmed(input.reason),
    };
    original.refundedMinor += amount;
    this.props.payments.push(refund);
    this.props.paidMinor -= amount;
    this.changes.push({
      type: "PAYMENT_REFUNDED",
      paymentId: original.id,
      refundedMinor: original.refundedMinor,
    });
    this.changes.push({ type: "PAYMENT_ADDED", payment: refund });
    this.refreshStatus();
    return ok(refund);
  }

  // PRD F09: only without active payments (everything refunded counts as none), with a reason.
  void(input: { reason: string; userId: string; now: Date }): Result<void> {
    if (this.props.cancelledAt) return fail(BillingErrors.chargeCancelled());
    if (this.props.paidMinor > 0) return fail(BillingErrors.chargeHasPayments());
    if (!hasReason(input.reason)) return fail(BillingErrors.reasonRequired());
    this.withdrawPending(input.now, input.userId);
    this.props.cancelledAt = input.now;
    this.props.cancelledById = input.userId;
    this.props.cancelReason = trimmed(input.reason);
    this.refreshStatus();
    return ok(undefined);
  }
}
