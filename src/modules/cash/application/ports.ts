import type { PaymentRow } from "@/modules/billing";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import type { Result } from "@/shared/kernel/result";
import type { CashRegister, ClosingRecord, ReopeningRecord } from "../domain/cash-register";
import type { EntryKind, FinancialEntry, EntryProps } from "../domain/financial-entry";

// Ports of the cash module (rich tier, architecture section 4). The repositories are implemented
// with Prisma in ../infrastructure; the directory reads the public APIs of the modules F11
// consumes; the billing gateway wraps the read of payments (ADR-036).

export type CategoryKind = "EXPENSE" | "REVENUE" | "TRANSFER";

export type CategoryRecord = {
  id: string;
  kind: CategoryKind;
  name: string;
  system: boolean;
  active: boolean;
};

export type MovementRecord = {
  id: string;
  registerId: string;
  direction: "IN" | "OUT";
  amountMinor: number;
  currency: string;
  description: string;
  categoryId: string;
  categoryName: string;
  attachmentId: string | null;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
};

export type StoredClosing = ClosingRecord & { registerId: string };
export type StoredReopening = ReopeningRecord & { registerId: string };

export type EntryRecord = EntryProps & {
  categoryName: string;
  paidOn: string | null;
  paymentMethod: string | null;
  attachmentName: string | null;
};

export type EntryFilter = {
  kind: EntryKind;
  from: string | null;
  to: string | null;
  categoryId: string | null;
  // "ALL", "GENERAL" (no unit) or a unit id.
  unit: string;
  status: "PENDING" | "PAID" | "OVERDUE" | null;
  today: string;
};

export type SeriesRecord = {
  id: string;
  kind: EntryKind;
  description: string;
  categoryId: string;
  unitId: string | null;
  currency: string;
  amountMinor: number;
  firstDueDate: string;
  active: boolean;
};

export interface RegisterRepository {
  findById(uow: UnitOfWork, registerId: string, options: { lock: boolean }): Promise<CashRegister | null>;
  findByUnitDay(
    uow: UnitOfWork,
    unitId: string,
    businessDate: string,
    options: { lock: boolean },
  ): Promise<CashRegister | null>;
  // INSERT ... ON CONFLICT DO NOTHING on (unit, day); "EXISTS" when the day already had a register.
  insertIfAbsent(uow: UnitOfWork, register: CashRegister): Promise<"INSERTED" | "EXISTS">;
  // Status, flag and version with the version check, plus the new closing or reopening.
  save(uow: UnitOfWork, register: CashRegister): Promise<"OK" | "STALE">;
  // Counted cash of the last closing of the unit's latest closed register before `businessDate`.
  lastCounted(uow: UnitOfWork, unitId: string, businessDate: string): Promise<number | null>;
  closings(uow: UnitOfWork, registerId: string): Promise<StoredClosing[]>;
  reopenings(uow: UnitOfWork, registerId: string): Promise<StoredReopening[]>;
  movements(uow: UnitOfWork, registerId: string): Promise<MovementRecord[]>;
  findMovement(
    uow: UnitOfWork,
    movementId: string,
    options: { lock: boolean },
  ): Promise<MovementRecord | null>;
  insertMovement(
    uow: UnitOfWork,
    organizationId: string,
    movement: Omit<MovementRecord, "categoryName" | "reversedAt" | "reversedById" | "reversalReason">,
  ): Promise<void>;
  reverseMovement(
    uow: UnitOfWork,
    movementId: string,
    reversal: { reason: string; userId: string; at: Date },
  ): Promise<void>;
  // Open registers of earlier days in a unit (the banner) and across units (the job).
  unclosedBefore(
    uow: UnitOfWork,
    unitId: string,
    businessDate: string,
  ): Promise<{ id: string; businessDate: string }[]>;
  openBefore(uow: UnitOfWork, unitId: string, businessDate: string): Promise<string[]>;
  // Whether the unit has registers or entries (blocks changing its country, PRD F16).
  hasAnyInUnit(organizationId: string, unitId: string): Promise<boolean>;
}

