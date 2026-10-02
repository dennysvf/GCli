import { formatPhone } from "@/shared/kernel/phone";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Stamp, type StampVariant } from "@/shared/ui/components/stamp";
import type { PatientDetails } from "../application/patients";
import { CONSENT_STATUS_LABELS, type ConsentStatus } from "../domain/consent";
import { PATIENTS_INCOMPLETE_RECORD } from "../messages";

const CONSENT_VARIANT: Record<ConsentStatus, StampVariant> = {
  OK: "success",
  PENDING: "warning",
  MISSING: "warning",
  NO_TERMS: "neutral",
};

// Record header details (PRD F05 Experience): age, phone, tags and the consent stamp; the
// "Cadastro incompleto" alert while the CPF or a current consent is missing.
export function PatientHeaderMeta({ patient }: { patient: PatientDetails }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{patient.age} anos</span>
      <span className="tabular-nums">{formatPhone(patient.mobilePhone)}</span>
      {patient.tags.map((tag) => (
        <Stamp key={tag.id} variant="neutral">
          {tag.name}
        </Stamp>
      ))}
      {patient.consentStatus === "NO_TERMS" ? null : (
        <Stamp variant={CONSENT_VARIANT[patient.consentStatus]}>
          {CONSENT_STATUS_LABELS[patient.consentStatus]}
        </Stamp>
      )}
    </span>
  );
}

export function IncompleteRecordAlert({ patient }: { patient: PatientDetails }) {
  if (patient.isComplete || !patient.active) return null;
  return (
    <Alert variant="warning">
      <AlertDescription>{PATIENTS_INCOMPLETE_RECORD}</AlertDescription>
    </Alert>
  );
}
