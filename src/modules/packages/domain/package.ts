import { fail, ok, type Result } from "@/shared/kernel/result";
import { PackageErrors } from "./errors";
import { MAX_EXTENDED_DAYS, REASON_MIN_LENGTH } from "./limits";
import { expiryDate, remainingExtension } from "./validity";

export type PackageStatus = "ACTIVE" | "EXPIRED" | "CANCELLED";

export type PackageProps = {
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
  priceMinor: number;
  soldOn: string;
  validityDays: number;
  extendedDays: number;
  expiresOn: string;
  status: PackageStatus;
  chargeId: string;
  soldById: string;
  closedAt: Date | null;
  closedById: string | null;
  closeReason: string | null;
  // Appointments linked and not yet debited or released (counted by the repository).
  openLinks: number;
  version: number;
};

export type MovementKind = "SALE" | "DEBIT" | "RESTORE" | "FORFEIT" | "EXTEND" | "CANCEL";

export type PackageMovement = {
  kind: MovementKind;
  sessions: number;
  days: number | null;
  reason: string | null;
  appointmentId: string | null;
  actorUserId: string | null;
  occurredAt: Date;
};

const trimmed = (text: string | null | undefined) => (text ?? "").trim();
const hasReason = (text: string | null | undefined) => trimmed(text).length >= REASON_MIN_LENGTH;

// The package aggregate (PRD F10). It owns the session balance and the validity; linking appointments
// and the audit around it belong to the use cases.
export class SessionPackage {
  readonly movements: PackageMovement[] = [];
  private props: PackageProps;

  private constructor(props: PackageProps) {
    this.props = { ...props };
  }

  static rehydrate(props: PackageProps): SessionPackage {
    return new SessionPackage(props);
  }

  static sell(input: {
    id: string;
    organizationId: string;
    patientId: string;
    templateId: string;
    name: string;
    serviceId: string;
    totalSessions: number;
    unitId: string;
    currency: string;
    priceMinor: number;
    soldOn: string;
    validityDays: number;
    chargeId: string;
    soldById: string;
    now: Date;
  }): SessionPackage {
    const pkg = new SessionPackage({
      id: input.id,
      organizationId: input.organizationId,
      patientId: input.patientId,
      templateId: input.templateId,
      name: input.name,
      serviceId: input.serviceId,
      totalSessions: input.totalSessions,
      usedSessions: 0,
      forfeitedSessions: 0,
      unitId: input.unitId,
      currency: input.currency,
      priceMinor: input.priceMinor,
      soldOn: input.soldOn,
      validityDays: input.validityDays,
      extendedDays: 0,
      expiresOn: expiryDate(input.soldOn, input.validityDays, 0),
      status: "ACTIVE",
      chargeId: input.chargeId,
      soldById: input.soldById,
      closedAt: null,
      closedById: null,
      closeReason: null,
      openLinks: 0,
      version: 0,
    });
    pkg.movements.push({
      kind: "SALE",
      sessions: input.totalSessions,
      days: null,
      reason: null,
      appointmentId: null,
      actorUserId: input.soldById,
      occurredAt: input.now,
    });
    return pkg;
  }

  get snapshot(): Readonly<PackageProps> {
    return this.props;
  }

  get id(): string {
    return this.props.id;
  }

  // Sessions neither debited nor forfeited.
  get remainingSessions(): number {
    return this.props.totalSessions - this.props.usedSessions - this.props.forfeitedSessions;
  }

  // Sessions that can still be linked to a new appointment.
  get freeSessions(): number {
    return this.remainingSessions - this.props.openLinks;
  }

  markPersisted(version: number): void {
    this.props.version = version;
    this.movements.length = 0;
  }

  setOpenLinks(count: number): void {
    this.props.openLinks = count;
  }

  // PRD F10 rules to link an appointment of `appointmentDate` (a local calendar date).
  canLink(appointmentDate: string): Result<void> {
    if (this.props.status === "EXPIRED") return fail(PackageErrors.expired(this.props.expiresOn));
    if (this.props.status !== "ACTIVE") return fail(PackageErrors.notActive());
    if (appointmentDate > this.props.expiresOn)
      return fail(PackageErrors.expiresBefore(this.props.expiresOn));
    if (this.freeSessions < 1) {
      return fail(PackageErrors.balanceExhausted(this.remainingSessions, this.props.openLinks));
    }
    return ok(undefined);
  }

