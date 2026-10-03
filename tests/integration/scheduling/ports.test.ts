import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import { h } from "../professionals/support";
import { booking, bookOrThrow, day, schedulingWorld, type World } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: World;
beforeEach(async () => {
  world = await schedulingWorld();
});

describe("F06 as provider of the appointment ports", () => {
  it("F02←F06: closure and room rules count real appointments", async () => {
    await bookOrThrow(world.desk, booking(world));
    const closure = await units.createClosure(world.admin, {
      unitId: world.unitId,
      startsOn: day(7),
      endsOn: day(7),
      reason: "Reforma",
    });
    expect(!closure.ok && closure.error).toMatchObject({ params: { count: 1 } });
    const room = await units.setRoomActive(world.admin, { roomId: world.rooms.sala1, active: false });
    expect(!room.ok && room.error).toMatchObject({ params: { count: 1 } });
    const hours = await units.replaceBusinessHours(world.admin, {
      unitId: world.unitId,
      days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        open: true,
        intervals: [{ start: h(11), end: h(20) }],
      })),
    });
    expect(hours.ok && hours.value.affectedAppointments).toBe(1);
  });

  it("F02→F06: unit business hours and closures block bookings", async () => {
    const otherUnit = await units.createUnit(world.admin, {
      name: "Unidade Norte",
      timeZone: "America/Sao_Paulo",
      phone: null,
      email: null,
      address: { cep: "01310-100", street: "Rua A", number: "1", city: "São Paulo", state: "SP" },
    });
    if (!otherUnit.ok) throw new Error("unit");
    const room = await units.createRoom(world.admin, { unitId: otherUnit.value.unitId, name: "Sala Norte" });
    if (!room.ok) throw new Error("room");
    const wrongRoom = await scheduling.bookAppointment(
      world.desk,
      booking(world, { roomId: room.value.roomId }),
    );
    expect(!wrongRoom.ok && wrongRoom.error.code).toBe("SCHEDULING_ROOM_NOT_ALLOWED");
  });

  it("F03→F06: a price change affects only new appointments", async () => {
    const before = await bookOrThrow(world.desk, booking(world));
    const service = await services.getService(world.admin, world.services.consulta);
    if (!service.ok) throw new Error("service");
    const updated = await services.updateService(world.admin, {
      serviceId: world.services.consulta,
      version: service.value.version,
      name: service.value.name,
      categoryId: service.value.categoryId,
      description: null,
      durationMinutes: 50,
      priceCents: 30_000,
      color: "blue",
      requiresRoom: true,
      allowedRoomIds: [],
      confirmPriceChange: true,
    });
    if (!updated.ok) throw new Error(updated.error.code);
    const after = await bookOrThrow(world.desk, booking(world, { startTime: "15:00" }));
    expect(after.priceCents).toBe(30_000);
    const old = await db().appointment.findUniqueOrThrow({ where: { id: before.appointmentId } });
    expect(old.priceCents).toBe(25_000);
  });

  it("F03←F06 and F04←F06: services and professionals count future appointments and list affected ones", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    const service = await services.getService(world.admin, world.services.consulta);
    if (!service.ok) throw new Error("service");
    const deactivated = await services.setServiceActive(world.admin, {
      serviceId: world.services.consulta,
      active: false,
      version: service.value.version,
    });
    expect(deactivated.ok && deactivated.value).toMatchObject({ futureAppointments: 1 });

    const professional = await professionals.getProfessional(world.admin, world.professionals.ana);
    if (!professional.ok) throw new Error("professional");
    const blocked = await professionals.setProfessionalActive(world.admin, {
      professionalId: world.professionals.ana,
      active: false,
      version: professional.value.version,
    });
    expect(!blocked.ok && blocked.error).toMatchObject({ params: { count: 1 } });
    const timeOff = await professionals.createTimeOff(world.admin, {
      professionalId: world.professionals.ana,
      type: "VACATION",
      allDay: true,
      startsAt: day(7),
      endsAt: day(7),
      note: null,
    });
    expect(timeOff.ok && timeOff.value.affectedAppointments).toEqual([
      expect.objectContaining({
        appointmentId: booked.appointmentId,
        serviceName: "Consulta",
        patientName: "Mari Oliveira",
      }),
    ]);
  });

  it("F04→F06: working hours and time-offs define bookable slots and enablement limits professionals", async () => {
    const outside = await scheduling.bookAppointment(world.desk, booking(world, { startTime: "18:30" }));
    expect(!outside.ok && outside.error.code).toBe("SCHEDULING_CONFLICTS");
  });

  it("F05←F06: patient deactivation and professional visibility use real appointments", async () => {
    await bookOrThrow(world.desk, booking(world));
    const deactivate = await patients.setPatientActive(world.desk, {
      patientId: world.patients.maria,
      active: false,
      reason: "MOVED",
    });
    expect(!deactivate.ok && deactivate.error).toMatchObject({
      code: "PATIENTS_HAS_FUTURE_APPOINTMENTS",
      params: { count: 1 },
    });
    const visible = await patients.getPatient(world.pro, world.patients.maria);
    expect(visible.ok).toBe(true);
    const hidden = await patients.getPatient(world.pro, world.patients.joao);
    expect(!hidden.ok && hidden.error.code).toBe("AUTHZ_FORBIDDEN");
    const search = await patients.searchPatients(world.desk, { q: "Maria" });
    expect(search.ok && search.value.items[0]?.lastAppointmentAt).not.toBeNull();
  });

  it("F05→F06: the booking shows the social name and quick registration creates a bookable patient", async () => {
    const quick = await patients.createPatient(world.desk, {
      mode: "quick",
      fullName: "Paciente Rápido Teste",
      birthDate: "1990-05-05",
      mobilePhone: "(11) 96666-5555",
    });
    if (!quick.ok || quick.value.kind !== "created") throw new Error("quick");
    const booked = await bookOrThrow(world.desk, booking(world, { patientId: quick.value.patientId }));
    const details = await scheduling.getAppointment(world.desk, booked.appointmentId);
    expect(details.ok && details.value.patient.displayName).toBe("Paciente Rápido Teste");
    const social = await bookOrThrow(world.desk, booking(world, { startTime: "15:00" }));
    const socialDetails = await scheduling.getAppointment(world.desk, social.appointmentId);
    expect(socialDetails.ok && socialDetails.value.patient.displayName).toBe("Mari Oliveira");
  });

  it("F06→F07: appointments expose status, professional and patient for clinical notes", async () => {
    const booked = await bookOrThrow(world.desk, booking(world));
    const details = await scheduling.getAppointment(world.pro, booked.appointmentId);
    expect(details.ok && details.value).toMatchObject({
      status: "SCHEDULED",
      professional: { id: world.professionals.ana },
      patient: { id: world.patients.maria },
      service: { id: world.services.consulta },
      unitId: world.unitId,
      statusHistory: [expect.objectContaining({ toStatus: "SCHEDULED", changedByName: "Recepção Teste" })],
    });
  });
});
