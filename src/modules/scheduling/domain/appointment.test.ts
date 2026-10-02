import { describe, expect, it } from "vitest";
import { Appointment, type Actor } from "./appointment";

const START = new Date("2026-10-06T17:00:00.000Z");
const minutes = (n: number) => new Date(START.getTime() + n * 60_000);
const desk: Actor = { userId: "desk", isOwnProfessional: false, canRevertAnyTime: false };
const manager: Actor = { userId: "manager", isOwnProfessional: false, canRevertAnyTime: true };
const professional: Actor = { userId: "pro", isOwnProfessional: true, canRevertAnyTime: false };

function booked() {
  const result = Appointment.book({
    id: "a1",
    unitId: "u1",
    professionalId: "p1",
    serviceId: "s1",
    patientId: "pt1",
    roomId: "r1",
    startsAt: START,
    durationMinutes: 50,
    priceCents: 25_000,
    notes: null,
    seriesId: null,
    seriesIndex: null,
    decision: { isOverbooking: false, exceptionJustification: null, exceptionCodes: [] },
    actorId: "desk",
    now: minutes(-60 * 24),
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function moveTo(appointment: Appointment, path: Parameters<Appointment["transition"]>[0][], at: Date) {
  for (const to of path) {
    const result = appointment.transition(to, { now: at, actor: desk, justification: null });
    if (!result.ok) throw new Error(`${to}: ${result.error.code}`);
  }
}

describe("Appointment", () => {
  it("F06: booking records the first status change and validates duration", () => {
    const appointment = booked();
    expect(appointment.status).toBe("SCHEDULED");
    expect(appointment.endsAt).toEqual(minutes(50));
    expect(appointment.pendingStatusChanges).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: "SCHEDULED", changedById: "desk" }),
    ]);
    const invalid = Appointment.book({
      ...booked().snapshot,
      durationMinutes: 52,
      decision: { isOverbooking: false, exceptionJustification: null, exceptionCodes: [] },
      actorId: "desk",
      now: START,
    });
    expect(invalid.ok).toBe(false);
  });

  it("F06: check-in can be undone only within 30 minutes", () => {
    const early = booked();
    moveTo(early, ["CONFIRMED", "CHECKED_IN"], minutes(-5));
    expect(early.transition("CONFIRMED", { now: minutes(24), actor: desk, justification: null }).ok).toBe(
      true,
    );

    const late = booked();
    moveTo(late, ["CHECKED_IN"], minutes(-5));
    const result = late.transition("CONFIRMED", { now: minutes(26), actor: desk, justification: null });
    expect(result.ok ? null : result.error.code).toBe("SCHEDULING_UNDO_EXPIRED");
  });

  it("F06: completion can be reverted by the professional within 30 minutes or by a manager with justification", () => {
    const completed = () => {
      const appointment = booked();
      moveTo(appointment, ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"], minutes(50));
      return appointment;
    };
    expect(
      completed().transition("IN_PROGRESS", { now: minutes(79), actor: professional, justification: null })
        .ok,
    ).toBe(true);
    const tooLate = completed().transition("IN_PROGRESS", {
      now: minutes(81),
      actor: professional,
      justification: null,
    });
    expect(tooLate.ok ? null : tooLate.error.code).toBe("SCHEDULING_UNDO_EXPIRED");
    const noReason = completed().transition("IN_PROGRESS", {
      now: minutes(600),
      actor: manager,
      justification: " ",
    });
    expect(noReason.ok ? null : noReason.error.code).toBe("SCHEDULING_JUSTIFICATION_REQUIRED");
    const withReason = completed();
    expect(
      withReason.transition("IN_PROGRESS", {
        now: minutes(600),
        actor: manager,
        justification: "Concluído por engano.",
      }).ok,
    ).toBe(true);
    expect(withReason.pendingStatusChanges.at(-1)?.justification).toBe("Concluído por engano.");
    const frontDesk = completed().transition("IN_PROGRESS", {
      now: minutes(55),
      actor: desk,
      justification: null,
    });
    expect(frontDesk.ok).toBe(false);
  });

  it("F06: no-show cannot be set before the start time", () => {
    const appointment = booked();
    const early = appointment.transition("NO_SHOW", { now: minutes(-1), actor: desk, justification: null });
    expect(early.ok ? null : early.error.code).toBe("SCHEDULING_NO_SHOW_TOO_EARLY");
    expect(appointment.transition("NO_SHOW", { now: START, actor: desk, justification: null }).ok).toBe(true);
  });

  it("F06: invalid transitions are refused", () => {
    const appointment = booked();
    const result = appointment.transition("COMPLETED", { now: START, actor: desk, justification: null });
    expect(result.ok ? null : result.error.code).toBe("SCHEDULING_INVALID_TRANSITION");
    expect(appointment.transition("CANCELLED", { now: START, actor: desk, justification: null }).ok).toBe(
      false,
    );
  });

  it("F06: rescheduling resets the status and records the previous values", () => {
    const appointment = booked();
    moveTo(appointment, ["CONFIRMED"], minutes(-120));
    const result = appointment.reschedule({
      startsAt: minutes(60 * 24),
      professionalId: "p2",
      roomId: "r2",
      decision: { isOverbooking: true, exceptionJustification: null, exceptionCodes: [] },
      source: "DRAG",
      now: minutes(-60),
      actorId: "desk",
    });
    expect(result.ok).toBe(true);
    expect(appointment.status).toBe("SCHEDULED");
    expect(appointment.snapshot).toMatchObject({ professionalId: "p2", roomId: "r2", isOverbooking: true });
    expect(appointment.pendingReschedules).toEqual([
      expect.objectContaining({
        previousStartsAt: START,
        previousEndsAt: minutes(50),
        previousProfessionalId: "p1",
        previousRoomId: "r1",
        previousStatus: "CONFIRMED",
        source: "DRAG",
      }),
    ]);
    expect(appointment.pendingStatusChanges.at(-1)).toMatchObject({
      fromStatus: "CONFIRMED",
      toStatus: "SCHEDULED",
    });
  });

  it("F06: editing service or duration is refused after check-in", () => {
    const appointment = booked();
    expect(appointment.edit({ durationMinutes: 60 }).ok).toBe(true);
    expect(appointment.snapshot.priceCents).toBe(25_000);
    moveTo(appointment, ["CHECKED_IN"], minutes(-5));
    const result = appointment.edit({ serviceId: "s2", priceCents: 30_000 });
    expect(result.ok ? null : result.error.code).toBe("SCHEDULING_NOT_EDITABLE");
  });

  it("F06: cancellation stores origin, reason and note", () => {
    const appointment = booked();
    expect(
      appointment.cancel({
        origin: "PATIENT",
        reasonId: "reason",
        note: "Viagem.",
        now: START,
        actorId: "desk",
      }).ok,
    ).toBe(true);
    expect(appointment.snapshot.cancellation).toMatchObject({ origin: "PATIENT", reasonId: "reason" });
    expect(appointment.status).toBe("CANCELLED");
    expect(
      appointment.cancel({ origin: "PATIENT", reasonId: "reason", note: null, now: START, actorId: "desk" })
        .ok,
    ).toBe(false);
  });
});
