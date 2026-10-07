import type { Prisma } from "@/generated/prisma/client";
import { newId } from "@/shared/kernel/ids";

// Transactional outbox (architecture 5.4): messages are written in the same transaction as the
// business change and delivered by the worker (src/worker/outbox-dispatcher.ts).
export type OutboxMessageType =
  | "email.invitation"
  | "email.password-reset"
  | "email.storage-quota-alert"
  | "clinical.attachment-process"
  | "documents.file-process";

type OutboxClient = {
  outboxMessage: { create(args: { data: Prisma.OutboxMessageUncheckedCreateInput }): unknown };
};

export type Outbox = { add(type: OutboxMessageType, payload: Record<string, unknown>): Promise<void> };

export function createOutbox(client: OutboxClient, organizationId: string | null): Outbox {
  return {
    async add(type, payload) {
      await client.outboxMessage.create({
        data: { id: newId(), organizationId, type, payload: payload as Prisma.InputJsonValue },
      });
    },
  };
}
