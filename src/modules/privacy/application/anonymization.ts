import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { namesMatch, newAnonymizationCode, placeholderName } from "../domain/anonymization";
import {
  anonymizationOutcome,
  type AnonymizationFacts,
  type AnonymizationOutcome,
} from "../domain/eligibility";
import { PrivacyErrors } from "../domain/errors";
import type { LgpdRequest } from "../domain/lgpd-request";
import type { PrivacyDeps } from "./ports";
import { anonymizeSchema, requestIdSchema } from "./schemas";

// Anonymization (PRD F14 Full Scope, spec decisions D16–D19, ADR-040). The preview and the
// anonymization share the same rules, checked in order: clinical records mean legal retention;
// future appointments or open charges block; only then is the typed name compared.

export type AnonymizationDeps = Pick<
  PrivacyDeps,
  "requests" | "exports" | "data" | "patients" | "steps" | "clock" | "random"
>;

export type AnonymizationPreview = {
  outcome: AnonymizationOutcome;
  findings: AnonymizationFacts;
  patientDisplayName: string;
  version: number;
};

// A unique code has to be found among 16^6 values; a handful of tries is plenty.
const CODE_ATTEMPTS = 5;

function anonymizationRequest(request: LgpdRequest | null): Result<LgpdRequest> {
  if (!request) return fail(PrivacyErrors.requestNotFound());
  if (request.snapshot.type !== "ANONYMIZATION") return fail(PrivacyErrors.typeMismatch());
  if (!request.isOpen()) return fail(PrivacyErrors.requestClosed());
  return ok(request);
}

// Step 1 of the dialog: what the rules find, with no change and no audit (it reads no personal
// content, only counts).
export async function previewAnonymization(
  deps: AnonymizationDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AnonymizationPreview>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(requestIdSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  const loaded = await withTransaction(ctx, async (uow) => {
    const request = anonymizationRequest(await deps.requests.findById(uow, parsed.value.requestId));
    if (!request.ok) return request;
    const props = request.value.snapshot;
    return ok({ props, facts: await deps.data.facts(uow, ctx.organizationId, props.patientId, now) });
  });
  if (!loaded.ok) return loaded;
  const patient = await deps.patients.patient(ctx, loaded.value.props.patientId);
  if (!patient.ok) return patient;
  if (patient.value.anonymized) return fail(PrivacyErrors.patientAnonymized());
  return ok({
    outcome: anonymizationOutcome(loaded.value.facts),
    findings: loaded.value.facts,
    patientDisplayName: patient.value.displayName,
    version: loaded.value.props.version,
  });
}

export type AnonymizationResult =
  { outcome: "ANONYMIZED"; placeholder: string; erasedDocuments: number } | { outcome: "LEGAL_RETENTION" };

// Step 2: one transaction with the patient row locked and the rules checked again. Legal retention
// is recorded whatever is typed, because nothing personal changes; a block or a different name
// changes nothing. Otherwise every module that owns the data changes it, the patient's ready exports
// are expired (their files deleted after commit) and the request is completed.
export async function anonymizePatient(
  deps: AnonymizationDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AnonymizationResult>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(anonymizeSchema, input);
  if (!parsed.ok) return parsed;
  const { requestId, typedName, version } = parsed.value;
  const now = deps.clock();
  const organizationId = ctx.organizationId;

  return withTransaction<AnonymizationResult>(ctx, async (uow) => {
    const found = anonymizationRequest(await deps.requests.findById(uow, requestId, { lock: true }));
    if (!found.ok) return found;
    const request = found.value;
    if (request.snapshot.version !== version) return fail(CommonErrors.staleVersion());
    const patientId = request.snapshot.patientId;
    const before = request.snapshot.status;
    const patient = await deps.data.lockPatient(uow, organizationId, patientId);
    if (!patient) return fail(PrivacyErrors.patientNotFound());
    if (patient.anonymized) return fail(PrivacyErrors.patientAnonymized());
    const facts = await deps.data.facts(uow, organizationId, patientId, now);
    const outcome = anonymizationOutcome(facts);

    if (outcome === "LEGAL_RETENTION") {
      const retained = request.registerRetention(ctx.user.id, now);
      if (!retained.ok) return retained;
      if ((await deps.requests.save(uow, request, version)) === "STALE")
        return fail(CommonErrors.staleVersion());
      await uow.audit.record({
        action: "UPDATE",
        entityType: "lgpd_request",
        entityId: request.id,
        summary: "Solicitação de anonimização registrada — retenção legal",
        changes: { status: { before, after: "LEGAL_RETENTION" } },
        metadata: { patientId, findings: facts },
      });
      return ok({ outcome: "LEGAL_RETENTION" as const });
    }
    if (outcome === "BLOCKED") return fail(PrivacyErrors.anonymizationBlocked());
    if (!namesMatch(typedName, patient.fullName)) return fail(PrivacyErrors.nameMismatch());

    let code = newAnonymizationCode(deps.random);
    for (let attempt = 1; await deps.data.anonymizationCodeTaken(uow, organizationId, code); attempt++) {
      if (attempt >= CODE_ATTEMPTS) throw new Error("no free anonymization code");
      code = newAnonymizationCode(deps.random);
    }
    const placeholder = placeholderName(code);

    const anonymized = await deps.steps.anonymizePatient(ctx, uow, { patientId, code, placeholder });
    if (!anonymized.ok) return anonymized;
    const erased = await deps.steps.eraseDocuments(ctx, uow, patientId);
    if (!erased.ok) return erased;
    const cleared = await deps.steps.clearAppointmentNotes(ctx, uow, patientId);
    if (!cleared.ok) return cleared;

    // An export holds the identity that was just erased: it is no longer offered.
    for (const item of await deps.exports.readyForPatient(uow, patientId)) {
      const key = item.expire(now);
      if (!key) continue;
      await deps.exports.save(uow, item);
      await uow.outbox.add("privacy.export-delete", { organizationId, exportId: item.id, objectKey: key });
      await uow.audit.record({
        action: "UPDATE",
        entityType: "lgpd_export",
        entityId: item.id,
        summary: "Exportação LGPD expirada na anonimização",
        changes: { status: { before: "READY", after: "EXPIRED" } },
        metadata: { patientId, requestId: item.snapshot.requestId },
      });
    }

    const completed = request.completeAnonymization(ctx.user.id, now);
    if (!completed.ok) return completed;
    if ((await deps.requests.save(uow, request, version)) === "STALE")
      return fail(CommonErrors.staleVersion());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "lgpd_request",
      entityId: request.id,
      summary: "Paciente anonimizado",
      changes: { status: { before, after: "COMPLETED" } },
      metadata: {
        patientId,
        anonymizedCode: code,
        erasedDocuments: erased.value.erased,
        clearedNotes: cleared.value.cleared,
      },
    });
    return ok({ outcome: "ANONYMIZED" as const, placeholder, erasedDocuments: erased.value.erased });
  });
}
