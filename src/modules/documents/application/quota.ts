import { can } from "@/shared/authz/permissions";
import { recordDenial } from "@/shared/authz/guard";
import type { AnyContext, RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { DocumentsErrors } from "../domain/errors";
import { QUOTA_BYTES, QUOTA_GB } from "../domain/limits";
import { canStore, crossedAlert, usageLevel, usagePercent, type UsageLevel } from "../domain/quota";
import type { DocumentsDeps } from "./ports";

// Storage quota of the documents (PRD F08): 50 GB for the files of this feature. One row per
// organization holds the total, and it is updated under a row lock in the same transaction as the
// document, so two uploads that finish together cannot both pass the limit (ADR-033).

export type StorageUsage = { usedBytes: number; quotaBytes: number; percent: number; level: UsageLevel };

export function usageOf(usedBytes: number): StorageUsage {
  return {
    usedBytes,
    quotaBytes: QUOTA_BYTES,
    percent: usagePercent(usedBytes),
    level: usageLevel(usedBytes),
  };
}

type UsageRow = { used_bytes: bigint; alert_sent_at: Date | null };

// Reads the counter without locking it (the soft check of an upload intent and the screens).
export async function readUsedBytes(uow: UnitOfWork): Promise<number> {
  const row = await uow.tx.documentStorageUsage.findFirst({ select: { usedBytes: true } });
  return Number(row?.usedBytes ?? 0);
}

// Everyone who can upload sees the usage (the notice of the upload dialog); the settings page also
// shows it to those who manage the documents.
export async function getStorageUsage(ctx: RequestContext): Promise<Result<StorageUsage>> {
  if (!can(ctx, "document:upload") && !can(ctx, "setup:manage")) {
    await recordDenial(ctx, "document:upload");
    return fail(CommonErrors.forbidden());
  }
  return withTransaction(ctx, async (uow) => ok(usageOf(await readUsedBytes(uow))));
}

// Adds `bytes` to the counter. Uploads enforce the quota; generated PDFs and converted HEIC files
// are counted but never blocked (spec F08). When the usage reaches 80% for the first time, one
// email per administrator is queued in the same transaction.
export async function chargeUsage(
  deps: DocumentsDeps,
  ctx: AnyContext,
  uow: UnitOfWork,
  organizationId: string,
  bytes: number,
  options: { enforce: boolean },
): Promise<Result<{ before: number; after: number }>> {
  await uow.tx.$executeRaw`
    INSERT INTO document_storage_usage (organization_id, used_bytes, updated_at)
    VALUES (${organizationId}::uuid, 0, now())
    ON CONFLICT DO NOTHING`;
  const rows = await uow.tx.$queryRaw<UsageRow[]>`
    SELECT used_bytes, alert_sent_at FROM document_storage_usage
    WHERE organization_id = ${organizationId}::uuid
    FOR UPDATE`;
  const before = Number(rows[0]?.used_bytes ?? 0);
  if (options.enforce && !canStore(before, bytes)) return fail(DocumentsErrors.quotaExceeded());
  const after = before + bytes;
  const crossed = crossedAlert(before, after);
  await uow.tx.$executeRaw`
    UPDATE document_storage_usage
    SET used_bytes = ${after}::bigint, updated_at = now(),
        alert_sent_at = CASE WHEN ${crossed}::boolean THEN now() ELSE alert_sent_at END
    WHERE organization_id = ${organizationId}::uuid`;
  if (crossed) {
    const administrators = await deps.directory.administrators(ctx);
    for (const admin of administrators) {
      await uow.outbox.add("email.storage-quota-alert", {
        to: admin.email,
        name: admin.name,
        locale: admin.locale,
        percent: usagePercent(after),
        quotaGb: QUOTA_GB,
      });
    }
    await uow.audit.record({
      action: "UPDATE",
      entityType: "document_storage_usage",
      summary: "Armazenamento de documentos chegou a 80% da cota",
      metadata: { percent: usagePercent(after), notified: administrators.length },
    });
  }
  return ok({ before, after });
}
