// Enumerated patient fields (PRD F05) with their pt-BR labels.
export const SEXES = ["FEMALE", "MALE", "OTHER", "NOT_INFORMED"] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_LABELS: Record<Sex, string> = {
  FEMALE: "Feminino",
  MALE: "Masculino",
  OTHER: "Outro",
  NOT_INFORMED: "Não informado",
};

export const GUARDIAN_RELATIONSHIPS = ["MOTHER", "FATHER", "GRANDPARENT", "LEGAL_GUARDIAN", "OTHER"] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];
export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  MOTHER: "Mãe",
  FATHER: "Pai",
  GRANDPARENT: "Avó/Avô",
  LEGAL_GUARDIAN: "Tutor legal",
  OTHER: "Outro",
};

export const INACTIVE_REASONS = ["DECEASED", "MOVED", "OTHER"] as const;
export type InactiveReason = (typeof INACTIVE_REASONS)[number];
export const INACTIVE_REASON_LABELS: Record<InactiveReason, string> = {
  DECEASED: "Falecimento",
  MOVED: "Mudança",
  OTHER: "Outro motivo",
};

// Both phones, digits only, separated by a space: the phone search column (spec F05 section 6).
export function phoneDigits(mobile: string, secondary: string | null): string {
  return [mobile, secondary].filter(Boolean).join(" ");
}
