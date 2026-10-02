// Client entry point of the patients module (ADR-027): only client-safe UI and types, for Client
// Components of other modules. Server code goes through ./index.ts.
export { QuickPatientForm, type SavePatientInput, type SavePatientResult } from "./ui/patient-form";
export type { ListItem } from "./application/lists";
