import { formatPhoneNumber } from "@/shared/kernel/phone";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Stamp, type StampVariant } from "@/shared/ui/components/stamp";
import type { PatientDetails } from "../application/patients";
import type { ConsentStatus } from "../domain/consent";
import { useTranslations } from "next-intl";

const CONSENT_VARIANT: Record<ConsentStatus, StampVariant> = {
  OK: "success",
  PENDING: "warning",
  MISSING: "warning",
  NO_TERMS: "neutral",
};

// Record header details (PRD F05 Experience): age, phone, tags and the consent stamp; the
// "Cadastro incompleto" alert while the CPF or a current consent is missing.
export function PatientHeaderMeta({ patient }: { patient: PatientDetails }) {
  const t = useTranslations();
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{t("patients.ui.ageYears", { age: patient.age })}</span>
      <span className="tabular-nums">{formatPhoneNumber(patient.mobilePhone)}</span>
      {patient.tags.map((tag) => (
        <Stamp key={tag.id} variant="neutral">
          {tag.name}
        </Stamp>
      ))}
      {patient.consentStatus === "NO_TERMS" ? null : (
        <Stamp variant={CONSENT_VARIANT[patient.consentStatus]}>
          {t(`patients.ui.consentStatus.${patient.consentStatus}`)}
        </Stamp>
      )}
    </span>
  );
}

export function IncompleteRecordAlert({ patient }: { patient: PatientDetails }) {
  const t = useTranslations();
  if (patient.isComplete || !patient.active) return null;
  return (
    <Alert variant="warning">
      <AlertDescription>{t("patients.ui.incompleteRecord")}</AlertDescription>
    </Alert>
  );
}
