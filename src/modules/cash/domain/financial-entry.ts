import { fail, ok, type Result } from "@/shared/kernel/result";
import { CashErrors } from "./errors";
import { REASON_MIN_LENGTH } from "./limits";

export type EntryKind = "EXPENSE" | "REVENUE";
export type EntryStatus = "PENDING" | "PAID";

export type EntryProps = {
  id: string;
  organizationId: string;
  kind: EntryKind;
  description: string;
  categoryId: string;
  unitId: string | null;
  currency: string;
  amountMinor: number;
  dueDate: string;
  status: EntryStatus;
  seriesId: string | null;
  occurrenceIndex: number | null;
  attachmentId: string | null;
  deletedAt: Date | null;
  deletedById: string | null;
  createdById: string;
  version: number;
};

export type EntryPaymentRecord = {
  id: string;
  paidOn: string;
  method: string;
  amountMinor: number;
  currency: string;
  recordedById: string;
  recordedAt: Date;
};

export type EntryEditable = Pick<
  EntryProps,
  "description" | "categoryId" | "unitId" | "currency" | "amountMinor" | "dueDate" | "attachmentId"
>;

const trimmed = (text: string | null | undefined) => (text ?? "").trim();

// An expense or a manual revenue (PRD F11). Only a pending entry is edited or deleted; a paid one
// only has its payment reversed, with a reason, and the history is kept.
export class FinancialEntry {
  // The payment to insert and the reversal to apply, saved by the repository.
  newPayment: EntryPaymentRecord | null = null;
  reversal: { reason: string; userId: string; at: Date } | null = null;
  private props: EntryProps;

  private constructor(props: EntryProps) {
    this.props = { ...props };
  }

  static rehydrate(props: EntryProps): FinancialEntry {
    return new FinancialEntry(props);
  }

  static create(input: Omit<EntryProps, "status" | "deletedAt" | "deletedById" | "version">): FinancialEntry {
    return new FinancialEntry({
      ...input,
      description: trimmed(input.description),
      status: "PENDING",
      deletedAt: null,
      deletedById: null,
      version: 0,
    });
  }

  get snapshot(): Readonly<EntryProps> {
    return this.props;
  }

  get isPaid(): boolean {
    return this.props.status === "PAID";
  }

  markPersisted(version: number): void {
    this.props.version = version;
    this.newPayment = null;
    this.reversal = null;
  }

  edit(changes: EntryEditable): Result<void> {
    if (this.isPaid) return fail(CashErrors.entryPaid());
    this.props = { ...this.props, ...changes, description: trimmed(changes.description) };
    return ok(undefined);
  }

  // The payment date and method are the user's; the amount is the entry amount.
  pay(input: { paymentId: string; paidOn: string; method: string; userId: string; now: Date }): Result<void> {
    if (this.isPaid) return fail(CashErrors.entryPaid());
    this.props.status = "PAID";
    this.newPayment = {
      id: input.paymentId,
      paidOn: input.paidOn,
      method: input.method,
      amountMinor: this.props.amountMinor,
      currency: this.props.currency,
      recordedById: input.userId,
      recordedAt: input.now,
    };
    return ok(undefined);
  }

  // PRD F11: a paid entry is reversed with a reason and goes back to pending.
  reversePayment(input: { reason: string; userId: string; now: Date }): Result<void> {
    if (!this.isPaid) return fail(CashErrors.entryNotPaid());
    if (trimmed(input.reason).length < REASON_MIN_LENGTH) return fail(CashErrors.reasonRequired());
    this.props.status = "PENDING";
    this.reversal = { reason: trimmed(input.reason), userId: input.userId, at: input.now };
    return ok(undefined);
  }

  // PRD F11: only while pending ("a pagar"); soft delete, the row stays.
  softDelete(input: { userId: string; now: Date }): Result<void> {
    if (this.isPaid) return fail(CashErrors.entryPaid());
    this.props.deletedAt = input.now;
    this.props.deletedById = input.userId;
    return ok(undefined);
  }
}

// PRD F11: overdue = unpaid and past the due date (today in the unit time zone).
export function isOverdue(
  entry: { status: EntryStatus; dueDate: string; deletedAt?: Date | null },
  today: string,
): boolean {
  return entry.status === "PENDING" && !entry.deletedAt && entry.dueDate < today;
}
