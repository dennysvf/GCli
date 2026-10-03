import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { parseTime } from "@/shared/kernel/calendar-date";
import type { DomainError } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { interpolate } from "@/shared/kernel/action-result";
import { localTime } from "../domain/agenda-time";
import { isAlignedStart, rangeAt } from "../domain/agenda-time";
import type { AvailabilityDecision } from "../domain/appointment";
import type { Resolution } from "../domain/conflicts/check";
import type { Finding } from "../domain/conflicts/types";
import { SchedulingErrors } from "../domain/errors";
import { findingMessages } from "../notices";
import type {
  OrganizationInfo,
  PatientInfo,
  ProfessionalInfo,
  SchedulingDeps,
  ServiceInfo,
  UnitInfo,
} from "./ports";

// Steps shared by booking, editing, rescheduling and series: resolving and validating the
// referenced records (PRD F06 Capabilities, Consumes), the start instant, and turning conflict
// results into errors the panel can show.

export type BookingRefs = {
  organization: OrganizationInfo;
  unit: UnitInfo;
  service: ServiceInfo;
  professional: ProfessionalInfo;
  room: { id: string; name: string } | null;
  patient: PatientInfo | null;
  // The price of the service in the currency of the unit (PRD F16).
  priceMinor: number;
};

export async function resolveRefs(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: {
    unitId: string;
    serviceId: string;
    professionalId: string;
    roomId: string | null;
    patientId: string | null;
  },
): Promise<Result<BookingRefs>> {
  const [organization, unit, services, professionals, patients] = await Promise.all([
    deps.directory.organization(ctx),
    deps.directory.unit(ctx, input.unitId),
    deps.directory.services(ctx, [input.serviceId]),
    deps.directory.professionals(ctx, [input.professionalId]),
    input.patientId ? deps.directory.patients(ctx, [input.patientId]) : Promise.resolve([]),
  ]);
  const service = services[0];
  const professional = professionals[0];
  const patient = patients[0] ?? null;
  if (!unit) return fail(SchedulingErrors.validation({ unitId: "scheduling.validation.unitNotFound" }));
  if (!unit.active) return fail(SchedulingErrors.inactiveResource("unit"));
  if (!service)
    return fail(SchedulingErrors.validation({ serviceId: "scheduling.validation.serviceNotFound" }));
  if (!service.active) return fail(SchedulingErrors.inactiveResource("service"));
  if (!professional)
    return fail(
      SchedulingErrors.validation({ professionalId: "scheduling.validation.professionalNotFound" }),
    );
  if (!professional.active) return fail(SchedulingErrors.inactiveResource("professional"));
  if (input.patientId) {
    if (!patient)
      return fail(SchedulingErrors.validation({ patientId: "scheduling.validation.patientNotFound" }));
    if (!patient.active) return fail(SchedulingErrors.inactiveResource("patient"));
  }
  // PRD F06: the professional must have the service enabled (F04).
  if (!(await deps.directory.isServiceEnabled(ctx, professional.id, service.id))) {
    return fail(SchedulingErrors.serviceNotEnabled());
  }
  // PRD F16: the price snapshot is the service price in the currency of the unit.
  const price = priceIn(service.prices, unit.currency);
  if (price === null) return fail(SchedulingErrors.noPriceForCurrency(unit.currency));
  const room = await resolveRoom(deps, ctx, unit, service, input.roomId);
  if (!room.ok) return room;
  return ok({ organization, unit, service, professional, room: room.value, patient, priceMinor: price });
}

