import { diffChanges } from "@/shared/audit/diff";
import { authorize, recordDenial } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { formatDate, formatLocale } from "@/shared/i18n/format";
import { messageKey } from "@/shared/i18n/message-key";
import { createTranslator, type Translator } from "@/shared/i18n/translator";
import type { Locale } from "@/shared/i18n/locales";
import { addDays } from "../domain/dates";
import {
  isScheduleDeletable,
  planSchedule,
  scheduleState,
  validateValidity,
  type SchedulePeriod,
  type ScheduleState,
} from "../domain/validity";
import {
  findCrossUnitConflict,
  findOutsideBusinessHours,
  formatInterval,
  validateIntervals,
  type WorkingInterval,
} from "../domain/working-hours";
import { businessDayHours, crossUnitConflictParams } from "../domain/working-hours-text";
import { fromDbDate, toDbDate, violatedConstraint } from "./db-values";
import { ProfessionalsErrors } from "./errors";
import { canViewProfessional } from "./policies";
import type { ProfessionalsDeps, UnitInfo } from "./ports";
import { today } from "./professionals";
import { deleteScheduleSchema, saveScheduleSchema } from "./schemas";

export type ScheduleItem = {
  id: string;
  version: number;
  validFrom: string;
  validUntil: string | null;
  state: ScheduleState;
  deletable: boolean;
  intervals: WorkingInterval[];
};

export type ScheduleList = { today: string; schedules: ScheduleItem[]; units: UnitInfo[] };

export type DeleteScheduleResult = {
  restoredPrevious: { scheduleId: string; validUntil: string | null } | null;
};

export type SaveScheduleResult = {
  scheduleId: string;
  version: number;
  closedPrevious: { scheduleId: string; validUntil: string } | null;
};

const SHORT_WEEKDAYS: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
  7: "Dom",
};

// Readable interval list for the audit log: "Unidade Centro Ter 08:00–12:00".
function summarize(intervals: WorkingInterval[], units: Map<string, UnitInfo>): string[] {
  return [...intervals]
    .sort((a, b) => a.unitId.localeCompare(b.unitId) || a.weekday - b.weekday || a.start - b.start)
    .map(
      (i) =>
        `${units.get(i.unitId)?.name ?? i.unitId} ${SHORT_WEEKDAYS[i.weekday] ?? ""} ${formatInterval(i)}`,
    );
}

function toInterval(row: { unitId: string; weekday: number; startMinute: number; endMinute: number }) {
  return { unitId: row.unitId, weekday: row.weekday, start: row.startMinute, end: row.endMinute };
}

function toPeriod(row: { id: string; validFrom: Date; validUntil: Date | null }): SchedulePeriod {
  return {
    id: row.id,
    validFrom: fromDbDate(row.validFrom),
    validUntil: row.validUntil ? fromDbDate(row.validUntil) : null,
  };
}

export async function listSchedules(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  professionalId: string,
): Promise<Result<ScheduleList>> {
  if (!canViewProfessional(ctx, professionalId)) {
    await recordDenial(ctx, "professional:read-all", professionalId);
    return fail(CommonErrors.forbidden());
  }
  const [date, units] = await Promise.all([
    today(deps, ctx),
    deps.units.listUnits(ctx, { activeOnly: false }),
  ]);
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.professionalSchedule.findMany({
      where: { professionalId },
      orderBy: { validFrom: "desc" },
      include: { intervals: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } },
    });
    return ok({
      today: date,
      units,
      schedules: rows.map((row) => {
        const period = toPeriod(row);
        return {
          ...period,
          version: row.version,
          state: scheduleState(period, date),
          deletable: isScheduleDeletable(period, date),
          intervals: row.intervals.map(toInterval),
        };
      }),
    });
  });
}

