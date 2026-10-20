import { daysBetween } from "@/shared/kernel/calendar-date";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { PrivacyErrors } from "./errors";
import { LGPD_OVERDUE_DAYS } from "./limits";

// The LGPD request register (PRD F14 Capabilities, spec decision D10 and assumption 5).
export const REQUEST_TYPES = ["ACCESS", "CORRECTION", "ANONYMIZATION"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUESTER_KINDS = ["PATIENT", "GUARDIAN", "REPRESENTATIVE"] as const;
export type RequesterKind = (typeof REQUESTER_KINDS)[number];

export const REQUEST_STATUSES = ["PENDING", "PROCESSING", "FAILED", "COMPLETED", "LEGAL_RETENTION"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// A request is open until it is answered: a failed export still owes the patient an answer.
export const OPEN_STATUSES: readonly RequestStatus[] = ["PENDING", "PROCESSING", "FAILED"];

export function isOpenStatus(status: RequestStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

// Calendar days a request has been open, counted in the organization's zone (both dates local).
export function daysOpen(createdOn: string, today: string): number {
  return Math.max(0, daysBetween(createdOn, today));
}

// PRD F14: "pending for more than 15 days", so day 15 is not yet overdue and day 16 is.
export function isOverdue(status: RequestStatus, createdOn: string, today: string): boolean {
  return isOpenStatus(status) && daysOpen(createdOn, today) > LGPD_OVERDUE_DAYS;
}

export type LgpdRequestProps = {
  id: string;
  organizationId: string;
  patientId: string;
  type: RequestType;
  requestedBy: RequesterKind;
  description: string;
  status: RequestStatus;
  resolution: string | null;
  createdById: string;
  createdAt: Date;
  completedAt: Date | null;
  completedById: string | null;
  version: number;
};

// The status machine of a request:
// - ACCESS: PENDING → PROCESSING → COMPLETED or FAILED; FAILED → PROCESSING ("Tentar novamente");
//   a COMPLETED request may generate again and keeps its first completion date.
// - CORRECTION: PENDING → COMPLETED with a resolution.
// - ANONYMIZATION: PENDING → COMPLETED or LEGAL_RETENTION.
export class LgpdRequest {
  private props: LgpdRequestProps;

  private constructor(props: LgpdRequestProps) {
    this.props = { ...props };
  }

  static rehydrate(props: LgpdRequestProps): LgpdRequest {
    return new LgpdRequest(props);
  }

  static register(input: {
    id: string;
    organizationId: string;
    patientId: string;
    type: RequestType;
    requestedBy: RequesterKind;
    description: string;
    createdById: string;
    now: Date;
  }): LgpdRequest {
    return new LgpdRequest({
      id: input.id,
      organizationId: input.organizationId,
      patientId: input.patientId,
      type: input.type,
      requestedBy: input.requestedBy,
      description: input.description.trim(),
      status: "PENDING",
      resolution: null,
      createdById: input.createdById,
      createdAt: input.now,
      completedAt: null,
      completedById: null,
      version: 1,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get snapshot(): Readonly<LgpdRequestProps> {
    return { ...this.props };
  }

  isOpen(): boolean {
    return isOpenStatus(this.props.status);
  }

  // Starting an export (and "Tentar novamente" or "Gerar novamente"). The request becomes
  // PROCESSING unless it was already answered, in which case it stays COMPLETED.
  startExport(): Result<void> {
    if (this.props.type !== "ACCESS") return fail(PrivacyErrors.typeMismatch());
    if (this.props.status === "PROCESSING") return fail(PrivacyErrors.exportInProgress());
    if (this.props.status !== "COMPLETED") this.props.status = "PROCESSING";
    return ok(undefined);
  }

  // The export finished: the first success answers the request.
  exportSucceeded(now: Date): void {
    if (this.props.status === "COMPLETED") return;
    this.props.status = "COMPLETED";
    this.props.completedAt = now;
    this.props.completedById = null;
  }

  exportFailed(): void {
    if (this.props.status === "PROCESSING") this.props.status = "FAILED";
  }

  // "Concluir solicitação" of a correction request, with what was done.
  complete(input: { resolution: string; userId: string; now: Date }): Result<void> {
    if (this.props.type !== "CORRECTION") return fail(PrivacyErrors.typeMismatch());
    if (!this.isOpen()) return fail(PrivacyErrors.requestClosed());
    this.props.status = "COMPLETED";
    this.props.resolution = input.resolution.trim();
    this.props.completedAt = input.now;
    this.props.completedById = input.userId;
    return ok(undefined);
  }

  // An anonymization request is answered either by the anonymization or by legal retention.
  private closeAnonymization(
    status: "COMPLETED" | "LEGAL_RETENTION",
    userId: string,
    now: Date,
  ): Result<void> {
    if (this.props.type !== "ANONYMIZATION") return fail(PrivacyErrors.typeMismatch());
    if (!this.isOpen()) return fail(PrivacyErrors.requestClosed());
    this.props.status = status;
    this.props.completedAt = now;
    this.props.completedById = userId;
    return ok(undefined);
  }

  registerRetention(userId: string, now: Date): Result<void> {
    return this.closeAnonymization("LEGAL_RETENTION", userId, now);
  }

  completeAnonymization(userId: string, now: Date): Result<void> {
    return this.closeAnonymization("COMPLETED", userId, now);
  }
}
