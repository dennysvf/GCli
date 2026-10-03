import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { scheduling, SCHEDULING_EVENTS } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { db } from "@/shared/db/client";
import { eventBus } from "@/shared/db/transaction";
import type { DomainEvent } from "@/shared/events/event-bus";
import { Pool } from "pg";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { booking, bookOrThrow, day, firstReasonId, schedulingWorld, type World } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

// Test subscriber: records events and can fail on demand (handlers run inside the transaction).
const received: DomainEvent[] = [];
let failOn: string | null = null;
for (const type of Object.values(SCHEDULING_EVENTS)) {
  eventBus.subscribe(type, async (event) => {
    if (failOn === type) throw new Error("subscriber failed");
    received.push(event);
  });
}

let world: World;
beforeEach(async () => {
  received.length = 0;
  failOn = null;
  world = await schedulingWorld();
});

async function move(ctx: World["desk"], appointmentId: string, to: string, justification?: string) {
  const current = await db().appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  return scheduling.changeAppointmentStatus(ctx, {
    appointmentId,
    version: current.version,
    to,
    ...(justification ? { justification } : {}),
  });
}

// An appointment that already started (booked by a manager with a justification).
async function startedAppointment() {
  const now = new Date();
  const local = new Date(now.getTime() - 3 * 3_600_000 - 60 * 60_000);
  const hour = local.getUTCHours();
  // Use today in the past when possible; otherwise yesterday at 10:00.
  const useToday = hour >= 8 && hour < 17;
  const startTime = useToday ? `${String(hour).padStart(2, "0")}:00` : "10:00";
  return bookOrThrow(
    world.manager,
    booking(world, {
      date: useToday ? day(0) : day(-1),
      startTime,
      exceptionJustification: "Registro de atendimento já ocorrido.",
    }),
  );
}

