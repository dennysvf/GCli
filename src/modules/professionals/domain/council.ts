// Council registration (PRD F04): CRM, CRO, CREFITO, CRP, CRN, COREN, CRBM, CRF, other or none.
// "Outro" needs the council's name; number and state are required for every type except none.
export const COUNCIL_TYPES = [
  "CRM",
  "CRO",
  "CREFITO",
  "CRP",
  "CRN",
  "COREN",
  "CRBM",
  "CRF",
  "OTHER",
  "NONE",
] as const;
export type CouncilType = (typeof COUNCIL_TYPES)[number];

export const COUNCIL_TYPE_LABELS: Record<CouncilType, string> = {
  CRM: "CRM",
  CRO: "CRO",
  CREFITO: "CREFITO",
  CRP: "CRP",
  CRN: "CRN",
  COREN: "COREN",
  CRBM: "CRBM",
  CRF: "CRF",
  OTHER: "Outro",
  NONE: "Nenhum",
};

export type CouncilRegistration = {
  type: CouncilType;
  otherName: string | null;
  number: string | null;
  state: string | null;
};

export function requiresRegistration(type: CouncilType): boolean {
  return type !== "NONE";
}

export function requiresOtherName(type: CouncilType): boolean {
  return type === "OTHER";
}

// The acronym printed before the number: the type itself, or the council's name for "Outro".
export function councilLabel(registration: Pick<CouncilRegistration, "type" | "otherName">): string {
  if (registration.type === "NONE") return "";
  if (registration.type === "OTHER") return registration.otherName ?? "";
  return registration.type;
}

// "CRM 123456/SP"; empty when the professional has no registration.
export function formatRegistration(registration: CouncilRegistration): string {
  if (!requiresRegistration(registration.type) || !registration.number || !registration.state) return "";
  return `${councilLabel(registration)} ${registration.number}/${registration.state}`;
}
