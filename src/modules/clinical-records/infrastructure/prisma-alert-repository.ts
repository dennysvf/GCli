import { newId } from "@/shared/kernel/ids";
import type { AlertRepository } from "../application/ports";

// The clinical alert of a patient and its append-only history (spec F07 section 6).
export const prismaAlertRepository: AlertRepository = {
  async find(uow, patientId) {
    const row = await uow.tx.clinicalAlert.findFirst({ where: { patientId } });
    return row ? { id: row.id, text: row.text, version: row.version } : null;
  },

  async create(uow, row, actor) {
    try {
      await uow.tx.clinicalAlert.create({
        data: { ...row, organizationId: actor.organizationId, updatedById: actor.userId },
      });
      return "OK";
    } catch (error) {
      // Two people creating the first alert of the patient at once: the unique index decides.
      if ((error as { code?: string }).code === "P2002") return "DUPLICATE";
      throw error;
    }
  },

  async update(uow, row, actor) {
    const updated = await uow.tx.clinicalAlert.updateMany({
      where: { id: row.id, version: row.expectedVersion },
      data: { text: row.text, updatedById: actor.userId, version: { increment: 1 } },
    });
    if (updated.count === 0) return "STALE";
    await uow.tx.clinicalAlertChange.create({
      data: {
        id: newId(),
        organizationId: actor.organizationId,
        alertId: row.id,
        previousText: row.previousText,
        changedById: actor.userId,
      },
    });
    return "OK";
  },
};
