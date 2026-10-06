// pg-boss queue names (architecture 5.5).
export const QUEUES = {
  emailSend: "email-send",
  auditEnsurePartitions: "audit-ensure-partitions",
  identityCleanup: "identity-cleanup",
  patientsCleanup: "patients-cleanup",
  clinicalAttachmentProcess: "clinical-attachment-process",
  clinicalNotesAutoFinalize: "clinical-notes-auto-finalize",
  clinicalUploadsCleanup: "clinical-uploads-cleanup",
} as const;

export type EmailJobData = { outboxId: string; type: string; payload: Record<string, unknown> };
