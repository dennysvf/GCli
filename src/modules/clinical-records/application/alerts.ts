import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { ClinicalErrors } from "../domain/errors";
import { ALERT_MAX_CHARACTERS } from "../domain/limits";
import { requirePatientAccess } from "./policies";
import type { ClinicalRecordsDeps } from "./ports";
import { updateAlertSchema } from "./schemas";
import { contentChange } from "./support";

export type AlertResult = { text: string; version: number };

// The clinical alert of a patient (spec F07 section 3), for example "Alergia a dipirona". It is
// clinical data: only readers who pass the records policy see it, and every change keeps the
// previous text. An empty text clears the alert and is recorded as a change.
export async function updateClinicalAlert(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AlertResult>> {
  const parsed = parseInput(updateAlertSchema, input);
  if (!parsed.ok) return parsed;
  const access = await requirePatientAccess(deps, ctx, parsed.value.patientId, "clinical:write");
  if (!access.ok) return access;
  const text = parsed.value.text.trim();
  if (Array.from(text).length > ALERT_MAX_CHARACTERS) return fail(ClinicalErrors.alertTooLong());
  const actor = { userId: ctx.user.id, organizationId: ctx.organizationId };

  return withTransaction(ctx, async (uow) => {
    const current = await deps.alerts.find(uow, parsed.value.patientId);
    if (!current) {
      if (parsed.value.version !== 0) return fail(ClinicalErrors.noteStale());
      const id = newId();
      const created = await deps.alerts.create(uow, { id, patientId: parsed.value.patientId, text }, actor);
      if (created === "DUPLICATE") return fail(ClinicalErrors.noteStale());
      await uow.audit.record({
        action: "CREATE",
        entityType: "clinical_alert",
        entityId: id,
        summary: "Alerta clínico registrado",
        changes: { text: contentChange(0, text.length) },
        metadata: { patientId: parsed.value.patientId },
      });
      return ok({ text, version: 1 });
    }
    if (current.version !== parsed.value.version) return fail(ClinicalErrors.noteStale());
    const outcome = await deps.alerts.update(
      uow,
      { id: current.id, text, previousText: current.text, expectedVersion: current.version },
      actor,
    );
    if (outcome === "STALE") return fail(ClinicalErrors.noteStale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "clinical_alert",
      entityId: current.id,
      summary: "Alerta clínico atualizado",
      changes: { text: contentChange(current.text.length, text.length) },
      metadata: { patientId: parsed.value.patientId },
    });
    return ok({ text, version: current.version + 1 });
  });
}
