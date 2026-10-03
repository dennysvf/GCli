import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import type { PaletteColor } from "@/shared/kernel/palette";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { CountryCode } from "@/shared/kernel/countries/codes";
import { toRegistrations, type RegistrationItem } from "./registrations";
import { addDays, daysBetween, isoWeekday, isValidDate } from "../domain/dates";
import { WORKING_CALENDAR_MAX_DAYS } from "../domain/limits";
import { zonedTimeToUtc } from "../domain/time-zone-offsets";
import { scheduleOn } from "../domain/validity";
import type { TimeOffType } from "../domain/time-offs";
import { fromDbDate, toDbDate } from "./db-values";
import { ProfessionalsErrors } from "./errors";
import type { ProfessionalsDeps } from "./ports";
import { today } from "./professionals";

// Read API provided to scheduling (F06) and documents (F08) (PRD F04 Provides). Every function
// authorizes with professional:read; the consuming features apply their own rules on top.

export type BookableProfessional = {
  id: string;
  displayName: string;
  color: PaletteColor;
  specialty: string | null;
};

// PRD F04: a professional can only be booked for enabled services. With unitId, only professionals
// with working hours in that unit in the current or a future schedule are returned.
export async function listBookableProfessionals(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  options: { serviceId?: string; unitId?: string } = {},
): Promise<Result<BookableProfessional[]>> {
  const allowed = await authorize(ctx, "professional:read");
  if (!allowed.ok) return allowed;
  const day = toDbDate(await today(deps, ctx));
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.professional.findMany({
      where: {
        active: true,
        ...(options.serviceId ? { services: { some: { serviceId: options.serviceId } } } : {}),
        ...(options.unitId
          ? {
              schedules: {
                some: {
                  OR: [{ validUntil: null }, { validUntil: { gte: day } }],
                  intervals: { some: { unitId: options.unitId } },
                },
              },
            }
          : {}),
      },
      select: { id: true, fullName: true, displayName: true, color: true, specialty: true },
    });
    return ok(
      rows
        .map((row) => ({
          id: row.id,
          displayName: row.displayName ?? row.fullName,
          color: row.color as PaletteColor,
          specialty: row.specialty,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR")),
    );
  });
}

export async function isServiceEnabled(
  ctx: RequestContext,
  professionalId: string,
  serviceId: string,
): Promise<Result<boolean>> {
  const allowed = await authorize(ctx, "professional:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.professionalService.findFirst({
      where: { professionalId, serviceId, professional: { active: true } },
      select: { serviceId: true },
    });
    return ok(row !== null);
  });
}

export type WorkingCalendar = {
  professionalId: string;
  active: boolean;
  days: {
    date: string;
    weekday: number;
    units: { unitId: string; timeZone: string; intervals: { start: number; end: number }[] }[];
  }[];
  timeOffs: { startsAt: string; endsAt: string; type: TimeOffType }[];
};

