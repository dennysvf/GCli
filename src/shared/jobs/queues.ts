// pg-boss queue names (architecture 5.5).
export const QUEUES = {
  emailSend: "email-send",
  auditEnsurePartitions: "audit-ensure-partitions",
  identityCleanup: "identity-cleanup",
  patientsCleanup: "patients-cleanup",
  clinicalAttachmentProcess: "clinical-attachment-process",
  clinicalNotesAutoFinalize: "clinical-notes-auto-finalize",
  clinicalUploadsCleanup: "clinical-uploads-cleanup",
  documentsFileProcess: "documents-file-process",
  documentsUploadsCleanup: "documents-uploads-cleanup",
  packagesExpire: "packages-expire",
  cashFlagUnclosed: "cash-flag-unclosed",
  financeRecurrence: "finance-recurrence",
  financeUploadsCleanup: "finance-uploads-cleanup",
  // F14: files of erased documents, LGPD export builds, export file deletion and the daily cleanup.
  documentsFileErase: "documents-file-erase",
  privacyExportBuild: "privacy-export-build",
  privacyExportDelete: "privacy-export-delete",
  privacyExportsCleanup: "privacy-exports-cleanup",
} as const;

// PRD F14: an export job may run for its 5-minute budget; pg-boss gives it 15 minutes before it
// counts as expired, and never retries it (a failure is shown to the user, who decides).
export const EXPORT_JOB_EXPIRE_SECONDS = 15 * 60;

export type EmailJobData = { outboxId: string; type: string; payload: Record<string, unknown> };
