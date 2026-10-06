// Client entry point of the clinical-records module (ADR-027): only client-safe code, for Client
// Components. Server code goes through ./index.ts.
export { clearClinicalBackups } from "./ui/local-backup";
