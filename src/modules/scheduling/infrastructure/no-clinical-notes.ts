import type { ClinicalNoteLookup } from "../application/ports";

// Inert default until clinical-records (F07) registers its implementation (ADR-007, ADR-022).
export const noClinicalNotes: ClinicalNoteLookup = {
  noteStates: () => Promise.resolve(new Map()),
};
