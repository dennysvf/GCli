import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { addDays, daysBetween } from "@/shared/kernel/calendar-date";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { ok } from "@/shared/kernel/result";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import type { ConflictContext, ExistingAppointment, LocalInterval } from "../domain/conflicts/types";
import { AGENDA_MAX_DAYS } from "../domain/limits";
import type { SchedulingDeps, UnitInfo } from "./ports";

// Loads everything the conflict strategies need for one professional in one unit over a window
// (one booking, a whole series or the availability search), so the domain stays pure.

export type ContextRequest = {
  unit: UnitInfo;
  professionalId: string;
  professionalName: string;
  roomIds: string[];
  roomName: string | null;
  patientId: string | null;
  window: { from: Date; to: Date };
};

async function workingData(
  deps: SchedulingDeps,
  ctx: RequestContext,
  request: ContextRequest,
): Promise<{ intervals: Map<string, LocalInterval[]>; timeOffs: ConflictContext["timeOffs"] }> {
  const zone = request.unit.timeZone;
  const firstDate = utcToZonedParts(request.window.from, zone).date;
  const lastDate = utcToZonedParts(request.window.to, zone).date;
  const intervals = new Map<string, LocalInterval[]>();
  const timeOffs = new Map<string, ConflictContext["timeOffs"][number]>();
  // getWorkingCalendar answers at most 62 days per call (spec F04 section 5).
  for (let from = firstDate; from <= lastDate; from = addDays(from, AGENDA_MAX_DAYS)) {
    const to = daysBetween(from, lastDate) < AGENDA_MAX_DAYS ? lastDate : addDays(from, AGENDA_MAX_DAYS - 1);
    const calendar = await deps.directory.workingCalendar(ctx, request.professionalId, { from, to });
    for (const day of calendar?.days ?? []) {
      const unit = day.units.find((item) => item.unitId === request.unit.id);
      if (unit) intervals.set(day.date, unit.intervals);
    }
    for (const item of calendar?.timeOffs ?? []) {
      const range = DateTimeRange.of(item.startsAt, item.endsAt);
      if (range.ok)
        timeOffs.set(`${item.startsAt.toISOString()}|${item.endsAt.toISOString()}`, {
          range: range.value,
          type: item.type,
        });
    }
  }
  return { intervals, timeOffs: [...timeOffs.values()] };
}

export async function loadConflictContext(
  deps: SchedulingDeps,
  ctx: RequestContext,
  request: ContextRequest,
): Promise<ConflictContext> {
  const [working, existing] = await Promise.all([
    workingData(deps, ctx, request),
    withTransaction(ctx, async (uow) =>
      ok(
        await deps.appointments.findOverlapping(uow, {
          from: request.window.from,
          to: request.window.to,
          professionalIds: [request.professionalId],
          roomIds: request.roomIds,
          patientIds: request.patientId ? [request.patientId] : [],
        }),
      ),
    ),
  ]);
  const rows = existing.ok ? existing.value : [];
  const names = new Map(
    (await deps.directory.professionals(ctx, [...new Set(rows.map((row) => row.professionalId))])).map(
      (item) => [item.id, item.displayName],
    ),
  );
  const appointments: ExistingAppointment[] = rows.map((row) => ({
    ...row,
    professionalName: names.get(row.professionalId) ?? "",
  }));
  return {
    timeZone: request.unit.timeZone,
    now: deps.clock(),
    professionalName: request.professionalName,
    roomName: request.roomName,
    appointments,
    workingIntervals: working.intervals,
    timeOffs: working.timeOffs,
    businessHours: request.unit.businessHours,
    closures: request.unit.closures,
  };
}
