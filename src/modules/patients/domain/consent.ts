// Consent status (PRD F05): a new terms version flags patients as "consentimento pendente" until
// they consent again. Computed from the latest consent and the current terms version.
export type ConsentStatus = "OK" | "PENDING" | "MISSING" | "NO_TERMS";

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  OK: "Consentimento ok",
  PENDING: "Consentimento pendente",
  MISSING: "Sem consentimento",
  NO_TERMS: "Termos não publicados",
};

export function consentStatus(
  latestConsentVersion: number | null,
  currentTermsVersion: number | null,
): ConsentStatus {
  if (currentTermsVersion === null) return "NO_TERMS";
  if (latestConsentVersion === null) return "MISSING";
  return latestConsentVersion >= currentTermsVersion ? "OK" : "PENDING";
}

// PRD F05: "Cadastro incompleto" until CPF and consent are filled.
export function isRecordComplete(cpf: string | null, status: ConsentStatus): boolean {
  return cpf !== null && (status === "OK" || status === "NO_TERMS");
}

export const CONSENT_METHODS = ["PAPER_UPLOADED", "VERBAL", "DIGITAL"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  PAPER_UPLOADED: "Assinado em papel",
  VERBAL: "Verbal, confirmado pela equipe",
  DIGITAL: "Digital",
};
