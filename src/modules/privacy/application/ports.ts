import type { NoteDetails } from "@/modules/clinical-records";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { Locale } from "@/shared/i18n/locales";
import type { Result } from "@/shared/kernel/result";
import type { TimelineCursor } from "../domain/cursor";
import type { AnonymizationFacts } from "../domain/eligibility";
import type { ExportErrorCode, LgpdExport } from "../domain/lgpd-export";
import type { LgpdRequest, RequestStatus, RequestType } from "../domain/lgpd-request";
import type { TimelineGroup, TimelineKind } from "../domain/timeline-event";

// Ports of the privacy module (spec F14 decision D22). The module reads the tables of other modules
// through read-only SQL in its infrastructure and changes their data only through their public
// functions (ADR-040).

// ---------------------------------------------------------------------------------------------
// Timeline

export type TimelineQuery = {
  organizationId: string;
  patientId: string;
  kinds: readonly TimelineKind[];
  // Clinical documents are left out in SQL for viewers without the F07 records access.
  clinicalDocuments: boolean;
  // Set when the viewer reads only their own agenda (F06): other appointments are left out.
  ownProfessionalId: string | null;
  // UTC window [from, to) of the chosen local period; null for no bound.
  from: Date | null;
  to: Date | null;
  cursor: TimelineCursor | null;
  limit: number;
  organizationTimeZone: string;
};

type ItemBase = {
  // "<kind>:<row id>", unique in the timeline.
  key: string;
  group: TimelineGroup;
  occurredAt: string;
  // Appointments, charges and payments in their unit's zone; the rest in the organization's.
  timeZone: string;
  authorName: string | null;
};

export type AppointmentHistoryLine = { toStatus: string; changedAt: string; changedByName: string | null };

export type TimelineItem =
  | (ItemBase & { kind: "PATIENT_REGISTERED" })
  | (ItemBase & { kind: "CONSENT_RECORDED"; termsVersion: number; method: string })
  | (ItemBase & {
      kind: "APPOINTMENT";
      appointmentId: string;
      status: string;
      serviceName: string;
      professionalName: string;
      unitName: string;
      roomName: string | null;
      isOverbooking: boolean;
      rescheduleCount: number;
      history: AppointmentHistoryLine[];
    })
  | (ItemBase & {
      kind: "CLINICAL_NOTE_FINALIZED";
      noteId: string;
      professionalName: string;
      serviceName: string | null;
      autoFinalized: boolean;
      addendaCount: number;
    })
  | (ItemBase & {
      kind: "CLINICAL_ADDENDUM_ADDED";
      noteId: string;
      addendumId: string;
      professionalName: string;
    })
  | (ItemBase & {
      kind: "DOCUMENT_UPLOADED" | "DOCUMENT_GENERATED";
      documentId: string;
      title: string;
      categoryName: string;
      clinical: boolean;
      archived: boolean;
      erased: boolean;
    })
  | (ItemBase & {
      kind: "CHARGE_CREATED";
      chargeId: string;
      number: string;
      origin: string;
      itemName: string | null;
      // Integer minor units as text (ADR-029): JSON has no 64-bit integers.
      netMinor: string;
      currency: string;
      status: string;
    })
  | (ItemBase & {
      kind: "PAYMENT_RECEIVED" | "PAYMENT_REFUNDED";
      paymentId: string;
      chargeNumber: string;
      method: string;
      amountMinor: string;
      currency: string;
    });

