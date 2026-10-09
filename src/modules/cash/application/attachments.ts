import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { objectKey } from "@/shared/storage/object-storage";
import { CashErrors } from "../domain/errors";
import type { CashDeps } from "./ports";
import { attachmentIdSchema, attachmentIntentSchema } from "./schemas";
import { authorizeAny } from "./support";

export type UploadIntent = {
  attachmentId: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

const ACTIONS = ["cash:operate", "finance:manage"] as const;

// A file name safe for an object key: the original name is kept in the row for the download.
function keyName(fileName: string): string {
  return fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

// PRD F11: receipts go straight to the bucket with a presigned PUT (ADR-031); the movement or entry
// that uses it marks it attached. Pending uploads are cleaned daily.
export async function createUploadIntent(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<UploadIntent>> {
  const allowed = await authorizeAny(ctx, ACTIONS);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(attachmentIntentSchema, input);
  if (!parsed.ok) return fail(CashErrors.attachmentInvalid());
  const data = parsed.value;
  const id = deps.newId();
  const key = objectKey(ctx.organizationId, "finance", `${id}-${keyName(data.fileName)}`);
  const uploadUrl = await deps.storage.presignUpload(key, data.contentType, data.sizeBytes);
  return withTransaction(ctx, async (uow) => {
    await uow.tx.financialAttachment.create({
      data: {
        id,
        organizationId: ctx.organizationId,
        objectKey: key,
        fileName: data.fileName,
        contentType: data.contentType,
        sizeBytes: data.sizeBytes,
        status: "PENDING",
        uploadedById: ctx.user.id,
      },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "financial_attachment",
      entityId: id,
      summary: "Comprovante financeiro enviado",
      metadata: { contentType: data.contentType, sizeBytes: data.sizeBytes },
    });
    return ok({ attachmentId: id, uploadUrl, headers: { "Content-Type": data.contentType } });
  });
}

// A short-lived download URL for an attachment of the organization.
export async function getAttachmentDownload(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ url: string }>> {
  const allowed = await authorizeAny(ctx, ACTIONS);
  if (!allowed.ok) return allowed;
  const parsed = parseInput(attachmentIdSchema, input);
  if (!parsed.ok) return parsed;
  const found = await withTransaction(ctx, async (uow) =>
    ok(await deps.reads.attachment(uow, parsed.value.attachmentId)),
  );
  if (!found.ok) return found;
  if (!found.value || found.value.status !== "ATTACHED") return fail(CashErrors.attachmentInvalid());
  return ok({ url: await deps.storage.presignDownload(found.value.objectKey, found.value.fileName) });
}