// Rules that need the units' data: active units, business hours (PRD F04: rejected with the
// unit's hours in the message) and no overlap across units in real time (ADR-021).
function checkIntervals(
  intervals: WorkingInterval[],
  units: Map<string, UnitInfo>,
  validFrom: string,
  locale: Locale,
  t: Translator,
) {
  const shape = validateIntervals(intervals);
  if (shape) return ProfessionalsErrors.invalidIntervals(shape);

  const inactive: Record<string, string> = {};
  intervals.forEach((interval, index) => {
    if (!units.get(interval.unitId)?.active)
      inactive[`intervals.${index}`] = "professionals.errors.PROFESSIONALS_INVALID_UNITS";
  });
  if (Object.keys(inactive).length > 0) return ProfessionalsErrors.invalidUnits(inactive);

  const weeks = new Map([...units.values()].map((unit) => [unit.id, unit.businessHours]));
  const outside = findOutsideBusinessHours(intervals, weeks);
  const first = outside[0];
  // "08:00–12:00" or, on a closed day, "closed on Mondays" in the requester's language.
  const hoursText = (day: Parameters<typeof businessDayHours>[0], weekday: number) =>
    businessDayHours(day) ?? t("professionals.hours.closedOn", { weekday: String(weekday) });
  if (first) {
    const fields = Object.fromEntries(
      outside.map((item) => [
        `intervals.${item.index}`,
        messageKey("professionals.errors.PROFESSIONALS_OUTSIDE_BUSINESS_HOURS", {
          hours: hoursText(item.day, item.weekday),
        }),
      ]),
    );
    return ProfessionalsErrors.outsideBusinessHours(fields, { hours: hoursText(first.day, first.weekday) });
  }

  // Compared as real instants on each date of the first 53 weeks (ADR-030).
  const zones = new Map([...units.values()].map((unit) => [unit.id, unit.timeZone]));
  const conflict = findCrossUnitConflict(intervals, zones, validFrom);
  const other = conflict ? intervals[conflict.conflictWith] : undefined;
  if (conflict && other) {
    const unitName = units.get(other.unitId)?.name ?? "";
    return ProfessionalsErrors.crossUnitConflict(
      { [`intervals.${conflict.index}`]: "professionals.errors.PROFESSIONALS_CROSS_UNIT_CONFLICT" },
      crossUnitConflictParams(unitName, other, formatDate(conflict.date, formatLocale(locale))),
    );
  }
  return null;
}

export async function saveSchedule(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaveScheduleResult>> {
  const allowed = await authorize(ctx, "professional:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(saveScheduleSchema, input);
  if (!parsed.ok) return parsed;
  const { professionalId, scheduleId, version, validFrom, validUntil, intervals } = parsed.value;

  const [date, unitList] = await Promise.all([
    today(deps, ctx),
    deps.units.listUnits(ctx, { activeOnly: false }),
  ]);
  const units = new Map(unitList.map((unit) => [unit.id, unit]));
  const t = createTranslator(ctx.locale);
  const invalid = checkIntervals(intervals, units, validFrom, ctx.locale, t);
  if (invalid) return fail(invalid);

  try {
    return await withTransaction(ctx, async (uow) => {
      const professional = await uow.tx.professional.findFirst({ where: { id: professionalId } });
      if (!professional) return fail(ProfessionalsErrors.notFound());
      if (!professional.active) return fail(ProfessionalsErrors.inactive());

      // PRD F16: working in a unit needs a registration in the unit's country, unless the
      // professional has no council.
      if (!professional.hasNoCouncil) {
        const registered = new Set(
          (
            await uow.tx.professionalRegistration.findMany({
              where: { professionalId },
              select: { country: true },
            })
          ).map((registration) => registration.country),
        );
        const missing: Record<string, string> = {};
        let firstMissing: UnitInfo | undefined;
        intervals.forEach((interval, index) => {
          const unit = units.get(interval.unitId);
          if (unit && !registered.has(unit.country)) {
            missing[`intervals.${index}`] = "professionals.errors.PROFESSIONALS_REGISTRATION_REQUIRED";
            firstMissing ??= unit;
          }
        });
        if (firstMissing) {
          return fail(
            ProfessionalsErrors.registrationRequired(
              missing,
              t(`countries.names.${firstMissing.country}`),
              firstMissing.name,
            ),
          );
        }
      }

      const rows = await uow.tx.professionalSchedule.findMany({
        where: { professionalId },
        include: { intervals: true },
      });
      const currentRow = scheduleId ? rows.find((row) => row.id === scheduleId) : undefined;
      if (scheduleId && !currentRow) return fail(ProfessionalsErrors.notFound());
      const current = currentRow ? toPeriod(currentRow) : null;
      if (current && scheduleState(current, date) === "ended")
        return fail(ProfessionalsErrors.scheduleEnded());

      const period = { validFrom, validUntil };
      const dateErrors = validateValidity(period, current, date);
      if (dateErrors) return fail(ProfessionalsErrors.validation(dateErrors));
      const plan = planSchedule(rows.filter((row) => row.id !== scheduleId).map(toPeriod), period);
      if (!plan.ok) {
        return fail(
          ProfessionalsErrors.scheduleOverlap(formatDate(plan.conflictFrom, formatLocale(ctx.locale))),
        );
      }

      // The earlier schedule is closed first: the exclusion constraint is checked per statement.
      if (plan.close) {
        await uow.tx.professionalSchedule.update({
          where: { id: plan.close.id },
          data: {
            validUntil: toDbDate(plan.close.validUntil),
            version: { increment: 1 },
            updatedById: ctx.user.id,
          },
        });
        const closed = rows.find((row) => row.id === plan.close?.id);
        await uow.audit.record({
          action: "UPDATE",
          entityType: "professional_schedule",
          entityId: plan.close.id,
          summary: "Horário anterior encerrado por nova vigência",
          changes: {
            validUntil: {
              before: closed?.validUntil ? fromDbDate(closed.validUntil) : null,
              after: plan.close.validUntil,
            },
          },
        });
      }

      const data = intervals.map((interval) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        unitId: interval.unitId,
        weekday: interval.weekday,
        startMinute: interval.start,
        endMinute: interval.end,
      }));
      let id: string;
      let nextVersion: number;
      if (currentRow) {
        const updated = await uow.tx.professionalSchedule.updateMany({
          where: { id: currentRow.id, version: version ?? -1 },
          data: {
            validFrom: toDbDate(validFrom),
            validUntil: validUntil ? toDbDate(validUntil) : null,
            version: { increment: 1 },
            updatedById: ctx.user.id,
          },
        });
        if (updated.count !== 1) return fail(CommonErrors.staleVersion());
        // Intervals of units deactivated later are kept untouched (spec F04 assumptions).
        const activeUnitIds = unitList.filter((unit) => unit.active).map((unit) => unit.id);
        await uow.tx.professionalWorkingInterval.deleteMany({
          where: { scheduleId: currentRow.id, unitId: { in: activeUnitIds } },
        });
        id = currentRow.id;
        nextVersion = currentRow.version + 1;
      } else {
        id = newId();
        nextVersion = 1;
        await uow.tx.professionalSchedule.create({
          data: {
            id,
            organizationId: ctx.organizationId,
            professionalId,
            validFrom: toDbDate(validFrom),
            validUntil: validUntil ? toDbDate(validUntil) : null,
            createdById: ctx.user.id,
          },
        });
      }
      if (data.length > 0) {
        await uow.tx.professionalWorkingInterval.createMany({
          data: data.map((row) => ({ ...row, scheduleId: id })),
        });
      }
      await uow.audit.record({
        action: currentRow ? "UPDATE" : "CREATE",
        entityType: "professional_schedule",
        entityId: id,
        summary: currentRow ? "Horário de atendimento alterado" : "Horário de atendimento criado",
        metadata: { professionalId },
        changes: diffChanges(
          current
            ? {
                validFrom: current.validFrom,
                validUntil: current.validUntil,
                intervals: summarize(currentRow?.intervals.map(toInterval) ?? [], units),
              }
            : null,
          { validFrom, validUntil, intervals: summarize(intervals, units) },
        ),
      });
      return ok({
        scheduleId: id,
        version: nextVersion,
        closedPrevious: plan.close ? { scheduleId: plan.close.id, validUntil: plan.close.validUntil } : null,
      });
    });
  } catch (error) {
    // A concurrent save of an overlapping period (exclusion constraint ex_schedule_no_overlap).
    if (violatedConstraint(error).includes("ex_schedule_no_overlap")) {
      return fail(ProfessionalsErrors.scheduleOverlap(formatDate(validFrom, formatLocale(ctx.locale))));
    }
    throw error;
  }
}