// PRD F06: room required when the service requires one, restricted to its allowed rooms (F03,
// per unit). Without the requirement a room is optional and any active room of the unit fits.
async function resolveRoom(
  deps: SchedulingDeps,
  ctx: RequestContext,
  unit: UnitInfo,
  service: ServiceInfo,
  roomId: string | null,
): Promise<Result<{ id: string; name: string } | null>> {
  const allowed = await deps.directory.allowedRooms(ctx, service.id, unit.id);
  const unitRooms = unit.rooms.filter((room) => room.active);
  if (allowed?.requiresRoom) {
    const rooms = allowed.rooms === "any" ? unitRooms : allowed.rooms;
    if (rooms.length === 0) return fail(SchedulingErrors.noRoomAvailable());
    if (!roomId) return fail(SchedulingErrors.roomRequired());
    const room = rooms.find((item) => item.id === roomId);
    return room ? ok({ id: room.id, name: room.name }) : fail(SchedulingErrors.roomNotAllowed());
  }
  if (!roomId) return ok(null);
  const room = unitRooms.find((item) => item.id === roomId);
  return room ? ok({ id: room.id, name: room.name }) : fail(SchedulingErrors.roomNotAllowed());
}

// Rooms a booking for this service may use in the unit (for availability and suggestions).
export async function candidateRooms(
  deps: SchedulingDeps,
  ctx: RequestContext,
  unit: UnitInfo,
  serviceId: string,
): Promise<{ id: string; name: string }[] | null> {
  const allowed = await deps.directory.allowedRooms(ctx, serviceId, unit.id);
  if (!allowed?.requiresRoom) return null;
  const unitRooms = unit.rooms.filter((room) => room.active).map(({ id, name }) => ({ id, name }));
  return allowed.rooms === "any" ? unitRooms : allowed.rooms;
}

// The start instant of a local date and time in the unit, aligned to the organization's slots.
export function startInstant(
  refs: BookingRefs,
  date: string,
  startTime: string,
): Result<{ startsAt: Date; minute: number }> {
  const minute = parseTime(startTime);
  if (minute === null)
    return fail(SchedulingErrors.validation({ startTime: "scheduling.validation.timeInvalid" }));
  if (!isAlignedStart(minute, refs.organization.granularity)) {
    return fail(SchedulingErrors.invalidStart(refs.organization.granularity));
  }
  return ok({ startsAt: rangeAt(date, minute, 5, refs.unit.timeZone).start, minute });
}

export type FindingDto = {
  code: string;
  severity: Finding["severity"];
  message: string;
  range?: { startsAt: string; endsAt: string };
  appointmentId?: string;
};

export function findingDtos(findings: Finding[]): FindingDto[] {
  return findings.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    message: interpolate(findingMessages[finding.code] ?? finding.code, finding.params),
    ...(finding.range ? { range: finding.range } : {}),
    ...(finding.appointmentId ? { appointmentId: finding.appointmentId } : {}),
  }));
}

export function unresolvedError(resolution: Extract<Resolution, { ok: false }>): DomainError {
  const details = { findings: findingDtos(resolution.findings) };
  return resolution.reason === "CONFLICTS"
    ? SchedulingErrors.conflicts(details)
    : SchedulingErrors.justificationRequired(details);
}

export function decisionOf(
  resolution: Extract<Resolution, { ok: true }>,
  justification: string | null,
): AvailabilityDecision {
  return {
    isOverbooking: resolution.isOverbooking,
    exceptionJustification: resolution.exceptionCodes.length > 0 ? justification : null,
    exceptionCodes: resolution.exceptionCodes,
  };
}

// PRD F05-style concurrent-edit message: who changed the appointment and when (unit zone).
export async function staleVersionError(
  deps: SchedulingDeps,
  ctx: RequestContext,
  appointmentId: string,
  timeZone: string,
): Promise<DomainError> {
  const record = await withTransaction(ctx, async (uow) =>
    ok(await deps.appointments.findRecord(uow, appointmentId)),
  );
  const current = record.ok ? record.value : null;
  if (!current) return SchedulingErrors.notFound();
  const names = current.updatedById ? await deps.directory.userNames(ctx, [current.updatedById]) : new Map();
  return SchedulingErrors.staleVersion(
    (current.updatedById ? names.get(current.updatedById) : undefined) ?? "outra pessoa",
    localTime(current.updatedAt, timeZone),
  );
}

// The price of a currency among the prices of a service, or null when it has none.
export function priceIn(
  prices: { currency: string; amountMinor: number }[],
  currency: string,
): number | null {
  return prices.find((price) => price.currency === currency)?.amountMinor ?? null;
}