  addLink(): void {
    this.props.openLinks += 1;
  }

  releaseLink(): void {
    this.props.openLinks = Math.max(0, this.props.openLinks - 1);
  }

  // The linked appointment was completed (or a no-show counts): one session is used. Idempotency is
  // the caller's: it only calls this for a link that was open.
  debit(input: { appointmentId: string; actorUserId: string | null; now: Date }): void {
    this.props.openLinks = Math.max(0, this.props.openLinks - 1);
    this.props.usedSessions += 1;
    this.movements.push({
      kind: "DEBIT",
      sessions: 1,
      days: null,
      reason: null,
      appointmentId: input.appointmentId,
      actorUserId: input.actorUserId,
      occurredAt: input.now,
    });
  }

  // The completion was reverted. While the package is active the link is open again; otherwise the
  // session is lost with the package.
  restore(input: { appointmentId: string; actorUserId: string | null; now: Date }): "LINKED" | "RELEASED" {
    this.props.usedSessions = Math.max(0, this.props.usedSessions - 1);
    this.movements.push({
      kind: "RESTORE",
      sessions: 1,
      days: null,
      reason: null,
      appointmentId: input.appointmentId,
      actorUserId: input.actorUserId,
      occurredAt: input.now,
    });
    if (this.props.status === "ACTIVE") {
      this.props.openLinks += 1;
      return "LINKED";
    }
    this.props.forfeitedSessions += 1;
    return "RELEASED";
  }

  // At the end of the validity the remaining sessions are forfeited (PRD F10).
  expire(input: { now: Date }): Result<{ forfeited: number }> {
    if (this.props.status !== "ACTIVE") return fail(PackageErrors.notActive());
    const forfeited = this.remainingSessions;
    this.props.forfeitedSessions += forfeited;
    this.props.status = "EXPIRED";
    this.props.openLinks = 0;
    this.props.closedAt = input.now;
    this.movements.push({
      kind: "FORFEIT",
      sessions: forfeited,
      days: null,
      reason: null,
      appointmentId: null,
      actorUserId: null,
      occurredAt: input.now,
    });
    return ok({ forfeited });
  }

  // PRD F10 (interview): up to 365 days in total, only while active, with a reason.
  extend(input: { days: number; reason: string; userId: string; now: Date }): Result<void> {
    if (this.props.status !== "ACTIVE") return fail(PackageErrors.notActive());
    if (!hasReason(input.reason)) return fail(PackageErrors.reasonRequired());
    const room = remainingExtension(this.props.extendedDays);
    if (!Number.isInteger(input.days) || input.days < 1 || input.days > Math.min(room, MAX_EXTENDED_DAYS)) {
      return fail(PackageErrors.extensionLimit(room));
    }
    this.props.extendedDays += input.days;
    this.props.expiresOn = expiryDate(this.props.soldOn, this.props.validityDays, this.props.extendedDays);
    this.movements.push({
      kind: "EXTEND",
      sessions: 0,
      days: input.days,
      reason: trimmed(input.reason),
      appointmentId: null,
      actorUserId: input.userId,
      occurredAt: input.now,
    });
    return ok(undefined);
  }

  // PRD F10: the remaining balance is zeroed. The open links are released by the use case.
  cancel(input: { reason: string; userId: string; now: Date }): Result<{ forfeited: number }> {
    if (this.props.status !== "ACTIVE") return fail(PackageErrors.notActive());
    if (!hasReason(input.reason)) return fail(PackageErrors.reasonRequired());
    const forfeited = this.remainingSessions;
    this.props.forfeitedSessions += forfeited;
    this.props.status = "CANCELLED";
    this.props.openLinks = 0;
    this.props.closedAt = input.now;
    this.props.closedById = input.userId;
    this.props.closeReason = trimmed(input.reason);
    this.movements.push({
      kind: "CANCEL",
      sessions: forfeited,
      days: null,
      reason: trimmed(input.reason),
      appointmentId: null,
      actorUserId: input.userId,
      occurredAt: input.now,
    });
    return ok({ forfeited });
  }
}
