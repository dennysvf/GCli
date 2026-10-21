// Client entry point of the audit module (ADR-027): only client-safe UI and types, for Client
// Components of the app layer and of other modules. Server code goes through ./index.ts.
export { AuditLink, auditHref } from "./ui/audit-link";
