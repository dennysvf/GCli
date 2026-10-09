import { daysBetween } from "@/shared/kernel/calendar-date";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { CashErrors } from "./errors";
import type { MethodTotals } from "./expected-cash";
import { MAX_PAST_OPEN_DAYS, REASON_MIN_LENGTH } from "./limits";

export type RegisterStatus = "OPEN" | "CLOSED";

export type RegisterProps = {
  id: string;
  organizationId: string;
  unitId: string;
  businessDate: string;
  currency: string;
  openingMinor: number;
  suggestedOpeningMinor: number;
  openingReason: string | null;
  status: RegisterStatus;
  flaggedUnclosed: boolean;
  flaggedAt: Date | null;
  openedById: string;
  openedAt: Date;
  version: number;
};

export type ClosingRecord = {
  id: string;
  sequence: number;
  expectedMinor: number;
  countedMinor: number;
  differenceMinor: number;
  justification: string | null;
  byMethod: MethodTotals[];
  movementsInMinor: number;
  movementsOutMinor: number;
  wasFlaggedUnclosed: boolean;
  closedById: string;
  closedAt: Date;
};

export type ReopeningRecord = {
  id: string;
  closingId: string;
  reason: string;
  reopenedById: string;
  reopenedAt: Date;
};

const trimmed = (text: string | null | undefined) => (text ?? "").trim();
const hasReason = (text: string | null | undefined) => trimmed(text).length >= REASON_MIN_LENGTH;

// Which dates a user may open (spec F11 section 3): the front desk only today, a manager also a
// past date up to a year back, and nobody a future date.
export function checkOpenDate(input: {
  businessDate: string;
  today: string;
  canOpenPast: boolean;
}): Result<void> {
  if (input.businessDate > input.today) return fail(CashErrors.futureDate());
  if (input.businessDate === input.today) return ok(undefined);
  if (!input.canOpenPast) return fail(CashErrors.dateNotAllowed());
  if (daysBetween(input.businessDate, input.today) > MAX_PAST_OPEN_DAYS)
    return fail(CashErrors.dateNotAllowed());
  return ok(undefined);
}

// The cash register aggregate (PRD F11). It owns the opening, the status and the closings; the
// payments are read from billing and the movements are kept beside it.
export class CashRegister {
  // Records added by the commands, saved by the repository and cleared by markPersisted.
  newClosing: ClosingRecord | null = null;
  newReopening: ReopeningRecord | null = null;
  private props: RegisterProps;

  private constructor(props: RegisterProps) {
    this.props = { ...props };
  }

  static rehydrate(props: RegisterProps): CashRegister {
    return new CashRegister(props);
  }

  // The opening balance can differ from the suggestion only with a reason (min 10 characters).
  static open(input: {
    id: string;
    organizationId: string;
    unitId: string;
    businessDate: string;
    currency: string;
    openingMinor: number;
    suggestedOpeningMinor: number;
    openingReason: string | null;
    openedById: string;
    now: Date;
  }): Result<CashRegister> {
    const changed = input.openingMinor !== input.suggestedOpeningMinor;
    if (changed && !hasReason(input.openingReason)) return fail(CashErrors.openingReasonRequired());
    return ok(
      new CashRegister({
        id: input.id,
        organizationId: input.organizationId,
        unitId: input.unitId,
        businessDate: input.businessDate,
        currency: input.currency,
        openingMinor: input.openingMinor,
        suggestedOpeningMinor: input.suggestedOpeningMinor,
        openingReason: changed ? trimmed(input.openingReason) : null,
        status: "OPEN",
        flaggedUnclosed: false,
        flaggedAt: null,
        openedById: input.openedById,
        openedAt: input.now,
        version: 0,
      }),
    );
  }

  get snapshot(): Readonly<RegisterProps> {
    return this.props;
  }

  get id(): string {
    return this.props.id;
  }

  get isOpen(): boolean {
    return this.props.status === "OPEN";
  }

  markPersisted(version: number): void {
    this.props.version = version;
    this.newClosing = null;
    this.newReopening = null;
  }

  // Movements and reversals are refused on a closed register (PRD F11).
  assertOpenForMovement(): Result<void> {
    return this.isOpen ? ok(undefined) : fail(CashErrors.registerClosed());
  }

  // PRD F11: a difference other than zero needs a justification of at least 10 characters. The
  // amount in the error is formatted in the unit's currency by the caller.
  close(input: {
    closingId: string;
    nextSequence: number;
    expectedMinor: number;
    countedMinor: number;
    justification: string | null;
    byMethod: MethodTotals[];
    movementsInMinor: number;
    movementsOutMinor: number;
    userId: string;
    now: Date;
    formatAmount: (minor: number) => string;
  }): Result<ClosingRecord> {
    if (!this.isOpen) return fail(CashErrors.registerClosed());
    const difference = input.countedMinor - input.expectedMinor;
    if (difference !== 0 && !hasReason(input.justification)) {
      return fail(CashErrors.differenceNeedsJustification(input.formatAmount(Math.abs(difference))));
    }
    const closing: ClosingRecord = {
      id: input.closingId,
      sequence: input.nextSequence,
      expectedMinor: input.expectedMinor,
      countedMinor: input.countedMinor,
      differenceMinor: difference,
      justification: difference === 0 ? null : trimmed(input.justification),
      byMethod: input.byMethod,
      movementsInMinor: input.movementsInMinor,
      movementsOutMinor: input.movementsOutMinor,
      wasFlaggedUnclosed: this.props.flaggedUnclosed,
      closedById: input.userId,
      closedAt: input.now,
    };
    this.props.status = "CLOSED";
    this.newClosing = closing;
    return ok(closing);
  }

  // PRD F11: only a closed register is reopened, with a reason. Both closings stay in history.
  reopen(input: {
    reopeningId: string;
    lastClosingId: string;
    reason: string;
    userId: string;
    now: Date;
  }): Result<ReopeningRecord> {
    if (this.isOpen) return fail(CashErrors.registerAlreadyOpen());
    if (!hasReason(input.reason)) return fail(CashErrors.reasonRequired());
    const record: ReopeningRecord = {
      id: input.reopeningId,
      closingId: input.lastClosingId,
      reason: trimmed(input.reason),
      reopenedById: input.userId,
      reopenedAt: input.now,
    };
    this.props.status = "OPEN";
    this.newReopening = record;
    return ok(record);
  }

  // PRD F11: a register still open on a later day is flagged "Não fechado"; it stays closable.
  flagUnclosed(today: string, now: Date): boolean {
    if (!this.isOpen || this.props.flaggedUnclosed || this.props.businessDate >= today) return false;
    this.props.flaggedUnclosed = true;
    this.props.flaggedAt = now;
    return true;
  }
}
