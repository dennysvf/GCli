import type { DateTimeRange } from "@/shared/kernel/date-time-range";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { localSpan } from "../agenda-time";
import { occupiesSlot } from "../status";
import type { CheckOptions, ConflictContext, Draft, Finding, LocalInterval } from "./types";

// One strategy per conflict rule of PRD F06 Capabilities. Each returns its findings; severities
// follow the PRD: professional → Encaixe, room → always blocked, availability → exception for
// Manager/Administrator, patient → warning only.

export type ConflictRule = (draft: Draft, context: ConflictContext, options: CheckOptions) => Finding[];

function isoRange(range: DateTimeRange) {
  return { startsAt: range.start.toISOString(), endsAt: range.end.toISOString() };
}

// Another range as message values: the instants, the unit zone and the date of the draft, so the
// browser writes "14:00", or "05/10 14:00" on another day, in the language of the user.
function timesOf(range: DateTimeRange, draft: Draft, timeZone: string) {
  return {
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    timeZone,
    onDate: utcToZonedParts(draft.range.start, timeZone).date,
  };
}

function others(draft: Draft, context: ConflictContext) {
  return context.appointments.filter(
    (item) =>
      item.id !== draft.appointmentId && occupiesSlot(item.status) && item.range.overlaps(draft.range),
  );
}

function availability(options: CheckOptions) {
  return options.canOverrideAvailability ? ("EXCEPTION" as const) : ("BLOCKING" as const);
}

export const professionalOverlap: ConflictRule = (draft, context) =>
  others(draft, context)
    .filter((item) => item.professionalId === draft.professionalId)
    .map((item) => ({
      code: "SCHEDULING_PROFESSIONAL_CONFLICT",
      severity: "OVERBOOKABLE",
      params: { professional: context.professionalName, ...timesOf(item.range, draft, context.timeZone) },
      range: isoRange(item.range),
      appointmentId: item.id,
    }));

export const roomOverlap: ConflictRule = (draft, context) =>
  draft.roomId === null
    ? []
    : others(draft, context)
        .filter((item) => item.roomId === draft.roomId)
        .map((item) => ({
          code: "SCHEDULING_ROOM_CONFLICT",
          severity: "BLOCKING",
          params: { room: context.roomName, ...timesOf(item.range, draft, context.timeZone) },
          range: isoRange(item.range),
          appointmentId: item.id,
        }));

function inside(span: { start: number; end: number }, intervals: LocalInterval[]): boolean {
  return intervals.some((interval) => interval.start <= span.start && span.end <= interval.end);
}

// "480-720,780-1080" (minutes from midnight); empty when the day has no intervals.
function encodeIntervals(intervals: LocalInterval[]): string {
  return intervals.map((interval) => `${interval.start}-${interval.end}`).join(",");
}

export const workingHours: ConflictRule = (draft, context, options) => {
  const span = localSpan(draft.range, context.timeZone);
  const intervals = context.workingIntervals.get(span.date) ?? [];
  if (inside(span, intervals)) return [];
  return [
    {
      code: "SCHEDULING_OUTSIDE_WORKING_HOURS",
      severity: availability(options),
      params: {
        professional: context.professionalName,
        hours: encodeIntervals(intervals),
      },
    },
  ];
};

export const timeOff: ConflictRule = (draft, context, options) =>
  context.timeOffs
    .filter((item) => item.range.overlaps(draft.range))
    .map((item) => ({
      code: "SCHEDULING_TIME_OFF",
      severity: availability(options),
      params: {
        professional: context.professionalName,
        type: item.type,
        ...timesOf(item.range, draft, context.timeZone),
      },
      range: isoRange(item.range),
    }));

export const unitHours: ConflictRule = (draft, context, options) => {
  const span = localSpan(draft.range, context.timeZone);
  const intervals = context.businessHours.get(span.weekday) ?? [];
  if (inside(span, intervals)) return [];
  return [
    {
      code: "SCHEDULING_OUTSIDE_UNIT_HOURS",
      severity: availability(options),
      params: { hours: encodeIntervals(intervals) },
    },
  ];
};

export const unitClosure: ConflictRule = (draft, context, options) => {
  const { date } = localSpan(draft.range, context.timeZone);
  return context.closures
    .filter((closure) => closure.startsOn <= date && date <= closure.endsOn)
    .map((closure) => ({
      code: "SCHEDULING_UNIT_CLOSED",
      severity: availability(options),
      params: { reason: closure.reason },
    }));
};

export const pastStart: ConflictRule = (draft, context, options) =>
  options.checkPastStart && draft.range.start < context.now
    ? [{ code: "SCHEDULING_PAST_START", severity: availability(options), params: {} }]
    : [];

export const patientOverlap: ConflictRule = (draft, context) =>
  others(draft, context)
    .filter((item) => item.patientId === draft.patientId && item.professionalId !== draft.professionalId)
    .map((item) => ({
      code: "SCHEDULING_PATIENT_OVERLAP",
      severity: "WARNING",
      params: { professional: item.professionalName, ...timesOf(item.range, draft, context.timeZone) },
      range: isoRange(item.range),
      appointmentId: item.id,
    }));
