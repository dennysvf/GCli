// Default document categories (PRD F08 Capabilities, interview): Exame and Laudo externo are
// clinical. "Documento emitido" is the system category of generated documents.
export const DEFAULT_CATEGORIES = [
  { key: "EXAM", clinical: true },
  { key: "SIGNED_TERM", clinical: false },
  { key: "PERSONAL_DOCUMENT", clinical: false },
  { key: "EXTERNAL_REPORT", clinical: true },
  { key: "OTHER", clinical: false },
] as const;

export const ISSUED_CATEGORY_KEY = "ISSUED";
