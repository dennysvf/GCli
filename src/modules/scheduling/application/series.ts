import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { formatMinute, parseTime } from "@/shared/kernel/calendar-date";
import type { DateTimeRange } from "@/shared/kernel/date-time-range";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { isAlignedStart, rangeAt } from "../domain/agenda-time";
import { Appointment, type AvailabilityDecision } from "../domain/appointment";
import { freeStartsOnDate } from "../domain/availability";
import { checkConflicts, resolveFindings } from "../domain/conflicts/check";
import type { ConflictContext } from "../domain/conflicts/types";
import { SchedulingErrors } from "../domain/errors";
import { appointmentEvent, SCHEDULING_EVENTS } from "../domain/events";
import { expandSeries } from "../domain/recurrence";
import { insertAppointment } from "./book-appointment";
import { decisionOf, findingDtos, resolveRefs, type BookingRefs, type FindingDto } from "./booking";
import { scopeTargets } from "./cancel-appointment";
import { finishChange, loadAppointment, saveChange } from "./changes";
import { loadConflictContext } from "./conflict-context";
import type { SchedulingDeps, SeriesRecord } from "./ports";
import {
  seriesEditSchema,
  seriesSchema,
  type OccurrenceResolution,
  type SeriesEditInput,
  type SeriesInput,
} from "./schemas";

// Recurring series (PRD F06 Full Scope). Occurrences are materialized as appointments; every one
// is checked before saving, and nothing is saved until each conflict is skipped or re-timed.

export type OccurrencePreview = {
  index: number;
  date: string;
  startTime: string;
  startsAt: string;
  status: "OK" | "CONFLICT" | "SKIPPED";
  findings: FindingDto[];
  suggestions: string[];
};

export type SeriesPreview = { total: number; conflicts: number; occurrences: OccurrencePreview[] };

const SUGGESTIONS = 3;

type Evaluated = OccurrencePreview & { range: DateTimeRange | null; decision: AvailabilityDecision | null };

type Planned = { index: number; date: string; minute: number; appointmentId?: string };

function evaluate(
  planned: Planned[],
  refs: BookingRefs,
  context: ConflictContext,
  options: {
    patientId: string;
    durationMinutes: number;
    resolutions: OccurrenceResolution[];
    overrides: { confirmOverbooking: boolean; exceptionJustification: string | null };
    canOverrideAvailability: boolean;
    checkPastStart: boolean;
    now: Date;
  },
): Result<Evaluated[]> {
  const { unit, professional, room, organization } = refs;
  const byIndex = new Map(options.resolutions.map((item) => [item.index, item]));
  const evaluated: Evaluated[] = [];
  for (const item of planned) {
    const resolution = byIndex.get(item.index);
    let minute = item.minute;
    if (resolution?.action === "RETIME") {
      const retimed = parseTime(resolution.startTime);
      if (retimed === null || !isAlignedStart(retimed, organization.granularity)) {
        return fail(SchedulingErrors.invalidStart(organization.granularity));
      }
      minute = retimed;
    }
    const range = rangeAt(item.date, minute, options.durationMinutes, unit.timeZone);
    const base = {
      index: item.index,
      date: item.date,
      startTime: formatMinute(minute),
      startsAt: range.start.toISOString(),
    };
    if (resolution?.action === "SKIP") {
      evaluated.push({
        ...base,
        status: "SKIPPED",
        findings: [],
        suggestions: [],
        range: null,
        decision: null,
      });
      continue;
    }
    const findings = checkConflicts(
      {
        ...(item.appointmentId ? { appointmentId: item.appointmentId } : {}),
        unitId: unit.id,
        professionalId: professional.id,
        roomId: room?.id ?? null,
        patientId: options.patientId,
        range,
      },
      context,
      { canOverrideAvailability: options.canOverrideAvailability, checkPastStart: options.checkPastStart },
    );
    const resolved = resolveFindings(findings, options.overrides);
    if (resolved.ok) {
      evaluated.push({
        ...base,
        status: "OK",
        findings: findingDtos(findings),
        suggestions: [],
        range,
        decision: decisionOf(resolved, options.overrides.exceptionJustification),
      });
      continue;
    }
    const suggestions = freeStartsOnDate(
      item.date,
      {
        professionalId: professional.id,
        professionalName: professional.displayName,
        context,
        rooms: room ? [room] : null,
        ...(item.appointmentId ? { excludeAppointmentId: item.appointmentId } : {}),
      },
      {
        unitId: unit.id,
        durationMinutes: options.durationMinutes,
        granularity: organization.granularity,
        timeZone: unit.timeZone,
        now: options.now,
      },
      SUGGESTIONS,
    ).map((slot) => formatMinute(slot.startMinute));
    evaluated.push({
      ...base,
      status: "CONFLICT",
      findings: findingDtos(findings),
      suggestions,
      range,
      decision: null,
    });
  }
  return ok(evaluated);
}

