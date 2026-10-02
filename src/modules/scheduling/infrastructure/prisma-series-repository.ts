import type { SeriesRecord, SeriesRepository } from "../application/ports";
import type { SeriesFrequency } from "../domain/recurrence";

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

export const prismaSeriesRepository: SeriesRepository = {
  async find(uow, id) {
    const row = await uow.tx.appointmentSeries.findFirst({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      unitId: row.unitId,
      professionalId: row.professionalId,
      serviceId: row.serviceId,
      patientId: row.patientId,
      roomId: row.roomId,
      frequency: row.frequency as SeriesFrequency,
      weekdays: row.weekdays,
      startMinute: row.startMinute,
      durationMinutes: row.durationMinutes,
      firstDate: fromDbDate(row.firstDate),
      endsOn: row.endsOn ? fromDbDate(row.endsOn) : null,
      occurrenceCount: row.occurrenceCount,
      endsAfterIndex: row.endsAfterIndex,
      previousSeriesId: row.previousSeriesId,
      version: row.version,
    } satisfies SeriesRecord;
  },

  async create(uow, series, actor) {
    await uow.tx.appointmentSeries.create({
      data: {
        id: series.id,
        organizationId: actor.organizationId,
        unitId: series.unitId,
        professionalId: series.professionalId,
        serviceId: series.serviceId,
        patientId: series.patientId,
        roomId: series.roomId,
        frequency: series.frequency,
        weekdays: series.weekdays,
        startMinute: series.startMinute,
        durationMinutes: series.durationMinutes,
        firstDate: toDbDate(series.firstDate),
        endsOn: series.endsOn ? toDbDate(series.endsOn) : null,
        occurrenceCount: series.occurrenceCount,
        endsAfterIndex: series.endsAfterIndex,
        previousSeriesId: series.previousSeriesId,
        createdById: actor.userId,
      },
    });
  },

  async endAfter(uow, id, index) {
    await uow.tx.appointmentSeries.updateMany({
      where: { id },
      data: { endsAfterIndex: index, version: { increment: 1 } },
    });
  },
};
