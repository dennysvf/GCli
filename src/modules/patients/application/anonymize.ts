import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { normalizeName } from "../domain/names";
import { PatientsErrors } from "./errors";
import type { PatientsDeps } from "./ports";

// PRD F14 anonymization of the patient record, called by the privacy module inside its own
// transaction (ADR-040: the module that owns the data changes it). The identity is replaced by the
// placeholder and every other identifier is cleared; birth date, sex and tags are kept for
// statistics. The audit entry names the fields, never their old values. Afterwards the database
// trigger of migration 0016 refuses any change to the identity.

// The identifying fields the PRD lists (name, social name, document, RG, phones, email, address,
// guardian) plus free texts and links that may identify the person.
export const ANONYMIZED_FIELDS = [
  "fullName",
  "socialName",
  "document",
  "rg",
  "mobilePhone",
  "secondaryPhone",
  "email",
  "address",
  "occupation",
  "referralSource",
  "observations",
  "guardian",
] as const;

export async function anonymizePatientIn(
  deps: PatientsDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  input: { patientId: string; code: string; placeholder: string },
): Promise<Result<{ fields: string[] }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const row = await uow.tx.patient.findFirst({
    where: { id: input.patientId },
    select: { id: true, active: true, anonymizedAt: true, deactivatedAt: true },
  });
  if (!row) return fail(PatientsErrors.notFound());
  if (row.anonymizedAt) return fail(PatientsErrors.anonymized());
  const now = deps.clock();
  await uow.tx.patient.update({
    where: { id: input.patientId },
    data: {
      fullName: input.placeholder,
      socialName: null,
      normalizedName: normalizeName(input.placeholder),
      documentCountry: null,
      documentType: null,
      documentNumber: null,
      rg: null,
      // The mobile phone is required; an anonymized patient keeps an empty one (CHECK ck_patient_mobile).
      mobilePhone: "",
      secondaryPhone: null,
      phoneDigits: "",
      email: null,
      addressCountry: null,
      postalCode: null,
      street: null,
      number: null,
      complement: null,
      district: null,
      city: null,
      region: null,
      occupation: null,
      referralSourceId: null,
      observations: null,
      guardianName: null,
      guardianDocumentType: null,
      guardianDocumentNumber: null,
      guardianRelationship: null,
      guardianPhone: null,
      active: false,
      inactiveReason: "ANONYMIZED",
      inactiveNote: null,
      deactivatedAt: row.deactivatedAt ?? now,
      anonymizedAt: now,
      anonymizedCode: input.code,
      version: { increment: 1 },
      updatedById: ctx.user.id,
    },
  });
  const fields = [...ANONYMIZED_FIELDS];
  await uow.audit.record({
    action: "UPDATE",
    entityType: "patient",
    entityId: input.patientId,
    summary: "Paciente anonimizado",
    changes: { anonymized: { before: false, after: true }, active: { before: row.active, after: false } },
    metadata: { patientId: input.patientId, fields, anonymizedCode: input.code },
  });
  return ok({ fields });
}