function summary(evaluated: Evaluated[]): SeriesPreview {
  return {
    total: evaluated.length,
    conflicts: evaluated.filter((item) => item.status === "CONFLICT").length,
    occurrences: evaluated.map((item) => ({
      index: item.index,
      date: item.date,
      startTime: item.startTime,
      startsAt: item.startsAt,
      status: item.status,
      findings: item.findings,
      suggestions: item.suggestions,
    })),
  };
}

function windowOf(planned: Planned[], durationMinutes: number, timeZone: string) {
  const first = planned[0];
  const last = planned.at(-1);
  if (!first || !last) return null;
  return {
    from: rangeAt(first.date, 0, 5, timeZone).start,
    to: rangeAt(last.date, 1440, 5, timeZone).start,
    durationMinutes,
  };
}

type SeriesPlan = {
  data: SeriesInput;
  refs: BookingRefs;
  durationMinutes: number;
  startMinute: number;
  evaluated: Evaluated[];
};

async function planSeries(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SeriesPlan>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(seriesSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const refs = await resolveRefs(deps, ctx, data);
  if (!refs.ok) return refs;
  const startMinute = parseTime(data.startTime);
  if (startMinute === null || !isAlignedStart(startMinute, refs.value.organization.granularity)) {
    return fail(SchedulingErrors.invalidStart(refs.value.organization.granularity));
  }
  const expanded = expandSeries({ ...data.recurrence, firstDate: data.date });
  if (!expanded.ok) return fail(SchedulingErrors.seriesRuleInvalid(expanded.error));
  const durationMinutes = data.durationMinutes ?? refs.value.service.durationMinutes;
  const planned = expanded.value.map((item) => ({ ...item, minute: startMinute }));
  const window = windowOf(planned, durationMinutes, refs.value.unit.timeZone);
  if (!window)
    return fail(
      SchedulingErrors.seriesRuleInvalid({ "recurrence.weekdays": "scheduling.validation.seriesEmpty" }),
    );
  const { unit, professional, room } = refs.value;
  const context = await loadConflictContext(deps, ctx, {
    unit,
    professionalId: professional.id,
    professionalName: professional.displayName,
    roomIds: room ? [room.id] : [],
    roomName: room?.name ?? null,
    patientId: data.patientId,
    window,
  });
  const evaluated = evaluate(planned, refs.value, context, {
    patientId: data.patientId,
    durationMinutes,
    resolutions: data.resolutions,
    overrides: data,
    canOverrideAvailability: can(ctx, "schedule:override-availability"),
    checkPastStart: true,
    now: deps.clock(),
  });
  if (!evaluated.ok) return evaluated;
  return ok({ data, refs: refs.value, durationMinutes, startMinute, evaluated: evaluated.value });
}

export async function previewSeries(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SeriesPreview>> {
  const plan = await planSeries(deps, ctx, input);
  return plan.ok ? ok(summary(plan.value.evaluated)) : plan;
}

export type BookSeriesResult = { seriesId: string; appointmentIds: string[]; skipped: number };

// PRD F06: the whole series is saved in one action, or nothing when a conflict is unresolved.
export async function bookSeries(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<BookSeriesResult>> {
  const plan = await planSeries(deps, ctx, input);
  if (!plan.ok) return plan;
  const { data, refs, durationMinutes, startMinute, evaluated } = plan.value;
  const preview = summary(evaluated);
  if (preview.conflicts > 0) {
    return fail(SchedulingErrors.seriesConflicts(preview.conflicts, preview.total, { ...preview }));
  }
  const seriesId = newId();
  const now = deps.clock();
  const series: SeriesRecord = {
    id: seriesId,
    unitId: refs.unit.id,
    professionalId: refs.professional.id,
    serviceId: refs.service.id,
    patientId: data.patientId,
    roomId: refs.room?.id ?? null,
    frequency: data.recurrence.frequency,
    weekdays: [...data.recurrence.weekdays].sort(),
    startMinute,
    durationMinutes,
    firstDate: data.date,
    endsOn: data.recurrence.endsOn,
    occurrenceCount: data.recurrence.endsOn ? null : data.recurrence.endsAfter,
    endsAfterIndex: null,
    previousSeriesId: null,
    version: 1,
  };
  return withTransaction(ctx, async (uow) => {
    await deps.series.create(uow, series, { userId: ctx.user.id, organizationId: ctx.organizationId });
    await uow.audit.record({
      action: "CREATE",
      entityType: "appointment_series",
      entityId: seriesId,
      metadata: { occurrences: evaluated.length, frequency: series.frequency, weekdays: series.weekdays },
    });
    const appointmentIds: string[] = [];
    for (const item of evaluated) {
      if (item.status !== "OK" || !item.range || !item.decision) continue;
      const booked = Appointment.book({
        id: newId(),
        unitId: refs.unit.id,
        professionalId: refs.professional.id,
        serviceId: refs.service.id,
        patientId: data.patientId,
        roomId: refs.room?.id ?? null,
        startsAt: item.range.start,
        durationMinutes,
        priceMinor: refs.priceMinor,
        currency: refs.unit.currency,
        notes: data.notes,
        seriesId,
        seriesIndex: item.index,
        decision: item.decision,
        actorId: ctx.user.id,
        now,
      });
      if (!booked.ok) return booked;
      const saved = await insertAppointment(deps, ctx, uow, booked.value);
      if (!saved.ok) return saved;
      appointmentIds.push(booked.value.id);
    }
    return ok({ seriesId, appointmentIds, skipped: evaluated.length - appointmentIds.length });
  });
}

// --- Editing a series ---------------------------------------------------------------------------

type EditPlan = {
  data: SeriesEditInput;
  selected: Appointment;
  series: SeriesRecord;
  targets: Appointment[];
  skippedByStatus: number;
  refs: BookingRefs;
  durationMinutes: number;
  newStartMinute: number | null;
  evaluated: Evaluated[];
};

async function planSeriesEdit(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<EditPlan>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(seriesEditSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const loaded = await loadAppointment(deps, ctx, data.appointmentId);
  if (!loaded.ok) return loaded;
  const selected = loaded.value;
  const seriesId = selected.snapshot.seriesId;
  if (!seriesId) return fail(SchedulingErrors.notInSeries());
  const stored = await withTransaction(ctx, async (uow) =>
    ok({
      series: await deps.series.find(uow, seriesId),
      occurrences: await deps.appointments.seriesOccurrences(uow, seriesId),
    }),
  );
  if (!stored.ok || !stored.value.series) return fail(SchedulingErrors.notInSeries());
  const now = deps.clock();
  const { targets, skipped } = scopeTargets(selected, stored.value.occurrences, data.scope, now);
  if (targets.length === 0) return fail(SchedulingErrors.notEditable());
  const first = targets[0] as Appointment;

  const changes = data.changes;
  const refs = await resolveRefs(deps, ctx, {
    unitId: first.snapshot.unitId,
    serviceId: first.snapshot.serviceId,
    professionalId: changes.professionalId ?? first.snapshot.professionalId,
    roomId: changes.roomId === undefined ? first.snapshot.roomId : changes.roomId,
    patientId: null,
  });
  if (!refs.ok) return refs;
  const zone = refs.value.unit.timeZone;
  const newStartMinute = changes.startTime ? parseTime(changes.startTime) : null;
  if (newStartMinute !== null && !isAlignedStart(newStartMinute, refs.value.organization.granularity)) {
    return fail(SchedulingErrors.invalidStart(refs.value.organization.granularity));
  }
  const durationMinutes = changes.durationMinutes ?? first.snapshot.durationMinutes;
  const planned: Planned[] = targets.map((target) => {
    const local = utcToZonedParts(target.snapshot.startsAt, zone);
    return {
      index: target.snapshot.seriesIndex ?? 0,
      date: local.date,
      minute: newStartMinute ?? local.minute,
      appointmentId: target.id,
    };
  });
  const window = windowOf(planned, durationMinutes, zone);
  if (!window) return fail(SchedulingErrors.notEditable());
  const context = await loadConflictContext(deps, ctx, {
    unit: refs.value.unit,
    professionalId: refs.value.professional.id,
    professionalName: refs.value.professional.displayName,
    roomIds: refs.value.room ? [refs.value.room.id] : [],
    roomName: refs.value.room?.name ?? null,
    patientId: first.snapshot.patientId,
    window,
  });
  const evaluated = evaluate(planned, refs.value, context, {
    patientId: first.snapshot.patientId,
    durationMinutes,
    resolutions: data.resolutions,
    overrides: data,
    canOverrideAvailability: can(ctx, "schedule:override-availability"),
    checkPastStart: newStartMinute !== null,
    now,
  });
  if (!evaluated.ok) return evaluated;
  return ok({
    data,
    selected,
    series: stored.value.series,
    targets,
    skippedByStatus: skipped,
    refs: refs.value,
    durationMinutes,
    newStartMinute,
    evaluated: evaluated.value,
  });
}

export async function previewSeriesEdit(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SeriesPreview>> {
  const plan = await planSeriesEdit(deps, ctx, input);
  return plan.ok ? ok(summary(plan.value.evaluated)) : plan;
}

export type EditSeriesResult = { newSeriesId: string; updatedIds: string[]; skipped: number };

// Spec F06: "Este e os seguintes" and "Todos os futuros" split the series. The old series ends
// before the first changed occurrence; a new series takes the changed ones (skipped occurrences
// keep their values and move along, so the series stays contiguous).
export async function editSeries(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<EditSeriesResult>> {
  const plan = await planSeriesEdit(deps, ctx, input);
  if (!plan.ok) return plan;
  const { data, series, targets, refs, durationMinutes, newStartMinute, evaluated } = plan.value;
  const preview = summary(evaluated);
  if (preview.conflicts > 0) {
    return fail(SchedulingErrors.seriesConflicts(preview.conflicts, preview.total, { ...preview }));
  }
  const now = deps.clock();
  const newSeriesId = newId();
  const byIndex = new Map(evaluated.map((item) => [item.index, item]));
  const firstIndex = Math.min(...targets.map((target) => target.snapshot.seriesIndex ?? 0));
  const lastDate = evaluated.at(-1)?.date ?? series.firstDate;
  const changes = data.changes;

  return finishChange(deps, ctx, plan.value.selected.snapshot, async (uow) => {
    await deps.series.endAfter(uow, series.id, firstIndex - 1);
    await deps.series.create(
      uow,
      {
        ...series,
        id: newSeriesId,
        professionalId: refs.professional.id,
        roomId: refs.room?.id ?? null,
        startMinute: newStartMinute ?? series.startMinute,
        durationMinutes,
        firstDate: evaluated[0]?.date ?? series.firstDate,
        endsOn: lastDate,
        occurrenceCount: null,
        endsAfterIndex: null,
        previousSeriesId: series.id,
        version: 1,
      },
      { userId: ctx.user.id, organizationId: ctx.organizationId },
    );
    await uow.audit.record({
      action: "CREATE",
      entityType: "appointment_series",
      entityId: newSeriesId,
      metadata: { splitFrom: series.id, scope: data.scope, occurrences: targets.length },
    });
    const updatedIds: string[] = [];
    let position = 0;
    for (const target of targets) {
      position += 1;
      const before = { ...target.snapshot };
      const item = byIndex.get(before.seriesIndex ?? 0);
      target.moveToSeries(newSeriesId, position);
      if (item && item.status === "OK" && item.range && item.decision) {
        const moves =
          item.range.start.getTime() !== before.startsAt.getTime() ||
          refs.professional.id !== before.professionalId ||
          (refs.room?.id ?? null) !== before.roomId;
        if (moves) {
          const moved = target.reschedule({
            startsAt: item.range.start,
            professionalId: refs.professional.id,
            roomId: refs.room?.id ?? null,
            decision: item.decision,
            source: "SERIES",
            now,
            actorId: ctx.user.id,
          });
          if (!moved.ok) return moved;
        }
        const edited = target.edit({
          ...(changes.durationMinutes !== undefined ? { durationMinutes: changes.durationMinutes } : {}),
          ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
          decision: item.decision,
        });
        if (!edited.ok) return edited;
        updatedIds.push(target.id);
      }
      const saved = await saveChange(deps, ctx, uow, target, {
        expectedVersion: before.version,
        before,
        metadata: { seriesEdit: data.scope, newSeriesId },
        events: [
          appointmentEvent(SCHEDULING_EVENTS.updated, target.snapshot, {
            previousStatus: before.status,
            actorUserId: ctx.user.id,
            now,
          }),
        ],
      });
      if (!saved.ok) return saved;
    }
    return ok({
      newSeriesId,
      updatedIds,
      skipped: evaluated.length - updatedIds.length + plan.value.skippedByStatus,
    });
  });
}
