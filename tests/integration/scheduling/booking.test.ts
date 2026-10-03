import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { scheduling, schedulingMessages } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { interpolate } from "@/shared/kernel/action-result";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { booking, bookOrThrow, day, schedulingWorld, type World } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

type Finding = { code: string; severity: string; message: string };
const findingsOf = (error: { details?: Record<string, unknown> }) =>
  (error.details?.findings ?? []) as Finding[];

let world: World;
beforeEach(async () => {
  world = await schedulingWorld();
});

describe("booking", () => {
  it("F06: booking fills duration and price from the service and lists only enabled professionals", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    expect(booked.priceCents).toBe(25_000);
    expect(new Date(booked.endsAt).getTime() - new Date(booked.startsAt).getTime()).toBe(50 * 60_000);
    const row = await db().appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });
    expect(row).toMatchObject({ durationMinutes: 50, priceCents: 25_000, status: "SCHEDULED" });

    // A professional without the service enabled is neither listed nor bookable.
    const other = await professionals.createProfessional(world.admin, {
      fullName: "Carla Souza",
      displayName: "Carla Souza",
      specialty: null,
      councilType: "NONE",
      councilOtherName: null,
      councilNumber: null,
      councilState: null,
      cpf: null,
      phone: null,
      email: null,
      color: "violet",
      linkedUserId: null,
    });
    if (!other.ok) throw new Error(other.error.code);
    const bookable = await professionals.listBookableProfessionals(world.desk, {
      serviceId: world.services.consulta,
    });
    expect(bookable.ok && bookable.value.map((item) => item.id).sort()).toEqual(
      [world.professionals.ana, world.professionals.bruno].sort(),
    );
    const refused = await scheduling.bookAppointment(
      world.desk,
      booking(world, { professionalId: other.value.professionalId, startTime: "11:00" }),
    );
    expect(!refused.ok && refused.error.code).toBe("SCHEDULING_SERVICE_NOT_ENABLED");

    const audit = await auditEvents({ entityId: booked.appointmentId });
    expect(audit.map((event) => event.action)).toEqual(["CREATE"]);
    const history = await db().appointmentStatusChange.findMany({
      where: { appointmentId: booked.appointmentId },
    });
    expect(history).toEqual([expect.objectContaining({ fromStatus: null, toStatus: "SCHEDULED" })]);
  });

  it("F06: booking the same professional in an overlapping time is blocked unless confirmed as encaixe", async () => {
    await bookOrThrow(world.desk, booking(world, { startTime: "14:00" }));
    const overlap = booking(world, {
      patientId: world.patients.joao,
      roomId: world.rooms.sala2,
      startTime: "14:30",
    });
    const first = await scheduling.bookAppointment(world.desk, overlap);
    expect(!first.ok && first.error.code).toBe("SCHEDULING_CONFLICTS");
    const findings = first.ok ? [] : findingsOf(first.error);
    expect(findings).toEqual([
      expect.objectContaining({
        code: "SCHEDULING_PROFESSIONAL_CONFLICT",
        severity: "OVERBOOKABLE",
        message: "Dra. Ana já possui atendimento das 14:00 às 14:50. Deseja registrar como encaixe?",
      }),
    ]);
    const confirmed = await bookOrThrow(world.desk, { ...overlap, confirmOverbooking: true });
    expect(confirmed.isOverbooking).toBe(true);
    const agenda = await scheduling.getAgenda(world.desk, { unitId: world.unitId, from: day(7), to: day(7) });
    expect(
      agenda.ok && agenda.value.items.find((item) => item.id === confirmed.appointmentId)?.isOverbooking,
    ).toBe(true);
  });

  it("F06: booking a room already occupied in an overlapping time is always blocked", async () => {
    await bookOrThrow(world.desk, booking(world, { startTime: "14:00" }));
    const result = await scheduling.bookAppointment(
      world.manager,
      booking(world, {
        professionalId: world.professionals.bruno,
        patientId: world.patients.joao,
        startTime: "14:15",
        confirmOverbooking: true,
        exceptionJustification: "Tentativa de forçar a sala.",
      }),
    );
    expect(!result.ok && result.error.code).toBe("SCHEDULING_CONFLICTS");
    expect(result.ok ? [] : findingsOf(result.error)).toEqual([
      expect.objectContaining({
        code: "SCHEDULING_ROOM_CONFLICT",
        severity: "BLOCKING",
        message: "A Sala 1 está ocupada das 14:00 às 14:50. Escolha outra sala ou horário.",
      }),
    ]);
    // The database refuses it too, even when the application check is bypassed.
    const existing = await db().appointment.findFirstOrThrow({});
    await expect(
      db().appointment.create({
        data: {
          ...existing,
          id: "0192f0b2-0000-7000-8000-00000000abcd",
          professionalId: world.professionals.bruno,
          patientId: world.patients.joao,
          exceptionCodes: [],
        },
      }),
    ).rejects.toThrow();
  });

  it("F06: booking outside working hours, during time-off, outside unit hours, or on a closure is blocked for front desk and allowed for managers with justification", async () => {
    const outside = booking(world, { startTime: "19:00" });
    const desk = await scheduling.bookAppointment(world.desk, outside);
    expect(!desk.ok && desk.error.code).toBe("SCHEDULING_CONFLICTS");
    expect(desk.ok ? [] : findingsOf(desk.error).map((item) => `${item.code}:${item.severity}`)).toEqual([
      "SCHEDULING_OUTSIDE_WORKING_HOURS:BLOCKING",
    ]);
    const noReason = await scheduling.bookAppointment(world.manager, outside);
    expect(!noReason.ok && noReason.error.code).toBe("SCHEDULING_JUSTIFICATION_REQUIRED");
    const justified = await bookOrThrow(world.manager, {
      ...outside,
      exceptionJustification: "Paciente só pode à noite.",
    });
    const audit = await auditEvents({ entityId: justified.appointmentId });
    expect(audit[0]?.metadata).toMatchObject({
      exceptionCodes: ["SCHEDULING_OUTSIDE_WORKING_HOURS"],
      exceptionJustification: "Paciente só pode à noite.",
    });

    // Time-off and closure.
    await professionals.createTimeOff(world.admin, {
      professionalId: world.professionals.ana,
      type: "PERSONAL",
      allDay: true,
      startsAt: day(8),
      endsAt: day(8),
      note: null,
    });
    const timeOff = await scheduling.bookAppointment(world.desk, booking(world, { date: day(8) }));
    expect(timeOff.ok ? [] : findingsOf(timeOff.error).map((item) => item.code)).toContain(
      "SCHEDULING_TIME_OFF",
    );
    await units.createClosure(world.admin, {
      unitId: world.unitId,
      startsOn: day(9),
      endsOn: day(9),
      reason: "Dedetização",
      confirmOverlap: true,
    });
    const closed = await scheduling.bookAppointment(world.desk, booking(world, { date: day(9) }));
    expect(closed.ok ? [] : findingsOf(closed.error)).toContainEqual(
      expect.objectContaining({
        code: "SCHEDULING_UNIT_CLOSED",
        message: "A unidade está fechada nesta data: Dedetização.",
      }),
    );
    const early = await scheduling.bookAppointment(world.desk, booking(world, { startTime: "07:00" }));
    expect(early.ok ? [] : findingsOf(early.error).map((item) => item.code)).toContain(
      "SCHEDULING_OUTSIDE_WORKING_HOURS",
    );
  });

  it("F06: two simultaneous saves for the same professional slot result in exactly one appointment", async () => {
    const extra = await Promise.all(
      [1, 2, 3, 4].map((index) =>
        patients.createPatient(world.desk, {
          mode: "quick",
          fullName: `Paciente Concorrente ${String.fromCharCode(64 + index)}`,
          birthDate: "1990-01-01",
          mobilePhone: `(11) 9${index}888-7777`,
          confirmDuplicate: true,
        }),
      ),
    );
    const patientIds = [world.patients.maria, world.patients.joao].concat(
      extra.map((result) => (result.ok && result.value.kind === "created" ? result.value.patientId : "")),
    );
    const results = await Promise.all(
      patientIds.map((patientId) =>
        scheduling.bookAppointment(
          world.desk,
          booking(world, { patientId, serviceId: world.services.retorno, roomId: null, startTime: "15:00" }),
        ),
      ),
    );
    const successes = results.filter((result) => result.ok);
    const codes = results.flatMap((result) => (result.ok ? [] : [result.error.code]));
    expect(successes).toHaveLength(1);
    expect(codes.every((code) => code === "SCHEDULING_SLOT_TAKEN" || code === "SCHEDULING_CONFLICTS")).toBe(
      true,
    );
    expect(codes).toContain("SCHEDULING_SLOT_TAKEN");
    expect(interpolate(schedulingMessages.SCHEDULING_SLOT_TAKEN ?? "")).toBe(
      "Este horário acabou de ser ocupado por outro agendamento. Atualize a agenda e escolha outro horário.",
    );
    expect(await db().appointment.count({ where: { status: { not: "CANCELLED" } } })).toBe(1);
  });

  it("F06: rooms are required and restricted, and inactive resources cannot be booked", async () => {
    const noRoom = await scheduling.bookAppointment(world.desk, booking(world, { roomId: null }));
    expect(!noRoom.ok && noRoom.error.code).toBe("SCHEDULING_ROOM_REQUIRED");
    const misaligned = await scheduling.bookAppointment(world.desk, booking(world, { startTime: "10:10" }));
    expect(!misaligned.ok && misaligned.error).toMatchObject({
      code: "SCHEDULING_INVALID_START",
      params: { granularity: 15 },
    });
    const service = await services.getService(world.admin, world.services.retorno);
    if (!service.ok) throw new Error("service");
    await services.setServiceActive(world.admin, {
      serviceId: world.services.retorno,
      active: false,
      version: service.value.version,
    });
    const inactive = await scheduling.bookAppointment(
      world.desk,
      booking(world, { serviceId: world.services.retorno, roomId: null }),
    );
    expect(!inactive.ok && inactive.error).toMatchObject({ code: "SCHEDULING_INACTIVE_RESOURCE" });
  });

  it("F06: a patient overlap is only a warning", async () => {
    await bookOrThrow(world.desk, booking(world, { startTime: "10:00" }));
    const second = await bookOrThrow(
      world.desk,
      booking(world, {
        professionalId: world.professionals.bruno,
        roomId: world.rooms.sala2,
        startTime: "10:15",
      }),
    );
    expect(second.warnings).toEqual([
      expect.objectContaining({
        code: "SCHEDULING_PATIENT_OVERLAP",
        message: "O paciente já tem agendamento das 10:00 às 10:50 com Dra. Ana.",
      }),
    ]);
  });
});
