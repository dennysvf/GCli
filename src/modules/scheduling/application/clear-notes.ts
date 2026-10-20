import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import { ok, type Result } from "@/shared/kernel/result";

// PRD F14 anonymization of the appointments, called by the privacy module inside its own
// transaction (ADR-040). The appointments stay for statistics and accounting under the anonymized
// identity; only their free texts (front desk notes and cancellation notes), which may name the
// person, are cleared. The audit entry carries counts, never the texts.
export async function clearPatientNotesIn(
  ctx: RequestContext,
  uow: UnitOfWork,
  patientId: string,
): Promise<Result<{ cleared: number }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const updated = await uow.tx.appointment.updateMany({
    where: { patientId, OR: [{ notes: { not: null } }, { cancellationNote: { not: null } }] },
    data: { notes: null, cancellationNote: null, version: { increment: 1 }, updatedById: ctx.user.id },
  });
  if (updated.count > 0) {
    await uow.audit.record({
      action: "UPDATE",
      entityType: "appointment",
      summary: "Observações dos agendamentos apagadas na anonimização",
      changes: { notes: { changed: true, beforeLength: 0, afterLength: 0 } },
      metadata: { patientId, clearedNotes: updated.count },
    });
  }
  return ok({ cleared: updated.count });
}
