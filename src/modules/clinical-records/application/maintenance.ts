import type { SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { ok, type Result } from "@/shared/kernel/result";
import { clinicalEvent, CLINICAL_RECORDS_EVENTS } from "../domain/events";
import type { ClinicalRecordsDeps } from "./ports";

// Work done by the worker, not by a user (architecture 5.5).

// Finalizes a draft whose 24 hours ended and discards a pending edit (PRD F07 clarified by spec
// F07): the encounter record must not stay hidden or editable forever. The audit actor is SYSTEM.
// A stale version means someone else changed the note meanwhile; the next run looks again.
export async function autoFinalizeNote(
  deps: ClinicalRecordsDeps,
  input: { organizationId: string; noteId: string },
): Promise<Result<{ finalized: boolean; discardedEdit: boolean }>> {
  const ctx: SystemContext = {
    kind: "system",
    requestId: newId(),
    organizationId: input.organizationId,
    ipAddress: null,
    userAgent: null,
  };
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const note = await deps.notes.findById(uow, input.noteId);
    if (!note) return ok({ finalized: false, discardedEdit: false });
    const expected = note.snapshot.version;
    const outcome = note.autoFinalize(now);
    if (!outcome.finalized && !outcome.discardedEdit) return ok(outcome);
    const saved = await deps.notes.save(uow, note, expected, {
      userId: "",
      organizationId: input.organizationId,
    });
    if (saved !== "OK") return ok({ finalized: false, discardedEdit: false });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "clinical_note",
      entityId: input.noteId,
      summary: outcome.finalized
        ? "Registro clínico finalizado automaticamente"
        : "Edição pendente do registro clínico descartada no bloqueio",
      metadata: { automatic: true, ...outcome },
    });
    if (outcome.finalized) {
      const props = note.snapshot;
      await uow.publish(
        clinicalEvent(
          CLINICAL_RECORDS_EVENTS.noteFinalized,
          {
            noteId: props.id,
            patientId: props.patientId,
            appointmentId: props.appointmentId,
            professionalId: props.professionalId,
            actorUserId: null,
            automatic: true,
          },
          now,
        ),
      );
    }
    return ok(outcome);
  });
}