describe("status lifecycle", () => {
  it("F06: status transitions follow the lifecycle and record user and timestamp, and no-show waits for the start time", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    for (const to of ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"]) {
      const changed = await move(world.desk, booked.appointmentId, to);
      expect(changed.ok, to).toBe(true);
    }
    const history = await db().appointmentStatusChange.findMany({
      where: { appointmentId: booked.appointmentId },
      orderBy: { changedAt: "asc" },
    });
    expect(history.map((row) => row.toStatus)).toEqual([
      "SCHEDULED",
      "CONFIRMED",
      "CHECKED_IN",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
    expect(
      history.every((row) => row.changedById === world.desk.user.id && row.changedAt instanceof Date),
    ).toBe(true);
    const invalid = await move(world.desk, booked.appointmentId, "NO_SHOW");
    expect(!invalid.ok && invalid.error.code).toBe("SCHEDULING_INVALID_TRANSITION");

    const future = await bookOrThrow(world.desk, booking(world, { startTime: "16:00" }));
    const early = await move(world.desk, future.appointmentId, "NO_SHOW");
    expect(!early.ok && early.error.code).toBe("SCHEDULING_NO_SHOW_TOO_EARLY");
    const started = await startedAppointment();
    expect((await move(world.desk, started.appointmentId, "NO_SHOW")).ok).toBe(true);
  });

  it("F06: check-in publishes the event with the price snapshot inside the transaction and can be undone", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    expect((await move(world.desk, booked.appointmentId, "CHECKED_IN")).ok).toBe(true);
    const checkedIn = received.find((event) => event.type === SCHEDULING_EVENTS.checkedIn);
    expect(checkedIn?.payload).toMatchObject({
      appointmentId: booked.appointmentId,
      priceCents: 25_000,
      professionalId: world.professionals.ana,
      serviceId: world.services.consulta,
      unitId: world.unitId,
      status: "CHECKED_IN",
    });
    expect((await move(world.desk, booked.appointmentId, "CONFIRMED")).ok).toBe(true);
    expect(received.map((event) => event.type)).toContain(SCHEDULING_EVENTS.checkInUndone);

    // A failing subscriber rolls the status change back (architecture 5.4).
    failOn = SCHEDULING_EVENTS.checkedIn;
    await expect(move(world.desk, booked.appointmentId, "CHECKED_IN")).rejects.toThrow("subscriber failed");
    const row = await db().appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });
    expect(row.status).toBe("CONFIRMED");
  });

  it("F06: professionals start and complete their own appointments and may revert within 30 minutes; managers revert with justification", async () => {
    const own = await bookOrThrow(world.desk, booking(world));
    await move(world.desk, own.appointmentId, "CHECKED_IN");
    expect((await move(world.pro, own.appointmentId, "IN_PROGRESS")).ok).toBe(true);
    expect((await move(world.pro, own.appointmentId, "COMPLETED")).ok).toBe(true);
    expect(received.map((event) => event.type)).toContain(SCHEDULING_EVENTS.completed);
    expect((await move(world.pro, own.appointmentId, "IN_PROGRESS")).ok).toBe(true);
    expect(received.map((event) => event.type)).toContain(SCHEDULING_EVENTS.completionReverted);
    expect((await move(world.pro, own.appointmentId, "COMPLETED")).ok).toBe(true);

    const desk = await move(world.desk, own.appointmentId, "IN_PROGRESS");
    expect(!desk.ok && desk.error.code).toBe("AUTHZ_FORBIDDEN");
    const noReason = await move(world.manager, own.appointmentId, "IN_PROGRESS");
    expect(!noReason.ok && noReason.error.code).toBe("SCHEDULING_JUSTIFICATION_REQUIRED");
    expect((await move(world.manager, own.appointmentId, "IN_PROGRESS", "Concluído por engano.")).ok).toBe(
      true,
    );
    const last = await db().appointmentStatusChange.findFirstOrThrow({
      where: { appointmentId: own.appointmentId },
      orderBy: { createdAt: "desc" },
    });
    expect(last.justification).toBe("Concluído por engano.");

    // A professional cannot check in nor touch another professional's appointment.
    const other = await bookOrThrow(
      world.desk,
      booking(world, {
        professionalId: world.professionals.bruno,
        roomId: world.rooms.sala2,
        startTime: "14:00",
      }),
    );
    const checkIn = await move(world.pro, own.appointmentId, "CHECKED_IN");
    expect(checkIn.ok).toBe(false);
    const foreign = await move(world.pro, other.appointmentId, "CONFIRMED");
    expect(!foreign.ok && foreign.error.code).toBe("SCHEDULING_NOT_FOUND");
  });

  it("F06: cancellation cannot be saved without origin and reason", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    const missing = await scheduling.cancelAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 1,
    });
    expect(!missing.ok && missing.error.code).toBe("SCHEDULING_CANCELLATION_INCOMPLETE");
    const reasonId = await firstReasonId(world.desk);
    const cancelled = await scheduling.cancelAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 1,
      origin: "PATIENT",
      reasonId,
      note: "Viagem a trabalho.",
    });
    expect(cancelled.ok && cancelled.value.cancelledIds).toEqual([booked.appointmentId]);
    const row = await db().appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });
    expect(row).toMatchObject({
      status: "CANCELLED",
      cancellationOrigin: "PATIENT",
      cancellationReasonId: reasonId,
    });
    // The database refuses a cancellation without its data.
    await expect(
      db().appointment.update({ where: { id: booked.appointmentId }, data: { cancellationReasonId: null } }),
    ).rejects.toThrow();
    // The slot is free again.
    await bookOrThrow(world.desk, booking(world, { patientId: world.patients.joao }));
  });

  it("F06: rescheduling keeps the same appointment, stores the previous values and resets status", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    await move(world.desk, booked.appointmentId, "CONFIRMED");
    const moved = await scheduling.rescheduleAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 2,
      date: day(8),
      startTime: "11:00",
      professionalId: world.professionals.bruno,
      roomId: world.rooms.sala2,
      source: "DRAG",
    });
    expect(moved.ok && moved.value).toMatchObject({
      appointmentId: booked.appointmentId,
      status: "SCHEDULED",
    });
    const history = await db().appointmentReschedule.findMany({
      where: { appointmentId: booked.appointmentId },
    });
    expect(history).toEqual([
      expect.objectContaining({
        previousStartsAt: new Date(booked.startsAt),
        previousProfessionalId: world.professionals.ana,
        previousRoomId: world.rooms.sala1,
        previousStatus: "CONFIRMED",
        source: "DRAG",
      }),
    ]);
    expect(await db().appointment.count()).toBe(1);
    const details = await scheduling.getAppointment(world.desk, booked.appointmentId);
    expect(details.ok && details.value.reschedules[0]).toMatchObject({
      previousProfessionalName: "Dra. Ana",
      previousRoomName: "Sala 1",
      rescheduledByName: "Recepção Teste",
    });
  });

  it("F06: changing the service before check-in takes a new price snapshot", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    const resized = await scheduling.updateAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 1,
      durationMinutes: 60,
    });
    expect(resized.ok && resized.value.priceCents).toBe(25_000);
    const service = await services.getService(world.admin, world.services.retorno);
    if (!service.ok) throw new Error("service");
    const changed = await scheduling.updateAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 2,
      serviceId: world.services.retorno,
      roomId: null,
    });
    expect(changed.ok && changed.value.priceCents).toBe(12_000);
    await move(world.desk, booked.appointmentId, "CHECKED_IN");
    const locked = await scheduling.updateAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 4,
      notes: "Depois do check-in",
    });
    expect(!locked.ok && locked.error.code).toBe("SCHEDULING_NOT_EDITABLE");
  });

  it("F06: concurrent edits of the same appointment are detected", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    expect(
      (
        await scheduling.updateAppointment(world.desk, {
          appointmentId: booked.appointmentId,
          version: 1,
          notes: "A",
        })
      ).ok,
    ).toBe(true);
    const stale = await scheduling.updateAppointment(world.manager, {
      appointmentId: booked.appointmentId,
      version: 1,
      notes: "B",
    });
    expect(!stale.ok && stale.error).toMatchObject({
      code: "SCHEDULING_STALE_VERSION",
      params: { author: "Recepção Teste" },
    });
  });

  it("F06: status and reschedule history cannot be changed by the application role", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await expect(
        pool.query("UPDATE appointment_status_change SET to_status = 'COMPLETED' WHERE appointment_id = $1", [
          booked.appointmentId,
        ]),
      ).rejects.toThrow(/permission denied/);
      await expect(pool.query("DELETE FROM appointment_reschedule")).rejects.toThrow(/permission denied/);
    } finally {
      await pool.end();
    }
    const audit = await auditEvents({ entityId: booked.appointmentId });
    expect(audit).toHaveLength(1);
  });
});

