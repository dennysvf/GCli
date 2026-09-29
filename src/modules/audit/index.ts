// Public API of the audit module. Recording lives in src/shared/audit (used inside every
// transaction); the viewer is delivered by F15.
export { ensureAuditPartitions, MONTHS_AHEAD } from "./infrastructure/partitions";
