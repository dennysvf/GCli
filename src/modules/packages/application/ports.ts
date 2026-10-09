import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import type { Result } from "@/shared/kernel/result";
import type { SessionPackage } from "../domain/package";

// Ports of the packages module (rich tier, architecture section 4). The repository is implemented
// with Prisma in ../infrastructure; the directory reads the public APIs of the modules F10
// consumes; the billing gateway wraps the functions that run in the sale's own transaction.

export type LinkStatus = "LINKED" | "DEBITED" | "RELEASED" | "UNLINKED_EXPIRED" | "UNLINKED_CANCELLED";

export type LinkRecord = {
  id: string;
  packageId: string;
  appointmentId: string;
  status: LinkStatus;
  flagged: boolean;
  linkedAt: Date;
  debitedAt: Date | null;
  closedAt: Date | null;
};

export interface PackageRepository {
  // Loads the aggregate with the number of open links. `lock` takes the row lock that serializes
  // links, debits and the expiration of one package.
  findById(uow: UnitOfWork, packageId: string, options: { lock: boolean }): Promise<SessionPackage | null>;
  // The live link (linked or debited) of an appointment, with its package locked.
  findByAppointment(
    uow: UnitOfWork,
    appointmentId: string,
    options: { lock: boolean },
  ): Promise<{ pkg: SessionPackage; link: LinkRecord } | null>;
  insert(uow: UnitOfWork, pkg: SessionPackage): Promise<void>;
  // Writes the counters, the status, the validity and the pending movements (version check).
  save(uow: UnitOfWork, pkg: SessionPackage): Promise<"OK" | "STALE">;
  addLink(uow: UnitOfWork, organizationId: string, link: LinkRecord): Promise<void>;
  updateLink(
    uow: UnitOfWork,
    linkId: string,
    patch: Partial<Pick<LinkRecord, "status" | "flagged" | "debitedAt" | "closedAt">>,
  ): Promise<void>;
  openLinks(uow: UnitOfWork, packageId: string): Promise<LinkRecord[]>;
  // Clears the front desk flag of an appointment that is checked in or cancelled.
  clearFlags(uow: UnitOfWork, appointmentId: string): Promise<void>;
  unitTimeZone(uow: UnitOfWork, unitId: string): Promise<string | null>;
  debitNoShow(uow: UnitOfWork): Promise<boolean>;
  // Active packages past their last day, per organization (worker).
  expirable(uow: UnitOfWork, today: string): Promise<string[]>;
}

export type UnitInfo = {
  id: string;
  name: string;
  country: CountryCode;
  currency: Currency;
  timeZone: string;
  active: boolean;
};

export type PatientInfo = { id: string; displayName: string };

export type ServiceInfo = {
  id: string;
  name: string;
  active: boolean;
  prices: { currency: string; amountMinor: number }[];
};

export type LinkedAppointmentInfo = {
  id: string;
  startsAt: string;
  professionalName: string;
  status: string;
  unitTimeZone: string;
};

export interface PackagesDirectory {
  patient(ctx: RequestContext, patientId: string): Promise<Result<PatientInfo>>;
  service(ctx: RequestContext, serviceId: string): Promise<ServiceInfo | null>;
  services(ctx: RequestContext, serviceIds: string[]): Promise<ServiceInfo[]>;
  activeServices(ctx: RequestContext): Promise<ServiceInfo[]>;
  unit(ctx: RequestContext, unitId: string): Promise<UnitInfo | null>;
  activeUnits(ctx: RequestContext): Promise<UnitInfo[]>;
  selectedUnitId(ctx: RequestContext): Promise<string | null>;
  appointments(ctx: RequestContext, appointmentIds: string[]): Promise<Map<string, LinkedAppointmentInfo>>;
  userNames(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
}

export type ChargeRef = {
  id: string;
  number: string;
  status: string;
  currency: string;
  netMinor: number;
  version: number;
};

// Billing (F09) inside the sale's transaction: the charge, its discount and its void.
export interface BillingGateway {
  createCharge(
    ctx: RequestContext,
    uow: UnitOfWork,
    input: {
      patientId: string;
      unitId: string;
      packageId: string;
      serviceId: string;
      grossMinor: number;
    },
  ): Promise<Result<ChargeRef>>;
  setDiscount(
    ctx: RequestContext,
    uow: UnitOfWork,
    input: {
      chargeId: string;
      discountMinor: number;
      reason: string | null;
      approverUserId: string | null;
      submitForApproval: boolean;
    },
  ): Promise<Result<{ status: string; netMinor: number }>>;
  voidCharge(
    ctx: RequestContext,
    uow: UnitOfWork,
    input: { chargeId: string; reason: string },
  ): Promise<Result<{ voided: boolean }>>;
  verifyApproval(
    ctx: RequestContext,
    approverUserId: string,
    pin: string,
  ): Promise<Result<{ approverUserId: string }>>;
  chargeStatuses(ctx: RequestContext, chargeIds: string[]): Promise<Map<string, string>>;
}

export type PackagesDeps = {
  packages: PackageRepository;
  directory: PackagesDirectory;
  billing: BillingGateway;
  clock: () => Date;
  newId: () => string;
};
