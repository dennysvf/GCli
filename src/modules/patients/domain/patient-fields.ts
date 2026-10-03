import { PhoneNumber } from "@/shared/kernel/phone";

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

// The national numbers of both phones (stored as E.164), separated by a space: the phone search
// column, which "last 8 digits" searches match anywhere (spec F05 section 6, PRD F16).
export function phoneDigits(mobile: string, secondary: string | null): string {
  return [mobile, secondary]
    .filter((phone): phone is string => !!phone)
    .map((phone) => PhoneNumber.fromE164(phone)?.nationalDigits() ?? phone.replace(/\D/g, ""))
    .join(" ");
}