describe("cancellation reasons", () => {
  it("F06: cancellation reasons are seeded, renamed and deactivated", async () => {
    const listed = await scheduling.listCancellationReasons(world.admin);
    expect(listed.ok && listed.value.map((item) => item.name)).toEqual([
      "Imprevisto pessoal",
      "Problema de saúde",
      "Remarcação solicitada pela clínica",
      "Outro",
    ]);
    const duplicate = await scheduling.createCancellationReason(world.admin, { name: "outro" });
    expect(!duplicate.ok && duplicate.error.code).toBe("SCHEDULING_LIST_NAME_TAKEN");
    const created = await scheduling.createCancellationReason(world.admin, { name: "Clima" });
    if (!created.ok) throw new Error("create");
    expect(
      (await scheduling.renameCancellationReason(world.admin, { id: created.value.id, name: "Chuva forte" }))
        .ok,
    ).toBe(true);
    expect(
      (await scheduling.setCancellationReasonActive(world.admin, { id: created.value.id, active: false })).ok,
    ).toBe(true);
    const desk = await scheduling.createCancellationReason(world.desk, { name: "Outra coisa" });
    expect(!desk.ok && desk.error.code).toBe("AUTHZ_FORBIDDEN");
    const booked = await bookOrThrow(world.desk, booking(world));
    const inactive = await scheduling.cancelAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 1,
      origin: "CLINIC",
      reasonId: created.value.id,
    });
    expect(!inactive.ok && inactive.error.code).toBe("SCHEDULING_INVALID_REASON");
  });
});
