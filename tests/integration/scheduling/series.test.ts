import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { scheduling } from "@/modules/scheduling";
import { db } from "@/shared/db/client";
import { isoWeekday } from "@/shared/kernel/calendar-date";
import { closeHelpers, errorText, resetDatabase } from "../helpers";
import { booking, bookOrThrow, day, firstReasonId, schedulingWorld, type World } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: World;
beforeEach(async () => {
  world = await schedulingWorld();
});

// Tuesday-and-Thursday style rule starting on a date at least a week ahead.
function seriesInput(overrides: Record<string, unknown> = {}, recurrence: Record<string, unknown> = {}) {
  const first = day(7);
  const weekdays = [isoWeekday(first), (isoWeekday(first) % 7) + 2 > 7 ? 1 : (isoWeekday(first) % 7) + 2];
  return {
    ...booking(world, { date: first, startTime: "09:00" }),
    recurrence: { frequency: "WEEKLY", weekdays, endsAfter: 20, endsOn: null, ...recurrence },
    ...overrides,
  };
}

describe("recurring series", () => {
  it("F06: a recurring series of up to 52 occurrences is created in one action after conflicts are skipped or re-timed", async () => {
    const input = seriesInput();
    const preview0 = await scheduling.previewSeries(world.desk, input);
    if (!preview0.ok) throw new Error(preview0.error.code);
    expect(preview0.value).toMatchObject({ total: 20, conflicts: 0 });
    // Occupy the room at four occurrences.
    const blocked = preview0.value.occurrences.filter((item) => [3, 6, 9, 12].includes(item.index));
    for (const item of blocked) {
      await bookOrThrow(
        world.desk,
        booking(world, {
          professionalId: world.professionals.bruno,
          patientId: world.patients.joao,
          date: item.date,
          startTime: "09:00",
        }),
      );
    }
    const preview = await scheduling.previewSeries(world.desk, input);
    expect(preview.ok && preview.value).toMatchObject({ total: 20, conflicts: 4 });
    const conflicting = preview.ok
      ? preview.value.occurrences.filter((item) => item.status === "CONFLICT")
      : [];
    expect(conflicting.map((item) => item.index)).toEqual([3, 6, 9, 12]);
    expect(conflicting[0]?.suggestions.length).toBeGreaterThan(0);

    const unresolved = await scheduling.bookSeries(world.desk, input);
    expect(!unresolved.ok && unresolved.error).toMatchObject({
      code: "SCHEDULING_SERIES_CONFLICTS",
      params: { conflicts: 4, total: 20 },
    });
    expect(
      errorText("scheduling", { code: "SCHEDULING_SERIES_CONFLICTS", params: { conflicts: 4, total: 20 } }),
    ).toBe("4 de 20 sessões possuem conflito.");
    expect(await db().appointment.count({ where: { seriesId: { not: null } } })).toBe(0);

    const resolutions = [
      { index: 3, action: "SKIP" },
      { index: 6, action: "SKIP" },
      { index: 9, action: "RETIME", startTime: conflicting[2]?.suggestions[0] ?? "11:00" },
      { index: 12, action: "RETIME", startTime: "15:00" },
    ];
    const saved = await scheduling.bookSeries(world.desk, { ...input, resolutions });
    if (!saved.ok) throw new Error(JSON.stringify(saved.error));
    expect(saved.value.appointmentIds).toHaveLength(18);
    expect(saved.value.skipped).toBe(2);
    expect(await db().appointment.count({ where: { seriesId: saved.value.seriesId } })).toBe(18);

    const max = await scheduling.previewSeries(
      world.desk,
      seriesInput({ startTime: "16:00", patientId: world.patients.joao }, { endsAfter: 52 }),
    );
    expect(max.ok && max.value.total).toBe(52);
    const tooMany = await scheduling.previewSeries(world.desk, seriesInput({}, { endsAfter: 53 }));
    expect(!tooMany.ok && tooMany.error.code).toBe("SCHEDULING_SERIES_RULE_INVALID");
  });

  it("F06: cancelling this and following cancels only the selected and later occurrences", async () => {
    const saved = await scheduling.bookSeries(world.desk, seriesInput({}, { endsAfter: 6 }));
    if (!saved.ok) throw new Error(saved.error.code);
    const occurrences = await db().appointment.findMany({
      where: { seriesId: saved.value.seriesId },
      orderBy: { seriesIndex: "asc" },
    });
    // The 5th occurrence was already checked in and must be skipped.
    const fifth = occurrences[4];
    if (!fifth) throw new Error("fifth");
    await scheduling.changeAppointmentStatus(world.desk, {
      appointmentId: fifth.id,
      version: 1,
      to: "CHECKED_IN",
    });
    const third = occurrences[2];
    if (!third) throw new Error("third");
    const result = await scheduling.cancelAppointment(world.desk, {
      appointmentId: third.id,
      version: 1,
      origin: "PATIENT",
      reasonId: await firstReasonId(world.desk),
      scope: "THIS_AND_FOLLOWING",
    });
    expect(result.ok && result.value).toMatchObject({ skipped: 1 });
    const after = await db().appointment.findMany({
      where: { seriesId: saved.value.seriesId },
      orderBy: { seriesIndex: "asc" },
    });
    expect(after.map((row) => row.status)).toEqual([
      "SCHEDULED",
      "SCHEDULED",
      "CANCELLED",
      "CANCELLED",
      "CHECKED_IN",
      "CANCELLED",
    ]);
    expect(
      after.filter((row) => row.status === "CANCELLED").every((row) => row.cancellationOrigin === "PATIENT"),
    ).toBe(true);
  });

  it("F06: editing this and following splits the series and revalidates each occurrence", async () => {
    const saved = await scheduling.bookSeries(world.desk, seriesInput({}, { endsAfter: 6 }));
    if (!saved.ok) throw new Error(saved.error.code);
    const occurrences = await db().appointment.findMany({
      where: { seriesId: saved.value.seriesId },
      orderBy: { seriesIndex: "asc" },
    });
    const fourth = occurrences[3];
    const sixth = occurrences[5];
    if (!fourth || !sixth) throw new Error("occurrences");
    // Bruno is busy at 14:00 on the 6th occurrence's date in Sala 2.
    const busyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      sixth.startsAt,
    );
    await bookOrThrow(
      world.desk,
      booking(world, {
        professionalId: world.professionals.bruno,
        roomId: world.rooms.sala2,
        patientId: world.patients.joao,
        date: busyDate,
        startTime: "14:00",
      }),
    );
    const edit = {
      appointmentId: occurrences[2]?.id,
      scope: "THIS_AND_FOLLOWING",
      changes: { startTime: "14:00", professionalId: world.professionals.bruno },
    };
    const preview = await scheduling.previewSeriesEdit(world.desk, edit);
    expect(preview.ok && preview.value).toMatchObject({ total: 4, conflicts: 1 });
    const blocked = await scheduling.editSeries(world.desk, edit);
    expect(!blocked.ok && blocked.error.code).toBe("SCHEDULING_SERIES_CONFLICTS");
    const done = await scheduling.editSeries(world.desk, {
      ...edit,
      resolutions: [{ index: 6, action: "RETIME", startTime: "15:00" }],
    });
    if (!done.ok) throw new Error(JSON.stringify(done.error));
    const oldSeries = await db().appointmentSeries.findUniqueOrThrow({ where: { id: saved.value.seriesId } });
    expect(oldSeries.endsAfterIndex).toBe(2);
    const newSeries = await db().appointmentSeries.findUniqueOrThrow({
      where: { id: done.value.newSeriesId },
    });
    expect(newSeries).toMatchObject({
      previousSeriesId: saved.value.seriesId,
      professionalId: world.professionals.bruno,
    });
    const moved = await db().appointment.findMany({
      where: { seriesId: done.value.newSeriesId },
      orderBy: { seriesIndex: "asc" },
    });
    expect(moved).toHaveLength(4);
    expect(moved.every((row) => row.professionalId === world.professionals.bruno)).toBe(true);
    expect(await db().appointmentReschedule.count({ where: { source: "SERIES" } })).toBe(4);
  });
});
