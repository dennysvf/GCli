// Spec F15 decision D14: the stored audit rows of an anonymized patient never change (legal
// evidence, ADR-040), but the viewer and the CSV stop showing the personal data the anonymization
// erased from the live record. Pure rules; the queries only say whether the subject is anonymized.

// The identifying fields the patients module records (`auditView`) and clears on anonymization
// (`ANONYMIZED_FIELDS`). Birth date, sex, tags, referral source, the active flag and its reason stay
// visible, because the PRD keeps them for statistics.
export const PATIENT_PERSONAL_FIELDS: ReadonlySet<string> = new Set([
  "fullName",
  "socialName",
  "documentCountry",
  "documentType",
  "documentNumber",
  "rg",
  "mobilePhone",
  "secondaryPhone",
  "email",
  "addressCountry",
  "postalCode",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "region",
  "occupation",
  "observations",
  "guardianName",
  "guardianDocumentType",
  "guardianDocumentNumber",
  "guardianRelationship",
  "guardianPhone",
  "inactiveNote",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditSubjectRef = {
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
};

// The patient an event is about: (1) the entity itself for patient events, (2) otherwise the
// `patientId` recorded in the metadata (consent, LGPD request and export events).
export function subjectPatientId(event: AuditSubjectRef): string | null {
  if (event.entityType === "patient") return event.entityId;
  const metadata = event.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).patientId;
    if (typeof value === "string" && UUID.test(value)) return value.toLowerCase();
  }
  return null;
}

export function isCoveredBySubject(
  event: AuditSubjectRef,
  anonymizedPatientIds: ReadonlySet<string>,
): boolean {
  const patientId = subjectPatientId(event);
  return patientId !== null && anonymizedPatientIds.has(patientId.toLowerCase());
}

type Masked = { field: string; kind: "anonymized" };

// Replaces every personal field by an "anonymized" change, whatever it recorded; other fields pass
// through untouched. A hidden secret stays hidden.
export function maskAnonymizedChanges<T extends { field: string; kind: string }>(
  changes: T[],
): (T | Masked)[] {
  return changes.map((change) =>
    change.kind !== "hidden" && PATIENT_PERSONAL_FIELDS.has(change.field)
      ? { field: change.field, kind: "anonymized" as const }
      : change,
  );
}
