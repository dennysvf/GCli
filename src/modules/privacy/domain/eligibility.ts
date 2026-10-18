// Whether a patient may be anonymized (PRD F14, spec decision D16). The rules are checked in order:
// 1. any clinical record (a clinical note in any state, a clinical document, or the clinical alert)
//    means legal retention: Law 13.787/2018 requires clinical records to be kept for 20 years. This
//    is not an error; the request is registered as "retenção legal";
// 2. future appointments or open charges block the anonymization until they are settled;
// 3. only then is the typed name compared (see anonymization.ts).
export type AnonymizationFacts = {
  clinicalNotes: number;
  clinicalDocuments: number;
  clinicalAlert: boolean;
  futureAppointments: number;
  openCharges: number;
};

export type AnonymizationOutcome = "ELIGIBLE" | "LEGAL_RETENTION" | "BLOCKED";

export function hasClinicalRecords(facts: AnonymizationFacts): boolean {
  return facts.clinicalNotes > 0 || facts.clinicalDocuments > 0 || facts.clinicalAlert;
}

export function anonymizationOutcome(facts: AnonymizationFacts): AnonymizationOutcome {
  if (hasClinicalRecords(facts)) return "LEGAL_RETENTION";
  if (facts.futureAppointments > 0 || facts.openCharges > 0) return "BLOCKED";
  return "ELIGIBLE";
}
