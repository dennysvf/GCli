import type { PgBoss } from "pg-boss";
import { db } from "@/shared/db/client";
import { QUEUES, type EmailJobData } from "@/shared/jobs/queues";
import { logger } from "@/shared/logging/logger";

// Moves committed outbox messages to pg-boss (spec F01 section 3, "Outbox delivery").
// Rows are locked with SKIP LOCKED so several workers never dispatch the same message.
const BATCH_SIZE = 50;

type OutboxRow = { id: string; type: string; payload: Record<string, unknown> };

function queueFor(type: string): string | null {
  if (type.startsWith("email.")) return QUEUES.emailSend;
  if (type === "clinical.attachment-process") return QUEUES.clinicalAttachmentProcess;
  if (type === "documents.file-process") return QUEUES.documentsFileProcess;
  return null;
}

export async function dispatchOutboxBatch(boss: PgBoss): Promise<number> {
  return db().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, type, payload FROM outbox_message
      WHERE dispatched_at IS NULL
      ORDER BY created_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED`;
    for (const row of rows) {
      const queue = queueFor(row.type);
      try {
        if (!queue) throw new Error(`No queue for outbox type ${row.type}`);
        const data: EmailJobData = { outboxId: row.id, type: row.type, payload: row.payload };
        await boss.send(queue, data, { singletonKey: row.id, retryLimit: 5, retryBackoff: true });
        await tx.outboxMessage.update({
          where: { id: row.id },
          data: { dispatchedAt: new Date(), attempts: { increment: 1 } },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "unknown error";
        await tx.outboxMessage.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, lastError: message },
        });
        logger.error({ outboxId: row.id, err: message }, "outbox dispatch failed");
      }
    }
    return rows.length;
  });
}

export function startOutboxLoop(boss: PgBoss, intervalMs = 5_000): () => void {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await dispatchOutboxBatch(boss);
    } catch (error) {
      logger.error({ err: error }, "outbox loop error");
    } finally {
      running = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
