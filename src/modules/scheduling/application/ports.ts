import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { Appointment, AppointmentProps } from "../domain/appointment";
import type { ExistingAppointment } from "../domain/conflicts/types";
import type { SeriesFrequency } from "../domain/recurrence";
import type { AppointmentStatus } from "../domain/status";

// Ports of the scheduling module (rich tier, architecture section 4). Repositories are
// implemented with Prisma in ../infrastructure; the directory reads the public APIs of the
// modules F06 consumes (PRD F06 Consumes), wired in ../index.ts.

// Who writes: the organization fills the tenant column, the user the author columns.
export type Actor = { userId: string; organizationId: string };

export type SaveOutcome = "OK" | "STALE" | "SLOT_TAKEN";

export type AppointmentRecord = AppointmentProps & {
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OverlapQuery = {
  from: Date;
  to: Date;
  professionalIds?: string[];
  roomIds?: string[];
  patientIds?: string[];
};

export type AppointmentFilter = {
  unitId?: string;
  from?: Date;
  to?: Date;
  professionalIds?: string[];
  roomIds?: string[];
  serviceIds?: string[];
  patientId?: string;
  statuses?: AppointmentStatus[];
  updatedSince?: Date;
};

export interface AppointmentRepository {
  findById(uow: UnitOfWork, id: string): Promise<Appointment | null>;
  findRecord(uow: UnitOfWork, id: string): Promise<AppointmentRecord | null>;
  // Inserts or updates (version check) the aggregate with its pending history rows. A violated
  // exclusion constraint (SQLSTATE 23P01) is SLOT_TAKEN (ADR-026).
  save(uow: UnitOfWork, appointment: Appointment, actor: Actor): Promise<SaveOutcome>;
  // Appointments of these professionals, rooms or patients overlapping [from, to), any status.
  findOverlapping(
    uow: UnitOfWork,
    query: OverlapQuery,
  ): Promise<Omit<ExistingAppointment, "professionalName">[]>;
  list(
    uow: UnitOfWork,
    filter: AppointmentFilter,
    page: { skip: number; take: number; newestFirst?: boolean } | null,
  ): Promise<{ items: AppointmentRecord[]; total: number }>;
  seriesOccurrences(uow: UnitOfWork, seriesId: string): Promise<Appointment[]>;
  statusHistory(uow: UnitOfWork, appointmentId: string): Promise<StatusHistoryRow[]>;
  rescheduleHistory(uow: UnitOfWork, appointmentId: string): Promise<RescheduleHistoryRow[]>;
}

export type StatusHistoryRow = {
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  changedAt: Date;
  changedById: string;
  justification: string | null;
};

export type RescheduleHistoryRow = {
  previousStartsAt: Date;
  previousEndsAt: Date;
  previousProfessionalId: string;
  previousRoomId: string | null;
  previousStatus: AppointmentStatus;
  source: string;
  rescheduledAt: Date;
  rescheduledById: string;
};

export type SeriesRecord = {
  id: string;
  unitId: string;
  professionalId: string;
  serviceId: string;
  patientId: string;
  roomId: string | null;
  frequency: SeriesFrequency;
  weekdays: number[];
  startMinute: number;
  durationMinutes: number;
  firstDate: string;
  endsOn: string | null;
  occurrenceCount: number | null;
  endsAfterIndex: number | null;
  previousSeriesId: string | null;
  version: number;
};

export interface SeriesRepository {
  find(uow: UnitOfWork, id: string): Promise<SeriesRecord | null>;
  create(uow: UnitOfWork, series: SeriesRecord, actor: Actor): Promise<void>;
  endAfter(uow: UnitOfWork, id: string, index: number): Promise<void>;
}

// --- Data from the modules F06 consumes -------------------------------------------------------

export type LocalInterval = { start: number; end: number };

export type UnitInfo = {
  id: string;
  name: string;
  country: CountryCode;
  currency: Currency;
  timeZone: string;
  active: boolean;
  businessHours: Map<number, LocalInterval[]>;
  closures: { startsOn: string; endsOn: string; reason: string }[];
  rooms: { id: string; name: string; active: boolean }[];
};

export type ServiceInfo = {
  id: string;
  name: string;
  durationMinutes: number;
  prices: { currency: Currency; amountMinor: number }[];
  color: string;
  requiresRoom: boolean;
  active: boolean;
};

export type AllowedRoomsInfo =
  { requiresRoom: false } | { requiresRoom: true; rooms: "any" | { id: string; name: string }[] };

export type ProfessionalInfo = { id: string; displayName: string; color: string; active: boolean };

export type WorkingCalendarInfo = {
  // Intervals per local date for each unit.
  days: { date: string; units: { unitId: string; intervals: LocalInterval[] }[] }[];
  timeOffs: { startsAt: Date; endsAt: Date; type: string }[];
};

export type PatientInfo = { id: string; displayName: string; mobilePhone: string; active: boolean };

export type OrganizationInfo = {
  name: string;
  timeZone: string;
  granularity: number;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
};

export interface SchedulingDirectory {
  organization(ctx: RequestContext): Promise<OrganizationInfo>;
  unit(ctx: RequestContext, unitId: string): Promise<UnitInfo | null>;
  listUnits(ctx: RequestContext): Promise<{ id: string; name: string; timeZone: string; active: boolean }[]>;
  services(ctx: RequestContext, serviceIds: string[]): Promise<ServiceInfo[]>;
  allowedRooms(ctx: RequestContext, serviceId: string, unitId: string): Promise<AllowedRoomsInfo | null>;
  rooms(
    ctx: RequestContext,
    roomIds: string[],
  ): Promise<{ id: string; name: string; active: boolean; unitId: string }[]>;
  isServiceEnabled(ctx: RequestContext, professionalId: string, serviceId: string): Promise<boolean>;
  bookableProfessionals(
    ctx: RequestContext,
    options: { serviceId?: string; unitId?: string },
  ): Promise<ProfessionalInfo[]>;
  professionals(ctx: RequestContext, ids?: string[]): Promise<ProfessionalInfo[]>;
  // At most 62 days per call (spec F04 section 5); the loader splits longer windows.
  workingCalendar(
    ctx: RequestContext,
    professionalId: string,
    range: { from: string; to: string },
  ): Promise<WorkingCalendarInfo | null>;
  patients(ctx: RequestContext, patientIds: string[]): Promise<PatientInfo[]>;
  userNames(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
}

// The printable daily agenda (PRD F06 Full Scope), rendered by the shared PDF base (ADR-024).
export type DailyAgendaDocument = {
  clinicName: string;
  logo: OrganizationInfo["logo"];
  professionalName: string;
  // Every text of the page, written in the language of the requester.
  labels: {
    title: string;
    subtitle: string;
    generated: string;
    page: string;
    empty: string;
    columns: [string, string, string, string, string, string, string];
  };
  rows: {
    time: string;
    patient: string;
    phone: string;
    service: string;
    room: string;
    status: string;
    notes: string;
  }[];
};

export interface AgendaPdfRenderer {
  render(document: DailyAgendaDocument): Promise<Buffer>;
}

// State of the clinical note of an appointment, provided by clinical-records (F07). Until F07 is
// registered the default knows no notes, so the agenda shows no reminder (ADR-007, ADR-022).
export type ClinicalNoteState = "DRAFT" | "FINALIZED";

export interface ClinicalNoteLookup {
  // Only the state, never the content. A draft is reported to its author only.
  noteStates(
    organizationId: string,
    appointmentIds: string[],
    viewerUserId: string,
  ): Promise<Map<string, ClinicalNoteState>>;
}

export type SchedulingDeps = {
  appointments: AppointmentRepository;
  series: SeriesRepository;
  directory: SchedulingDirectory;
  pdf: AgendaPdfRenderer;
  clinicalNotes: () => ClinicalNoteLookup;
  clock: () => Date;
};
