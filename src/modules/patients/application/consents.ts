import { authorize, recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { objectKey } from "@/shared/storage/object-storage";
import type { ConsentMethod } from "../domain/consent";
import { CONSENT_FILE_MAX_BYTES } from "../domain/limits";
import { PatientsErrors } from "./errors";
import { canViewPatient } from "./policies";
import type { PatientsDeps } from "./ports";
import { recordConsentSchema } from "./schemas";

export type ConsentItem = {
  id: string;
  termsVersion: number;
  consentedAt: string;
  method: ConsentMethod;
  recordedByName: string | null;
  fileName: string | null;
};

// Accepted signed-term files, checked by their first bytes rather than the declared type.
const SIGNATURES: { type: string; bytes: number[] }[] = [
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

export function detectFileType(bytes: Uint8Array): string | null {
  const match = SIGNATURES.find((signature) => signature.bytes.every((byte, index) => bytes[index] === byte));
  return match?.type ?? null;
}

// ADR-023: the signed term goes through the server, which checks it and stores it privately. The
// returned token is consumed when the consent is recorded.
export async function storeConsentFile(
  deps: PatientsDeps,
  ctx: RequestContext,
  file: { bytes: Uint8Array; name: string },
): Promise<Result<{ uploadToken: string; fileName: string; size: number }>> {
  const allowed = await authorize(ctx, "patient:manage");
  if (!allowed.ok) return allowed;
  const contentType = detectFileType(file.bytes);
  if (!contentType || file.bytes.length === 0 || file.bytes.length > CONSENT_FILE_MAX_BYTES) {
    return fail(PatientsErrors.invalidFile());
  }
  const id = newId();
  // Object keys never contain personal data (architecture 5.6).
  const key = objectKey(ctx.organizationId, "patients", id);
  await deps.files.put(key, file.bytes, contentType);
  const fileName = file.name.slice(0, 150) || "termo";
  const saved = await withTransaction(ctx, async (uow) => {
    await uow.tx.consentUpload.create({
      data: {
        id,
        organizationId: ctx.organizationId,
        objectKey: key,
        fileName,
        fileSize: file.bytes.length,
        contentType,
        uploadedById: ctx.user.id,
      },
    });
    return ok({ uploadToken: id, fileName, size: file.bytes.length });
  });
  if (!saved.ok) await deps.files.delete(key);
  return saved;
}

export async function listConsents(
  deps: PatientsDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<Result<ConsentItem[]>> {
  if (!(await canViewPatient(deps, ctx, patientId))) {
    await recordDenial(ctx, "patient:read", patientId);
    return fail(CommonErrors.forbidden());
  }
  const rows = await withTransaction(ctx, async (uow) =>
    ok(
      await uow.tx.consentRecord.findMany({
        where: { patientId },
        orderBy: { consentedAt: "desc" },
        include: { termsVersion: { select: { version: true } } },
      }),
    ),
  );
  if (!rows.ok) return rows;
  const names = await deps.userNames(
    ctx,
    rows.value.map((row) => row.recordedById),
  );
  return ok(
    rows.value.map((row) => ({
      id: row.id,
      termsVersion: row.termsVersion.version,
      consentedAt: row.consentedAt.toISOString(),
      method: row.method as ConsentMethod,
      recordedByName: names.get(row.recordedById) ?? null,
      fileName: row.fileName,
    })),
  );
}

// PRD F05: consent records terms version, date/time, method and staff user; the file is optional.
export async function recordConsent(
  deps: PatientsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ consentId: string; termsVersion: number }>> {
  const allowed = await authorize(ctx, "patient:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(recordConsentSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, method, uploadToken } = parsed.value;
  const now = deps.clock();

  return withTransaction(ctx, async (uow) => {
    const patient = await uow.tx.patient.findFirst({ where: { id: patientId }, select: { active: true } });
    if (!patient) return fail(PatientsErrors.notFound());
    if (!patient.active) return fail(PatientsErrors.inactive());
    const terms = await uow.tx.privacyTermsVersion.findFirst({ orderBy: { version: "desc" } });
    if (!terms) return fail(PatientsErrors.noTerms());

    let file: { objectKey: string; fileName: string; fileSize: number } | null = null;
    if (uploadToken) {
      const claimed = await uow.tx.consentUpload.updateMany({
        where: { id: uploadToken, consumedAt: null },
        data: { consumedAt: now },
      });
      const upload = await uow.tx.consentUpload.findFirst({ where: { id: uploadToken } });
      if (claimed.count !== 1 || !upload || !(await deps.files.head(upload.objectKey))) {
        return fail(PatientsErrors.uploadNotFound());
      }
      file = { objectKey: upload.objectKey, fileName: upload.fileName, fileSize: upload.fileSize };
    }

    const id = newId();
    await uow.tx.consentRecord.create({
      data: {
        id,
        organizationId: ctx.organizationId,
        patientId,
        termsVersionId: terms.id,
        consentedAt: now,
        method,
        recordedById: ctx.user.id,
        fileObjectKey: file?.objectKey ?? null,
        fileName: file?.fileName ?? null,
        fileSize: file?.fileSize ?? null,
      },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "consent_record",
      entityId: id,
      summary: `Consentimento registrado (termos versão ${terms.version})`,
      metadata: { patientId, method, termsVersion: terms.version, withFile: file !== null },
    });
    return ok({ consentId: id, termsVersion: terms.version });
  });
}

// Signed term downloads: authorized, audited and served through a 5-minute link (architecture 5.6).
export async function getConsentFileUrl(
  deps: PatientsDeps,
  ctx: RequestContext,
  consentId: string,
): Promise<Result<{ url: string }>> {
  const found = await withTransaction(ctx, async (uow) =>
    ok(
      await uow.tx.consentRecord.findFirst({
        where: { id: consentId },
        select: { id: true, patientId: true, fileObjectKey: true },
      }),
    ),
  );
  if (!found.ok) return found;
  const consent = found.value;
  if (!consent?.fileObjectKey) return fail(PatientsErrors.notFound());
  if (!(await canViewPatient(deps, ctx, consent.patientId))) {
    await recordDenial(ctx, "patient:read", consent.patientId);
    return fail(CommonErrors.forbidden());
  }
  const url = await deps.files.presignGet(consent.fileObjectKey);
  await withTransaction(ctx, async (uow) => {
    await uow.audit.record({
      action: "READ_SENSITIVE",
      entityType: "consent_record",
      entityId: consent.id,
      summary: "Termo de consentimento assinado acessado",
      metadata: { patientId: consent.patientId },
    });
    return ok(undefined);
  });
  return ok({ url });
}