export async function deleteSchedule(
  deps: ProfessionalsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<DeleteScheduleResult>> {
  const allowed = await authorize(ctx, "professional:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(deleteScheduleSchema, input);
  if (!parsed.ok) return parsed;
  const date = await today(deps, ctx);

  return withTransaction<DeleteScheduleResult>(ctx, async (uow) => {
    const row = await uow.tx.professionalSchedule.findFirst({
      where: { id: parsed.value.scheduleId },
      include: { intervals: true },
    });
    if (!row) return fail(ProfessionalsErrors.notFound());
    const period = toPeriod(row);
    if (!isScheduleDeletable(period, date)) return fail(ProfessionalsErrors.scheduleStarted());

    await uow.tx.professionalSchedule.delete({ where: { id: row.id } });
    await uow.audit.record({
      action: "DELETE",
      entityType: "professional_schedule",
      entityId: row.id,
      summary: "Horário de atendimento excluído",
      metadata: { professionalId: row.professionalId },
      changes: diffChanges<Record<string, unknown>>(
        { validFrom: period.validFrom, validUntil: period.validUntil, intervals: row.intervals.length },
        { validFrom: null, validUntil: null, intervals: 0 },
      ),
    });

    // The schedule this one had closed gets its previous end date back.
    const previous = await uow.tx.professionalSchedule.findFirst({
      where: { professionalId: row.professionalId, validUntil: toDbDate(addDays(period.validFrom, -1)) },
    });
    if (!previous) return ok({ restoredPrevious: null });
    await uow.tx.professionalSchedule.update({
      where: { id: previous.id },
      data: { validUntil: row.validUntil, version: { increment: 1 }, updatedById: ctx.user.id },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "professional_schedule",
      entityId: previous.id,
      summary: "Vigência do horário anterior restaurada",
      changes: { validUntil: { before: addDays(period.validFrom, -1), after: period.validUntil } },
    });
    return ok({ restoredPrevious: { scheduleId: previous.id, validUntil: period.validUntil } });
  });
}
