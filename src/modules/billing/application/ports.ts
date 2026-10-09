import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { Locale } from "@/shared/i18n/locales";
import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import type { Result } from "@/shared/kernel/result";
import type { Charge, ChargeProps, DiscountRequestRecord } from "../domain/charge";

// Ports of the billing module (rich tier, architecture section 4). The repository is implemented
// with Prisma in ../infrastructure; the directory reads the public APIs of the modules F09
// consumes (PRD F09 Consumes); the exemption policy (F10) and the cash register gate (F11) are
// declared here and implemented by the modules that depend on billing (ADR-007, ADR-022).

export interface ChargeRepository {
  // Next "2026-000123" number of the organization, concurrency safe.
  nextNumber(uow: UnitOfWork, organizationId: string, now: Date): Promise<string>;
  insert(uow: UnitOfWork, charge: Charge): Promise<void>;
  // Loads the aggregate with its payments and its pending request. `lock` takes the row lock that
  // serializes payments, refunds and the check-in undo on one charge.
  findById(
    uow: UnitOfWork,
    organizationId: string,
    chargeId: string,
    options: { lock: boolean },
  ): Promise<Charge | null>;
  findLiveByAppointment(
    uow: UnitOfWork,
    organizationId: string,
    appointmentId: string,
    options: { lock: boolean },
  ): Promise<Charge | null>;
  // Writes the charge row (version check) and the changes the commands recorded.
  save(uow: UnitOfWork, charge: Charge): Promise<"OK" | "STALE">;
  delete(uow: UnitOfWork, chargeId: string): Promise<void>;
  findSubmission(uow: UnitOfWork, submissionId: string): Promise<{ chargeId: string } | null>;
  insertSubmission(
    uow: UnitOfWork,
    submission: { organizationId: string; id: string; chargeId: string; userId: string },
  ): Promise<void>;
}

export type ChargeFilter = {
  from?: Date;
  to?: Date;
  unitId?: string;
  statuses?: string[];
  professionalId?: string;
  method?: string;
  patientId?: string;
};

export type ChargeTotals = {
  currency: string;
  grossMinor: number;
  discountMinor: number;
  netMinor: number;
  paidMinor: number;
  balanceMinor: number;
};

// Read models for the lists and the approvals (cursor paging newest first).
export interface ChargeReads {
  listPending(uow: UnitOfWork): Promise<ChargeProps[]>;
  countPending(uow: UnitOfWork): Promise<number>;
  list(
    uow: UnitOfWork,
    filter: ChargeFilter,
    page: { cursor: { createdAt: Date; id: string } | null; take: number },
  ): Promise<{ items: ChargeProps[]; hasMore: boolean; totals: ChargeTotals[] }>;
  requestHistory(uow: UnitOfWork, chargeId: string): Promise<DiscountRequestRecord[]>;
  // Whether the unit has any charge or payment (blocks changing its country, PRD F16).
  hasAnyInUnit(organizationId: string, unitId: string): Promise<boolean>;
}

export type UnitInfo = {
  id: string;
  name: string;
  country: CountryCode;
  currency: Currency;
  timeZone: string;
  active: boolean;
  formattedAddress: string | null;
  phone: string | null;
};

export type PatientInfo = {
  id: string;
  displayName: string;
  document: { type: string; number: string } | null;
};

export type ServiceInfo = {
  id: string;
  name: string;
  active: boolean;
  prices: { currency: string; amountMinor: number }[];
};

export type OrganizationInfo = {
  name: string;
  taxId: string | null;
  country: CountryCode;
  defaultLocale: Locale;
  timeZone: string;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
};

export interface BillingDirectory {
  unit(ctx: RequestContext, unitId: string): Promise<UnitInfo | null>;
  activeUnits(ctx: RequestContext): Promise<UnitInfo[]>;
  selectedUnitId(ctx: RequestContext): Promise<string | null>;
  // Applies the F05 visibility policy; a patient the user cannot see is an error.
  patient(ctx: RequestContext, patientId: string): Promise<Result<PatientInfo>>;
  patientNames(ctx: RequestContext, patientIds: string[]): Promise<Map<string, string>>;
  service(ctx: RequestContext, serviceId: string): Promise<ServiceInfo | null>;
  activeServices(ctx: RequestContext): Promise<ServiceInfo[]>;
  serviceNames(ctx: RequestContext, serviceIds: string[]): Promise<Map<string, string>>;
  professionalNames(ctx: RequestContext, professionalIds: string[]): Promise<Map<string, string>>;
  activeProfessionals(ctx: RequestContext): Promise<{ id: string; name: string }[]>;
  userNames(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
  organization(ctx: RequestContext): Promise<OrganizationInfo>;
  approvers(ctx: RequestContext): Promise<{ id: string; name: string }[]>;
}

// Checks an approver's PIN in its own transaction (identity, F01 + F09).
export interface ApprovalVerifier {
  verify(
    ctx: RequestContext,
    approverUserId: string,
    pin: string,
  ): Promise<Result<{ approverUserId: string }>>;
}

// Packages (F10) implement this: appointments covered by a package create no charge. It answers
// false for "not exempt" and never throws for it (Liskov, architecture 11).
export interface ChargeExemptionPolicy {
  isExempt(
    uow: UnitOfWork,
    input: { organizationId: string; appointmentId: string; patientId: string; serviceId: string },
  ): Promise<boolean>;
}

// The cash register (F11) refuses movements on a closed day. Until it exists everything is open.
export interface CashRegisterGate {
  assertOpen(
    uow: UnitOfWork,
    input: { organizationId: string; unitId: string; unitName: string; at: Date },
  ): Promise<Result<void>>;
}

export type ReceiptLabels = {
  documentTitle: string;
  title: string;
  numberLabel: string;
  dateLabel: string;
  patientLabel: string;
  documentLabel: string;
  itemLabel: string;
  grossLabel: string;
  discountLabel: string;
  netLabel: string;
  paymentsTitle: string;
  refundsTitle: string;
  columns: { date: string; method: string; unit: string; amount: string };
  receivedLabel: string;
  balanceLabel: string;
  noPayments: string;
  footerNote: string;
  pageLabel: string;
  taxIdLabel: string;
  installmentsLabel: string;
};

export type ReceiptInput = {
  clinicName: string;
  taxId: string | null;
  logo: OrganizationInfo["logo"];
  unit: { name: string; address: string | null; phone: string | null };
  number: string;
  issuedAt: string;
  patient: { name: string; document: string | null };
  item: string;
  gross: string;
  discount: string | null;
  net: string;
  payments: { date: string; method: string; unit: string; amount: string }[];
  refunds: { date: string; method: string; unit: string; amount: string }[];
  received: string;
  balance: string;
  labels: ReceiptLabels;
};

export interface ReceiptRenderer {
  render(input: ReceiptInput): Promise<Buffer>;
}

export type BillingDeps = {
  charges: ChargeRepository;
  reads: ChargeReads;
  directory: BillingDirectory;
  approvals: ApprovalVerifier;
  exemptions: () => ChargeExemptionPolicy;
  cashRegister: () => CashRegisterGate;
  receipts: ReceiptRenderer;
  clock: () => Date;
  newId: () => string;
};