export interface TimelineReader {
  // One page in timeline order (newest first), at most `limit` items, each branch narrowed by the
  // patient index, the kinds, the window and the cursor.
  page(uow: UnitOfWork, query: TimelineQuery): Promise<TimelineItem[]>;
  // The patient of a clinical note, read before the audited note read so a note of another patient
  // is never opened through this patient's timeline.
  notePatientId(uow: UnitOfWork, organizationId: string, noteId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------------------------
// Other modules

export type PatientRef = {
  id: string;
  fullName: string;
  displayName: string;
  active: boolean;
  anonymized: boolean;
};

export interface PatientGate {
  // The F05 visibility policy applies; a denial is audited by the patients module.
  patient(ctx: RequestContext, patientId: string): Promise<Result<PatientRef>>;
}

export interface ClinicalGate {
  // The F07 records policy (a linked professional with an appointment with the patient).
  canAccess(ctx: RequestContext, patientId: string): Promise<boolean>;
  // The audited note read of F07 (records policy, READ_SENSITIVE on clinical_note).
  getNote(ctx: RequestContext, noteId: string): Promise<Result<NoteDetails>>;
}

export interface PrivacyDirectory {
  organizationTimeZone(ctx: RequestContext): Promise<string>;
  userNames(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
}

// The changes anonymization asks of the modules that own the data (ADR-040). Each records its own
// audit event inside the caller's transaction.
export interface AnonymizationSteps {
  anonymizePatient(
    ctx: RequestContext,
    uow: UnitOfWork,
    input: { patientId: string; code: string; placeholder: string },
  ): Promise<Result<{ fields: string[] }>>;
  eraseDocuments(
    ctx: RequestContext,
    uow: UnitOfWork,
    patientId: string,
  ): Promise<Result<{ erased: number }>>;
  clearAppointmentNotes(
    ctx: RequestContext,
    uow: UnitOfWork,
    patientId: string,
  ): Promise<Result<{ cleared: number }>>;
}

// ---------------------------------------------------------------------------------------------
// Request register and exports (own tables)

export type RequestListFilter = {
  organizationId: string;
  status: "OPEN" | "ALL" | RequestStatus;
  type: "ALL" | RequestType;
  page: number;
  pageSize: number;
};

export type RequestListRow = {
  request: LgpdRequest;
  patientDisplayName: string;
};

export interface RequestRepository {
  findById(uow: UnitOfWork, id: string, options?: { lock?: boolean }): Promise<LgpdRequest | null>;
  insert(uow: UnitOfWork, request: LgpdRequest): Promise<void>;
  // Optimistic version check; the version goes up by one.
  save(uow: UnitOfWork, request: LgpdRequest, expectedVersion: number): Promise<"OK" | "STALE">;
  hasOpenAnonymization(uow: UnitOfWork, patientId: string): Promise<boolean>;
  list(uow: UnitOfWork, filter: RequestListFilter): Promise<{ rows: RequestListRow[]; total: number }>;
  // Open requests created before the instant (the overdue count of the register).
  countOpenCreatedBefore(uow: UnitOfWork, instant: Date): Promise<number>;
  // The patient (and its display name) of a request, for the detail page.
  patientOf(uow: UnitOfWork, requestId: string): Promise<{ patientId: string; displayName: string } | null>;
}

export interface ExportRepository {
  findById(uow: UnitOfWork, id: string, options?: { lock?: boolean }): Promise<LgpdExport | null>;
  listForRequest(uow: UnitOfWork, requestId: string): Promise<LgpdExport[]>;
  // Ready exports of every request of the patient (they are expired on anonymization).
  readyForPatient(uow: UnitOfWork, patientId: string): Promise<LgpdExport[]>;
  // Ready exports whose availability ended before the instant (the daily cleanup).
  readyExpiredBefore(uow: UnitOfWork, instant: Date, limit: number): Promise<LgpdExport[]>;
  insert(uow: UnitOfWork, item: LgpdExport): Promise<void>;
  save(uow: UnitOfWork, item: LgpdExport): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Export build

export type ExportPatient = {
  id: string;
  fullName: string;
  socialName: string | null;
  birthDate: string;
  sex: string;
  document: { country: string; type: string; number: string } | null;
  rg: string | null;
  mobilePhone: string;
  secondaryPhone: string | null;
  email: string | null;
  address: {
    country: string | null;
    postalCode: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    region: string | null;
  };
  occupation: string | null;
  referralSource: string | null;
  observations: string | null;
  tags: string[];
  guardian: {
    name: string;
    document: { type: string; number: string } | null;
    relationship: string;
    phone: string;
  } | null;
  active: boolean;
  inactiveReason: string | null;
  createdAt: Date;
  anonymizedAt: Date | null;
};

export type ExportFile = {
  // Unique name inside arquivos/<folder>/.
  id: string;
  fileName: string;
  objectKey: string;
};

export type ExportConsent = {
  id: string;
  consentedAt: Date;
  termsVersion: number;
  method: string;
  recordedByName: string | null;
  file: ExportFile | null;
};

export type ExportAppointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  status: string;
  serviceName: string;
  professionalName: string;
  unitName: string;
  roomName: string | null;
  isOverbooking: boolean;
  priceMinor: string;
  currency: string;
  notes: string | null;
  cancellation: { origin: string | null; reason: string | null; note: string | null; at: Date | null } | null;
  createdAt: Date;
  createdByName: string | null;
  history: {
    fromStatus: string | null;
    toStatus: string;
    changedAt: Date;
    changedByName: string | null;
    justification: string | null;
  }[];
  reschedules: {
    previousStartsAt: Date;
    previousEndsAt: Date;
    rescheduledAt: Date;
    rescheduledByName: string | null;
  }[];
};

export type ExportNote = {
  id: string;
  kind: string;
  status: string;
  appointmentId: string | null;
  professionalName: string;
  authorName: string | null;
  createdAt: Date;
  finalizedAt: Date | null;
  autoFinalized: boolean;
  contentHtml: string;
  contentText: string;
  versions: { versionNumber: number; replacedAt: Date; contentHtml: string; contentText: string }[];
  addenda: {
    id: string;
    authorName: string | null;
    createdAt: Date;
    contentHtml: string;
    contentText: string;
  }[];
  attachments: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    inError: boolean;
    createdAt: Date;
    file: ExportFile;
  }[];
};

export type ExportAlert = {
  text: string;
  updatedAt: Date;
  history: { previousText: string; changedAt: Date }[];
};

export type ExportDocument = {
  id: string;
  kind: string;
  title: string;
  categoryName: string;
  isClinical: boolean;
  status: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  authorName: string | null;
  archivedAt: Date | null;
  erasedAt: Date | null;
  // Null for an erased document, whose file no longer exists.
  file: ExportFile | null;
};

export type ExportCharge = {
  id: string;
  number: string;
  origin: string;
  item: string | null;
  unitName: string;
  timeZone: string;
  currency: string;
  grossMinor: string;
  discountMinor: string;
  discountReason: string | null;
  netMinor: string;
  paidMinor: string;
  status: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  payments: {
    id: string;
    kind: string;
    method: string;
    installments: number | null;
    amountMinor: string;
    refundedMinor: string;
    receivedAt: Date;
    userName: string | null;
    reason: string | null;
  }[];
};

export type PatientExportData = {
  organization: { id: string; name: string; timeZone: string; logoKey: string | null };
  patient: ExportPatient;
  consents: ExportConsent[];
  appointments: ExportAppointment[];
  clinicalNotes: ExportNote[];
  clinicalAlert: ExportAlert | null;
  documents: ExportDocument[];
  charges: ExportCharge[];
};

export type ExportJobInfo = {
  exportId: string;
  requestId: string;
  patientId: string;
  locale: Locale;
  requestedBy: string;
  description: string;
};

export interface PatientDataReader {
  // Everything F14 exports for one patient (F05–F09), with explicit organization filters.
  read(uow: UnitOfWork, organizationId: string, patientId: string): Promise<PatientExportData | null>;
  // The facts of the anonymization rules (spec decision D16).
  facts(uow: UnitOfWork, organizationId: string, patientId: string, now: Date): Promise<AnonymizationFacts>;
  // Locks the patient row for the anonymization transaction and returns its current name.
  lockPatient(
    uow: UnitOfWork,
    organizationId: string,
    patientId: string,
  ): Promise<{ fullName: string; anonymized: boolean } | null>;
  organizationLogo(key: string): Promise<{ data: Buffer; format: "png" } | null>;
}

// A file of the ZIP: generated content or a stored object read as a stream.
export type ArchiveEntry =
  | { name: string; kind: "content"; body: Uint8Array; compress: boolean }
  | { name: string; kind: "object"; objectKey: string };

// Thrown by the archive adapter with the reason recorded on the failed export.
export class ExportBuildError extends Error {
  constructor(readonly code: ExportErrorCode) {
    super(code);
  }
}

export interface ExportArchive {
  // Streams the entries into a ZIP stored at `key`, one stored file at a time. The object exists only
  // when every entry was written; any failure rejects (ExportBuildError) and leaves no object.
  write(
    key: string,
    entries: ArchiveEntry[],
    options: { signal: AbortSignal },
  ): Promise<{ sizeBytes: number }>;
  delete(key: string): Promise<void>;
  // A short-lived download URL with the given file name (ADR-009).
  presignDownload(key: string, fileName: string): Promise<string>;
}

export type ExportPdfModel = {
  documentTitle: string;
  clinicName: string;
  logo: { data: Buffer; format: "png" } | null;
  title: string;
  subtitle: string;
  footer: string;
  pageLabel: string;
  sections: {
    title: string;
    pairs?: { label: string; value: string }[];
    table?: { columns: { label: string; width: string }[]; rows: string[][] };
    texts?: { heading: string; body: string }[];
    empty?: string;
  }[];
};

export interface ExportPdf {
  render(model: ExportPdfModel): Promise<Buffer>;
}

export type PrivacyDeps = {
  timeline: TimelineReader;
  requests: RequestRepository;
  exports: ExportRepository;
  data: PatientDataReader;
  archive: ExportArchive;
  pdf: ExportPdf;
  patients: PatientGate;
  clinical: ClinicalGate;
  steps: AnonymizationSteps;
  directory: PrivacyDirectory;
  clock: () => Date;
  // Numbers in [0, 1) from a cryptographic source (the anonymization code).
  random: () => number;
  newId: () => string;
};
