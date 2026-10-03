import { formatDateBR, formatMinute } from "@/shared/kernel/calendar-date";
import type { DateTimeRange } from "@/shared/kernel/date-time-range";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { localSpan, localTime } from "../agenda-time";
import { occupiesSlot } from "../status";
import type { CheckOptions, ConflictContext, Draft, Finding, LocalInterval } from "./types";

// One strategy per conflict rule of PRD F06 Capabilities. Each returns its findings; severities
// follow the PRD: professional → Encaixe, room → always blocked, availability → exception for
// Manager/Administrator, patient → warning only.

export type ConflictRule = (draft: Draft, context: ConflictContext, options: CheckOptions) => Finding[];

const TIME_OFF_LABELS: Record<string, string> = {
  VACATION: "férias",
  CONFERENCE: "congresso",
  PERSONAL: "ausência pessoal",
  OTHER: "ausência",
};

function isoRange(range: DateTimeRange) {
  return { startsAt: range.start.toISOString(), endsAt: range.end.toISOString() };
}

// Times of another range as written in a message: "14:00", or "05/10 14:00" on another day.
function timesOf(range: DateTimeRange, draft: Draft, timeZone: string) {
  const draftDate = utcToZonedParts(draft.range.start, timeZone).date;
  const label = (instant: Date) => {
    const date = utcToZonedParts(instant, timeZone).date;
    const time = localTime(instant, timeZone);
    return date === draftDate ? time : `${formatDateBR(date).slice(0, 5)} ${time}`;
  };
  return { start: label(range.start), end: label(range.end) };
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
          params: { room: context.roomName ?? "sala", ...timesOf(item.range, draft, context.timeZone) },
          range: isoRange(item.range),
          appointmentId: item.id,
        }));

function inside(span: { start: number; end: number }, intervals: LocalInterval[]): boolean {
  return intervals.some((interval) => interval.start <= span.start && span.end <= interval.end);
}

function describeIntervals(intervals: LocalInterval[], none: string): string {
  if (intervals.length === 0) return none;
  return intervals
    .map((interval) => `${formatMinute(interval.start)}–${formatMinute(interval.end)}`)
    .join(", ");
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
        hours: describeIntervals(intervals, "sem atendimento nesta unidade"),
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
        type: TIME_OFF_LABELS[item.type] ?? "ausência",
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
      params: { hours: describeIntervals(intervals, "unidade fechada neste dia") },
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
