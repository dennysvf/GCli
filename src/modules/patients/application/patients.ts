import { diffChanges } from "@/shared/audit/diff";
import { authorize, recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { DOCUMENT_SPECS, maskDocument, type DocumentType } from "@/shared/kernel/documents";
import { isCountryCode, type CountryCode } from "@/shared/kernel/countries/codes";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { formatLocale } from "@/shared/i18n/format";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { ageOn, isMinor } from "../domain/age";
import { consentStatus, isRecordComplete, type ConsentStatus } from "../domain/consent";
import { MAX_AGE_YEARS, MAX_TAGS_PER_PATIENT } from "../domain/limits";
import { phoneEnd } from "../domain/masking";
import { abbreviateName, displayName, normalizeName } from "../domain/names";
import {
  phoneDigits,
  type GuardianRelationship,
  type InactiveReason,
  type Sex,
} from "../domain/patient-fields";
import { PatientsErrors } from "./errors";
import { canViewPatient } from "./policies";
import type { PatientsDeps } from "./ports";
import {
  createPatientSchema,
  setPatientActiveSchema,
  updatePatientSchema,
  type PatientValues,
} from "./schemas";

export type StoredDocument = { country: CountryCode; type: DocumentType; number: string };

// The address as stored: its country is null when the patient has no address (PRD F16).
export type StoredAddress = {
  country: CountryCode | null;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
};

function documentOf(row: {
  documentCountry: string | null;
  documentType: string | null;
  documentNumber: string | null;
}): StoredDocument | null {
  if (!row.documentType || !row.documentNumber || !isCountryCode(row.documentCountry)) return null;
  return {
    country: row.documentCountry,
    type: row.documentType as DocumentType,
    number: row.documentNumber,
  };
}

export type PatientDetails = {
  id: string;
  fullName: string;
  socialName: string | null;
  displayName: string;
  birthDate: string;
  age: number;
  sex: Sex;
  document: StoredDocument | null;
  rg: string | null;
  // E.164.
  mobilePhone: string;
  secondaryPhone: string | null;
  email: string | null;
  address: StoredAddress;
  occupation: string | null;
  referralSource: { id: string; name: string } | null;
  observations: string | null;
  tags: { id: string; name: string }[];
  guardian: {
    name: string;
    document: { type: DocumentType; number: string } | null;
    relationship: GuardianRelationship;
    phone: string;
  } | null;
  active: boolean;
  inactiveReason: InactiveReason | null;
  inactiveNote: string | null;
  consentStatus: ConsentStatus;
  isComplete: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DuplicateCandidate = {
  patientId: string;
  displayName: string;
  birthDate: string;
  // The document masked as Front Desk sees it (PRD F05, F16).
  maskedDocument: { type: DocumentType; display: string } | null;
  phoneEnd: string;
  active: boolean;
};

export type CreatePatientResult =
  | { kind: "created"; patientId: string; version: number }
  | { kind: "possible-duplicates"; candidates: DuplicateCandidate[] };

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

export async function organizationToday(deps: PatientsDeps, ctx: RequestContext): Promise<string> {
  return dateInTimeZone(deps.clock(), await deps.organizationTimeZone(ctx));
}

// Current terms version and each patient's latest consented version (consent status, PRD F05).
export async function consentVersions(
  uow: UnitOfWork,
  patientIds: string[],
): Promise<{ current: number | null; latest: Map<string, number> }> {
  const [terms, consents] = await Promise.all([
    uow.tx.privacyTermsVersion.findFirst({ orderBy: { version: "desc" }, select: { version: true } }),
    patientIds.length === 0
      ? Promise.resolve([])
      : uow.tx.consentRecord.findMany({
          where: { patientId: { in: patientIds } },
          select: { patientId: true, termsVersion: { select: { version: true } } },
        }),
  ]);
  const latest = new Map<string, number>();
  for (const consent of consents) {
    latest.set(consent.patientId, Math.max(latest.get(consent.patientId) ?? 0, consent.termsVersion.version));
  }
  return { current: terms?.version ?? null, latest };
}

type PatientRow = NonNullable<Awaited<ReturnType<UnitOfWork["tx"]["patient"]["findFirst"]>>>;

export async function loadDetails(
  uow: UnitOfWork,
  patientId: string,
  today: string,
): Promise<PatientDetails | null> {
  const row = await uow.tx.patient.findFirst({
    where: { id: patientId },
    include: {
      referralSource: { select: { id: true, name: true } },
      tags: { select: { tag: { select: { id: true, name: true } } } },
    },
  });
  if (!row) return null;
  const versions = await consentVersions(uow, [row.id]);
  const status = consentStatus(versions.latest.get(row.id) ?? null, versions.current);
  return {
    ...identityOf(row, today),
    sex: row.sex as Sex,
    rg: row.rg,
    occupation: row.occupation,
    referralSource: row.referralSource,
    observations: row.observations,
    tags: row.tags.map((item) => item.tag).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    inactiveReason: row.inactiveReason as InactiveReason | null,
    inactiveNote: row.inactiveNote,
    consentStatus: status,
    isComplete: isRecordComplete(row.documentNumber, status),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function identityOf(row: PatientRow, today: string) {
  const birthDate = fromDbDate(row.birthDate);
  return {
    id: row.id,
    fullName: row.fullName,
    socialName: row.socialName,
    displayName: displayName(row.fullName, row.socialName),
    birthDate,
    age: ageOn(birthDate, today),
    document: documentOf(row),
    mobilePhone: row.mobilePhone,
    secondaryPhone: row.secondaryPhone,
    email: row.email,
    address: {
      country: isCountryCode(row.addressCountry) ? row.addressCountry : null,
      postalCode: row.postalCode,
      street: row.street,
      number: row.number,
      complement: row.complement,
      district: row.district,
      city: row.city,
      region: row.region,
    },
    guardian:
      row.guardianName && row.guardianRelationship && row.guardianPhone
        ? {
            name: row.guardianName,
            document:
              row.guardianDocumentType && row.guardianDocumentNumber
                ? { type: row.guardianDocumentType as DocumentType, number: row.guardianDocumentNumber }
                : null,
            relationship: row.guardianRelationship as GuardianRelationship,
            phone: row.guardianPhone,
          }
        : null,
    active: row.active,
  };
}

export async function getPatient(
  deps: PatientsDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<Result<PatientDetails>> {
  const visible = await canViewPatient(deps, ctx, patientId);
  if (!visible) {
    await recordDenial(ctx, "patient:read", patientId);
    return fail(CommonErrors.forbidden());
  }
  const today = await organizationToday(deps, ctx);
  return withTransaction(ctx, async (uow) => {
    const details = await loadDetails(uow, patientId, today);
    return details ? ok(details) : fail(PatientsErrors.notFound());
  });
}

// Field rules that need "today" or the database (spec F05 section 3).
async function checkFields(
  uow: UnitOfWork,
  values: Omit<PatientValues, "mode" | "confirmDuplicate">,
  today: string,
) {
  if (values.birthDate > today)
    return PatientsErrors.validation({ birthDate: "patients.validation.birthDateFuture" });
  if (ageOn(values.birthDate, today) > MAX_AGE_YEARS) {
    return PatientsErrors.validation({ birthDate: "patients.validation.birthDateInvalid" });
  }
  // PRD F05: patients under 18 at registration need a guardian.
  if (isMinor(values.birthDate, today) && !values.guardian) return PatientsErrors.guardianRequired();
  if (values.tagIds.length > MAX_TAGS_PER_PATIENT) return PatientsErrors.tagLimit();
  if (values.tagIds.length > 0) {
    const active = await uow.tx.tag.count({ where: { id: { in: values.tagIds }, active: true } });
    if (active !== values.tagIds.length) return PatientsErrors.invalidOption("tagIds");
  }
  if (values.referralSourceId) {
    const source = await uow.tx.referralSource.findFirst({
      where: { id: values.referralSourceId, active: true },
    });
    if (!source) return PatientsErrors.invalidOption("referralSourceId");
  }
  return null;
}

function columns(values: Omit<PatientValues, "mode" | "confirmDuplicate">) {
  return {
    fullName: values.fullName,
    socialName: values.socialName,
    normalizedName: normalizeName(values.fullName),
    birthDate: toDbDate(values.birthDate),
    sex: values.sex,
    documentCountry: values.document?.country ?? null,
    documentType: values.document?.type ?? null,
    documentNumber: values.document?.number ?? null,
    rg: values.rg,
    mobilePhone: values.mobilePhone ?? "",
    secondaryPhone: values.secondaryPhone,
    phoneDigits: phoneDigits(values.mobilePhone ?? "", values.secondaryPhone),
    email: values.email,
    addressCountry: values.address?.country ?? null,
    postalCode: values.address?.postalCode ?? null,
    street: values.address?.street ?? null,
    number: values.address?.number ?? null,
    complement: values.address?.complement ?? null,
    district: values.address?.district ?? null,
    city: values.address?.city ?? null,
    region: values.address?.region ?? null,
    occupation: values.occupation,
    referralSourceId: values.referralSourceId,
    observations: values.observations,
    guardianName: values.guardian?.name ?? null,
    guardianDocumentType: values.guardian?.document?.type ?? null,
    guardianDocumentNumber: values.guardian?.document?.number ?? null,
    guardianRelationship: values.guardian?.relationship ?? null,
    guardianPhone: values.guardian?.phone ?? null,
  };
}

// What the audit records: the columns that matter to a reader, without derived search columns.
function auditView(data: ReturnType<typeof columns>, tagIds: string[]) {
  const view: Record<string, unknown> = { ...data, birthDate: data.birthDate.toISOString().slice(0, 10) };
  delete view.normalizedName;
  delete view.phoneDigits;
  return { ...view, tagIds: [...tagIds].sort() };
}

// A document is unique per type inside the organization (PRD F16): the same number under another
// type is another document.
async function documentOwner(
  uow: UnitOfWork,
  document: { type: DocumentType; number: string },
  exceptId?: string,
) {
  return uow.tx.patient.findFirst({
    where: {
      documentType: document.type,
      documentNumber: document.number,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, fullName: true },
  });
}

function isDocumentViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; meta?: unknown };
  return (
    candidate.code === "P2002" ||
    `${candidate.message ?? ""} ${JSON.stringify(candidate.meta ?? {})}`.includes("uq_patient_org_document")
  );
}

async function documentTakenError(ctx: RequestContext, document: { type: DocumentType; number: string }) {
  const owner = await withTransaction(ctx, async (uow) => ok(await documentOwner(uow, document)));
  const found = owner.ok ? owner.value : null;
  return found
    ? PatientsErrors.documentTaken(
        DOCUMENT_SPECS[document.type].shortLabel,
        abbreviateName(found.fullName),
        found.id,
      )
    : null;
}

export async function createPatient(
  deps: PatientsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CreatePatientResult>> {
  const allowed = await authorize(ctx, "patient:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createPatientSchema, input);
  if (!parsed.ok) return parsed;
  const { mode, confirmDuplicate, ...values } = parsed.value;
  const today = await organizationToday(deps, ctx);

  try {
    return await withTransaction<CreatePatientResult>(ctx, async (uow) => {
      const invalid = await checkFields(uow, values, today);
      if (invalid) return fail(invalid);
      if (values.document) {
        const owner = await documentOwner(uow, values.document);
        if (owner) {
          return fail(
            PatientsErrors.documentTaken(
              DOCUMENT_SPECS[values.document.type].shortLabel,
              abbreviateName(owner.fullName),
              owner.id,
            ),
          );
        }
      }
      // PRD F05: the same normalized name and birth date warns; the user may create anyway.
      if (!confirmDuplicate) {
        const matches = await uow.tx.patient.findMany({
          where: { normalizedName: normalizeName(values.fullName), birthDate: toDbDate(values.birthDate) },
          select: {
            id: true,
            fullName: true,
            socialName: true,
            birthDate: true,
            documentType: true,
            documentNumber: true,
            mobilePhone: true,
            active: true,
          },
          take: 5,
        });
        if (matches.length > 0) {
          return ok({
            kind: "possible-duplicates" as const,
            candidates: matches.map((match) => ({
              patientId: match.id,
              displayName: displayName(match.fullName, match.socialName),
              birthDate: fromDbDate(match.birthDate),
              maskedDocument:
                match.documentType && match.documentNumber
                  ? {
                      type: match.documentType as DocumentType,
                      display: maskDocument(match.documentType as DocumentType, match.documentNumber),
                    }
                  : null,
              phoneEnd: phoneEnd(match.mobilePhone),
              active: match.active,
            })),
          });
        }
      }
      const id = newId();
      const data = columns(values);
      await uow.tx.patient.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          ...data,
          createdById: ctx.user.id,
          updatedById: ctx.user.id,
        },
      });
      if (values.tagIds.length > 0) {
        await uow.tx.patientTag.createMany({
          data: values.tagIds.map((tagId) => ({ patientId: id, tagId, organizationId: ctx.organizationId })),
        });
      }
      await uow.audit.record({
        action: "CREATE",
        entityType: "patient",
        entityId: id,
        summary: mode === "quick" ? "Paciente cadastrado (cadastro rápido)" : "Paciente cadastrado",
        changes: diffChanges(null, auditView(data, values.tagIds)),
        ...(confirmDuplicate ? { metadata: { duplicateConfirmed: true } } : {}),
      });
      return ok({ kind: "created" as const, patientId: id, version: 1 });
    });
  } catch (error) {
    if (values.document && isDocumentViolation(error)) {
      const taken = await documentTakenError(ctx, values.document);
      if (taken) return fail(taken);
    }
    throw error;
  }
}

function formatTime(instant: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(instant);
}

export async function updatePatient(
  deps: PatientsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ patientId: string; version: number }>> {
  const allowed = await authorize(ctx, "patient:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updatePatientSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, version, ...values } = parsed.value;
  const timeZone = await deps.organizationTimeZone(ctx);
  const today = dateInTimeZone(deps.clock(), timeZone);

  try {
    const saved = await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.patient.findFirst({
        where: { id: patientId },
        include: { tags: { select: { tagId: true } } },
      });
      if (!before) return fail(PatientsErrors.notFound());
      if (!before.active) return fail(PatientsErrors.inactive());
      // PRD F05: no silent overwrite; the author and time of the newer save are reported.
      if (before.version !== version) {
        return fail(
          PatientsErrors.staleVersion(
            before.updatedById ?? "",
            formatTime(before.updatedAt, timeZone, formatLocale(ctx.locale, ctx.organizationCountry)),
          ),
        );
      }
      const invalid = await checkFields(uow, values, today);
      if (invalid) return fail(invalid);
      if (values.document) {
        const owner = await documentOwner(uow, values.document, patientId);
        if (owner) {
          return fail(
            PatientsErrors.documentTaken(
              DOCUMENT_SPECS[values.document.type].shortLabel,
              abbreviateName(owner.fullName),
              owner.id,
            ),
          );
        }
      }
      const data = columns(values);
      const updated = await uow.tx.patient.updateMany({
        where: { id: patientId, version },
        data: { ...data, version: { increment: 1 }, updatedById: ctx.user.id },
      });
      if (updated.count !== 1) return fail(CommonErrors.staleVersion());
      await uow.tx.patientTag.deleteMany({ where: { patientId } });
      if (values.tagIds.length > 0) {
        await uow.tx.patientTag.createMany({
          data: values.tagIds.map((tagId) => ({ patientId, tagId, organizationId: ctx.organizationId })),
        });
      }
      const beforeData = columns({
        ...values,
        fullName: before.fullName,
        socialName: before.socialName,
        birthDate: fromDbDate(before.birthDate),
        sex: before.sex as Sex,
        document: documentOf(before),
        rg: before.rg,
        mobilePhone: before.mobilePhone,
        secondaryPhone: before.secondaryPhone,
        email: before.email,
        address: isCountryCode(before.addressCountry)
          ? {
              country: before.addressCountry,
              postalCode: before.postalCode,
              street: before.street,
              number: before.number,
              complement: before.complement,
              district: before.district,
              city: before.city,
              region: before.region,
            }
          : null,
        occupation: before.occupation,
        referralSourceId: before.referralSourceId,
        observations: before.observations,
        guardian:
          before.guardianName && before.guardianRelationship && before.guardianPhone
            ? {
                name: before.guardianName,
                document:
                  before.guardianDocumentType && before.guardianDocumentNumber
                    ? {
                        country: DOCUMENT_SPECS[before.guardianDocumentType as DocumentType].country,
                        type: before.guardianDocumentType as DocumentType,
                        number: before.guardianDocumentNumber,
                      }
                    : null,
                relationship: before.guardianRelationship as GuardianRelationship,
                phone: before.guardianPhone,
              }
            : null,
      });
      await uow.audit.record({
        action: "UPDATE",
        entityType: "patient",
        entityId: patientId,
        summary: "Cadastro do paciente alterado",
        changes: diffChanges(
          auditView(
            beforeData,
            before.tags.map((tag) => tag.tagId),
          ),
          auditView(data, values.tagIds),
        ),
      });
      return ok({ patientId, version: version + 1 });
    });
    if (!saved.ok && saved.error.code === "PATIENTS_STALE_VERSION") {
      // The author's name comes from identity (F01), outside the patients transaction.
      const authorId = String(saved.error.params?.author ?? "");
      const names = authorId ? await deps.userNames(ctx, [authorId]) : new Map<string, string>();
      return fail(
        PatientsErrors.staleVersion(
          names.get(authorId) ?? "outra pessoa",
          String(saved.error.params?.time ?? ""),
        ),
      );
    }
    return saved;
  } catch (error) {
    if (values.document && isDocumentViolation(error)) {
      const taken = await documentTakenError(ctx, values.document);
      if (taken) return fail(taken);
    }
    throw error;
  }
}

export async function setPatientActive(
  deps: PatientsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ active: boolean }>> {
  const allowed = await authorize(ctx, "patient:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setPatientActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, active, reason, note } = parsed.value;
  const now = deps.clock();

  if (!active) {
    // PRD F05: a patient with future appointments cannot be deactivated.
    const future = await deps.appointments().countFuture(ctx.organizationId, patientId, now);
    if (future > 0) return fail(PatientsErrors.hasFutureAppointments(future));
  }
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.patient.findFirst({ where: { id: patientId } });
    if (!row) return fail(PatientsErrors.notFound());
    if (row.active === active) return ok({ active });
    await uow.tx.patient.update({
      where: { id: patientId },
      data: {
        active,
        inactiveReason: active ? null : (reason ?? "OTHER"),
        inactiveNote: active ? null : note,
        deactivatedAt: active ? null : now,
        version: { increment: 1 },
        updatedById: ctx.user.id,
      },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "patient",
      entityId: patientId,
      summary: active ? "Paciente reativado" : "Paciente inativado",
      changes: {
        active: { before: !active, after: active },
        ...(active ? {} : { inactiveReason: { before: null, after: reason ?? "OTHER" } }),
      },
    });
    return ok({ active });
  });
}
