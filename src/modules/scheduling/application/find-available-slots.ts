import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { addDays, formatMinute } from "@/shared/kernel/calendar-date";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { rangeAt } from "../domain/agenda-time";
import { findAvailableSlots, type AvailabilityCandidate } from "../domain/availability";
import { SchedulingErrors } from "../domain/errors";
import { AVAILABILITY_MAX_DAYS, AVAILABILITY_MAX_SLOTS } from "../domain/limits";
import { candidateRooms } from "./booking";
import { loadConflictContext } from "./conflict-context";
import type { SchedulingDeps } from "./ports";
import { availabilitySchema } from "./schemas";

export type AvailableSlotDto = {
  date: string;
  startTime: string;
  startsAt: string;
  professionalId: string;
  professionalName: string;
  roomId: string | null;
  roomName: string | null;
};

// "Próximo horário livre" (PRD F06): the next 10 free slots for a service, optionally for one
// professional, within 60 days, respecting every conflict rule.
export async function findNextAvailableSlots(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ slots: AvailableSlotDto[]; searchedUntil: string }>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(availabilitySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const [organization, unit, services] = await Promise.all([
    deps.directory.organization(ctx),
    deps.directory.unit(ctx, data.unitId),
    deps.directory.services(ctx, [data.serviceId]),
  ]);
  const service = services[0];
  if (!unit || !unit.active) return fail(SchedulingErrors.inactiveResource("A unidade"));
  if (!service || !service.active) return fail(SchedulingErrors.inactiveResource("O serviço"));

  const bookable = await deps.directory.bookableProfessionals(ctx, {
    serviceId: service.id,
    unitId: unit.id,
  });
  const people = data.professionalId ? bookable.filter((item) => item.id === data.professionalId) : bookable;
  const rooms = await candidateRooms(deps, ctx, unit, service.id);
  if (rooms && rooms.length === 0) return fail(SchedulingErrors.noRoomAvailable());

  const now = deps.clock();
  const today = utcToZonedParts(now, unit.timeZone).date;
  const window = {
    from: now,
    to: rangeAt(addDays(today, AVAILABILITY_MAX_DAYS), 0, 5, unit.timeZone).start,
  };
  const candidates: AvailabilityCandidate[] = await Promise.all(
    people.map(async (person) => ({
      professionalId: person.id,
      professionalName: person.displayName,
      rooms,
      context: await loadConflictContext(deps, ctx, {
        unit,
        professionalId: person.id,
        professionalName: person.displayName,
        roomIds: rooms?.map((room) => room.id) ?? [],
        roomName: null,
        patientId: null,
        window,
      }),
    })),
  );
  const found = findAvailableSlots(candidates, {
    unitId: unit.id,
    durationMinutes: data.durationMinutes ?? service.durationMinutes,
    granularity: organization.granularity,
    timeZone: unit.timeZone,
    now,
    maxDays: AVAILABILITY_MAX_DAYS,
    maxSlots: AVAILABILITY_MAX_SLOTS,
  });
  return ok({
    slots: found.slots.map((slot) => ({
      date: slot.date,
      startTime: formatMinute(slot.startMinute),
      startsAt: slot.startsAt.toISOString(),
      professionalId: slot.professionalId,
      professionalName: slot.professionalName,
      roomId: slot.roomId,
      roomName: slot.roomName,
    })),
    searchedUntil: found.searchedUntil,
  });
}
