// pg-boss queue names (architecture 5.5).
export const QUEUES = {
  emailSend: "email-send",
  auditEnsurePartitions: "audit-ensure-partitions",
  identityCleanup: "identity-cleanup",
} as const;

export type EmailJobData = { outboxId: string; type: string; payload: Record<string, unknown> };