export interface EntryRepository {
  findById(uow: UnitOfWork, entryId: string, options: { lock: boolean }): Promise<FinancialEntry | null>;
  insert(uow: UnitOfWork, entry: FinancialEntry): Promise<void>;
  // Fields, status and version with the version check, plus the new payment, the reversal and the delete.
  save(uow: UnitOfWork, entry: FinancialEntry): Promise<"OK" | "STALE">;
  list(uow: UnitOfWork, filter: EntryFilter): Promise<EntryRecord[]>;
  insertSeries(
    uow: UnitOfWork,
    organizationId: string,
    series: SeriesRecord & { createdById: string },
  ): Promise<void>;
  findSeries(uow: UnitOfWork, seriesId: string, options: { lock: boolean }): Promise<SeriesRecord | null>;
  seriesIndexes(uow: UnitOfWork, seriesId: string): Promise<number[]>;
  activeSeries(uow: UnitOfWork): Promise<SeriesRecord[]>;
  updateSeries(uow: UnitOfWork, seriesId: string, patch: Partial<SeriesRecord>): Promise<void>;
  // Ends a series and soft deletes its pending occurrences due from `fromDate` on; returns how many.
  endSeries(uow: UnitOfWork, seriesId: string, userId: string, now: Date, fromDate: string): Promise<number>;
  // Pending occurrences of a series due from `fromDate` on, in due-date order (scope "following").
  followingPending(uow: UnitOfWork, seriesId: string, fromDate: string): Promise<string[]>;
}

export interface CashReads {
  categories(uow: UnitOfWork): Promise<CategoryRecord[]>;
  category(uow: UnitOfWork, categoryId: string): Promise<CategoryRecord | null>;
  // Paid entries of the window, one row per live payment, for the statement.
  paidEntries(
    uow: UnitOfWork,
    filter: {
      unitIds: string[] | null;
      includeGeneral: boolean;
      currency: string;
      from: string | null;
      to: string | null;
    },
  ): Promise<
    {
      id: string;
      kind: EntryKind;
      description: string;
      categoryName: string;
      amountMinor: number;
      paidOn: string;
      paymentId: string;
    }[]
  >;
  // Cash movements (not reversed, not transfers) of the window for the statement.
  statementMovements(
    uow: UnitOfWork,
    filter: { unitIds: string[]; currency: string; from: string | null; to: string | null },
  ): Promise<
    {
      id: string;
      direction: "IN" | "OUT";
      description: string;
      categoryName: string;
      amountMinor: number;
      businessDate: string;
      createdAt: Date;
    }[]
  >;
  // The first record of the organization is not needed: "before the period" is an open window.
  attachment(uow: UnitOfWork, attachmentId: string): Promise<AttachmentRecord | null>;
}

export type AttachmentRecord = {
  id: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: "PENDING" | "ATTACHED";
  uploadedById: string;
};

export type UnitInfo = {
  id: string;
  name: string;
  country: CountryCode;
  currency: Currency;
  timeZone: string;
  active: boolean;
};

export interface CashDirectory {
  units(ctx: RequestContext, options: { activeOnly: boolean }): Promise<UnitInfo[]>;
  unit(ctx: RequestContext, unitId: string): Promise<UnitInfo | null>;
  patientNames(ctx: RequestContext, patientIds: string[]): Promise<Map<string, string>>;
  userNames(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
}

export interface BillingGateway {
  payments(
    ctx: RequestContext,
    filter: { unitIds: string[] | null; currency: string | null; from: Date | null; to: Date | null },
  ): Promise<Result<PaymentRow[]>>;
}

export interface AttachmentStorage {
  presignUpload(objectKey: string, contentType: string, sizeBytes: number): Promise<string>;
  presignDownload(objectKey: string, fileName: string): Promise<string>;
  delete(objectKey: string): Promise<void>;
}

export type CashDeps = {
  registers: RegisterRepository;
  entries: EntryRepository;
  reads: CashReads;
  directory: CashDirectory;
  billing: BillingGateway;
  storage: AttachmentStorage;
  clock: () => Date;
  newId: () => string;
};

export type { ReopeningRecord, ClosingRecord };
