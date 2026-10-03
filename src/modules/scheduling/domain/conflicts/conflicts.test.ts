import { describe, expect, it } from "vitest";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { checkConflicts, isFree, resolveFindings } from "./check";
import type { ConflictContext, Draft, ExistingAppointment } from "./types";

const TZ = "America/Sao_Paulo";
const DATE = "2026-10-06"; // Tuesday
const at = (time: string, date = DATE) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return localMinuteToUtc(date, h * 60 + m, TZ);
};
const range = (start: string, end: string) => {
  const result = DateTimeRange.of(at(start), at(end));
  if (!result.ok) throw new Error("range");
  return result.value;
};

function context(overrides: Partial<ConflictContext> = {}): ConflictContext {
  return {
    timeZone: TZ,
    now: at("07:00"),
    professionalName: "Dra. Ana",
    roomName: "Sala 2",
    appointments: [],
    workingIntervals: new Map([[DATE, [{ start: 8 * 60, end: 18 * 60 }]]]),
    timeOffs: [],
    businessHours: new Map([[2, [{ start: 7 * 60, end: 20 * 60 }]]]),
    closures: [],
    ...overrides,
  };
}

const draft = (start: string, end: string, extra: Partial<Draft> = {}): Draft => ({
  unitId: "u1",
  professionalId: "p1",
  roomId: "r2",
  patientId: "pt1",
  range: range(start, end),
  ...extra,
});

const existing = (extra: Partial<ExistingAppointment>): ExistingAppointment => ({
  id: "x1",
  professionalId: "p9",
  professionalName: "Dr. Bruno",
  roomId: null,
  patientId: "pt9",
  range: range("14:00", "14:50"),
  status: "SCHEDULED",
  ...extra,
});

const manager = { canOverrideAvailability: true, checkPastStart: true };
const desk = { canOverrideAvailability: false, checkPastStart: true };

describe("conflict rules", () => {
  it("F06: a professional overlap is overbookable and a room overlap is blocking", () => {
    const findings = checkConflicts(
      draft("14:30", "15:20"),
      context({
        appointments: [
          existing({ id: "a", professionalId: "p1" }),
          existing({ id: "b", roomId: "r2", range: range("14:00", "15:00") }),
        ],
      }),
      desk,
    );
    expect(findings.map((f) => [f.code, f.severity])).toEqual([
      ["SCHEDULING_ROOM_CONFLICT", "BLOCKING"],
      ["SCHEDULING_PROFESSIONAL_CONFLICT", "OVERBOOKABLE"],
    ]);
    expect(findings[1]?.params).toEqual({ professional: "Dra. Ana", start: "14:00", end: "14:50" });
    expect(findings[0]?.params).toEqual({ room: "Sala 2", start: "14:00", end: "15:00" });
  });

  it("F06: touching appointments do not conflict", () => {
    const findings = checkConflicts(
      draft("14:50", "15:40"),
      context({ appointments: [existing({ professionalId: "p1", roomId: "r2" })] }),
      desk,
    );
    expect(findings).toEqual([]);
  });

  it("F06: outside working hours, time-off, unit hours and closures are exceptions only for managers", () => {
    const busy = context({
      timeOffs: [{ range: range("12:00", "13:00"), type: "PERSONAL" }],
      closures: [{ startsOn: DATE, endsOn: DATE, reason: "Dedetização" }],
      businessHours: new Map([[2, [{ start: 7 * 60, end: 12 * 60 + 30 }]]]),
      workingIntervals: new Map([[DATE, [{ start: 8 * 60, end: 12 * 60 }]]]),
    });
    const codes = (options: typeof desk) =>
      checkConflicts(draft("12:00", "12:50"), busy, options).map((f) => `${f.code}:${f.severity}`);
    expect(codes(manager)).toEqual([
      "SCHEDULING_UNIT_CLOSED:EXCEPTION",
      "SCHEDULING_OUTSIDE_UNIT_HOURS:EXCEPTION",
      "SCHEDULING_OUTSIDE_WORKING_HOURS:EXCEPTION",
      "SCHEDULING_TIME_OFF:EXCEPTION",
    ]);
    expect(codes(desk).every((code) => code.endsWith(":BLOCKING"))).toBe(true);
  });

  it("F06: a past start is checked only when the start changes", () => {
    const late = context({ now: at("15:00") });
    expect(checkConflicts(draft("14:00", "14:50"), late, desk).map((f) => f.code)).toEqual([
      "SCHEDULING_PAST_START",
    ]);
    expect(checkConflicts(draft("14:00", "14:50"), late, { ...desk, checkPastStart: false })).toEqual([]);
  });

  it("F06: a patient overlap is only a warning", () => {
    const findings = checkConflicts(
      draft("14:30", "15:20"),
      context({ appointments: [existing({ patientId: "pt1" })] }),
      desk,
    );
    expect(findings).toEqual([
      expect.objectContaining({
        code: "SCHEDULING_PATIENT_OVERLAP",
        severity: "WARNING",
        params: { professional: "Dr. Bruno", start: "14:00", end: "14:50" },
      }),
    ]);
    expect(isFree(findings)).toBe(true);
  });

  it("F06: cancelled and no-show appointments do not occupy the slot; the edited appointment is ignored", () => {
    const findings = checkConflicts(
      draft("14:00", "14:50", { appointmentId: "self" }),
      context({
        appointments: [
          existing({ id: "c", professionalId: "p1", status: "CANCELLED" }),
          existing({ id: "n", roomId: "r2", status: "NO_SHOW" }),
          existing({ id: "self", professionalId: "p1", roomId: "r2" }),
        ],
      }),
      desk,
    );
    expect(findings).toEqual([]);
  });
});

describe("resolveFindings", () => {
  const overbook = checkConflicts(
    draft("14:30", "15:20"),
    context({ appointments: [existing({ professionalId: "p1" })] }),
    manager,
  );
  const outside = checkConflicts(draft("19:00", "19:50"), context(), manager);

  it("F06: an encaixe needs confirmation", () => {
    expect(
      resolveFindings(overbook, { confirmOverbooking: false, exceptionJustification: null }),
    ).toMatchObject({
      ok: false,
      reason: "CONFLICTS",
    });
    expect(
      resolveFindings(overbook, { confirmOverbooking: true, exceptionJustification: null }),
    ).toMatchObject({
      ok: true,
      isOverbooking: true,
    });
  });

  it("F06: exceptions need a justification", () => {
    expect(
      resolveFindings(outside, { confirmOverbooking: false, exceptionJustification: null }),
    ).toMatchObject({
      ok: false,
      reason: "JUSTIFICATION_REQUIRED",
    });
    expect(
      resolveFindings(outside, { confirmOverbooking: false, exceptionJustification: "Paciente urgente." }),
    ).toMatchObject({ ok: true, isOverbooking: false, exceptionCodes: ["SCHEDULING_OUTSIDE_WORKING_HOURS"] });
  });

  it("F06: blocking findings cannot be overridden", () => {
    const room = checkConflicts(
      draft("14:30", "15:20"),
      context({ appointments: [existing({ roomId: "r2" })] }),
      manager,
    );
    expect(
      resolveFindings(room, { confirmOverbooking: true, exceptionJustification: "Urgente demais." }).ok,
    ).toBe(false);
  });
});