// PRD F04 → F06: working hours (validity applied per date) and time-offs define bookable slots.
export async function getWorkingCalendar(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  professionalId: string,
  range: { from: string; to: string },
): Promise<Result<WorkingCalendar>> {
  const allowed = await authorize(ctx, "professional:read");
  if (!allowed.ok) return allowed;
  const { from, to } = range;
  if (
    !isValidDate(from) ||
    !isValidDate(to) ||
    to < from ||
    daysBetween(from, to) >= WORKING_CALENDAR_MAX_DAYS
  ) {
    return fail(ProfessionalsErrors.validation({ to: "Informe um período de até 62 dias." }));
  }
  const [units, timeZone] = await Promise.all([
    deps.units.listUnits(ctx, { activeOnly: false }),
    deps.organizationTimeZone(ctx),
  ]);
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  // One extra day on each side covers units whose time zone differs from the organization's.
  const rangeStart = zonedTimeToUtc(`${addDays(from, -1)}T00:00`, timeZone);
  const rangeEnd = zonedTimeToUtc(`${addDays(to, 2)}T00:00`, timeZone);

  return withTransaction(ctx, async (uow) => {
    const professional = await uow.tx.professional.findFirst({
      where: { id: professionalId },
      select: { id: true, active: true },
    });
    if (!professional) return fail(ProfessionalsErrors.notFound());
    const [schedules, timeOffs] = await Promise.all([
      uow.tx.professionalSchedule.findMany({
        where: {
          professionalId,
          validFrom: { lte: toDbDate(to) },
          OR: [{ validUntil: null }, { validUntil: { gte: toDbDate(from) } }],
        },
        include: { intervals: { orderBy: { startMinute: "asc" } } },
      }),
      uow.tx.professionalTimeOff.findMany({
        where: { professionalId, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
        orderBy: { startsAt: "asc" },
      }),
    ]);
    const periods = schedules.map((row) => ({
      id: row.id,
      validFrom: fromDbDate(row.validFrom),
      validUntil: row.validUntil ? fromDbDate(row.validUntil) : null,
      intervals: row.intervals,
    }));

    const days: WorkingCalendar["days"] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const weekday = isoWeekday(date);
      const schedule = scheduleOn(periods, date);
      const byUnit = new Map<string, { start: number; end: number }[]>();
      for (const interval of schedule?.intervals ?? []) {
        // Intervals of deactivated units are kept but ignored (spec F04 assumptions).
        if (interval.weekday !== weekday || !unitsById.get(interval.unitId)?.active) continue;
        byUnit.set(interval.unitId, [
          ...(byUnit.get(interval.unitId) ?? []),
          { start: interval.startMinute, end: interval.endMinute },
        ]);
      }
      days.push({
        date,
        weekday,
        units: [...byUnit].map(([unitId, intervals]) => ({
          unitId,
          timeZone: unitsById.get(unitId)?.timeZone ?? timeZone,
          intervals,
        })),
      });
    }
    return ok({
      professionalId,
      active: professional.active,
      days,
      timeOffs: timeOffs.map((row) => ({
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        type: row.type as TimeOffType,
      })),
    });
  });
}

export type ProfessionalSummary = {
  id: string;
  displayName: string;
  fullName: string;
  color: PaletteColor;
  active: boolean;
};

export async function getProfessionals(
  ctx: RequestContext,
  options: { ids?: string[]; activeOnly?: boolean } = {},
): Promise<Result<ProfessionalSummary[]>> {
  const allowed = await authorize(ctx, "professional:read");
  if (!allowed.ok) return allowed;
  if (options.ids && options.ids.length === 0) return ok([]);
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.professional.findMany({
      where: {
        ...(options.ids ? { id: { in: options.ids } } : {}),
        ...(options.activeOnly ? { active: true } : {}),
      },
      select: { id: true, fullName: true, displayName: true, color: true, active: true },
    });
    return ok(
      rows
        .map((row) => ({
          id: row.id,
          fullName: row.fullName,
          displayName: row.displayName ?? row.fullName,
          color: row.color as PaletteColor,
          active: row.active,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR")),
    );
  });
}

export type ProfessionalCredentials = {
  fullName: string;
  displayName: string;
  specialty: string | null;
  registrations: RegistrationItem[];
  // The registration of the requested country (the encounter's), else the first one (PRD F16).
  registration: RegistrationItem | null;
};

// PRD F04 → F08: name and council registration for generated documents, also for inactive
// professionals (documents about past care). A document written in a country uses the
// registration of that country.
export async function getProfessionalCredentials(
  ctx: RequestContext,
  professionalId: string,
  country?: CountryCode,
): Promise<Result<ProfessionalCredentials>> {
  const allowed = await authorize(ctx, "professional:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.professional.findFirst({
      where: { id: professionalId },
      include: { registrations: true },
    });
    if (!row) return fail(ProfessionalsErrors.notFound());
    const registrations = toRegistrations(row.registrations, ctx.locale).sort((a, b) =>
      a.country.localeCompare(b.country),
    );
    return ok({
      fullName: row.fullName,
      displayName: row.displayName ?? row.fullName,
      specialty: row.specialty,
      registrations,
      registration: registrations.find((item) => item.country === country) ?? registrations[0] ?? null,
    });
  });
}
