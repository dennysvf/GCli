import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { professionals } from "@/modules/professionals";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  createProfessionalOrThrow,
  registration,
  createServiceOrThrow,
  createUnitWithHours,
  h,
  orgDate,
  professionalsContext,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("professionals public API", () => {
  it("F04→F06: working hours and time-offs define the working calendar", async () => {
    const ctx = await professionalsContext();
    const centro = await createUnitWithHours(ctx, { name: "Unidade Centro" });
    const sul = await createUnitWithHours(ctx, { name: "Unidade Sul" });
    const id = await createProfessionalOrThrow(ctx);
    const saved = await professionals.saveSchedule(ctx, {
      professionalId: id,
      validFrom: orgDate(),
      intervals: [1, 2, 3, 4, 5].flatMap((weekday) => [
        { unitId: centro, weekday, start: h(8), end: h(12) },
        { unitId: sul, weekday, start: h(14), end: h(18) },
      ]),
    });
    expect(saved.ok).toBe(true);
    await professionals.createTimeOff(ctx, {
      professionalId: id,
      type: "CONFERENCE",
      allDay: true,
      startsAt: orgDate(3),
      endsAt: orgDate(4),
      note: null,
    });
    await units.setUnitActive(ctx, { unitId: sul, active: false });

    const calendar = await professionals.getWorkingCalendar(ctx, id, { from: orgDate(), to: orgDate(6) });
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;
    expect(calendar.value.days).toHaveLength(7);
    const weekdays = calendar.value.days.filter((day) => day.weekday <= 5);
    for (const day of weekdays) {
      // The deactivated unit is skipped; the other keeps its intervals and time zone.
      expect(day.units).toEqual([
        { unitId: centro, timeZone: "America/Sao_Paulo", intervals: [{ start: h(8), end: h(12) }] },
      ]);
    }
    expect(calendar.value.timeOffs).toHaveLength(1);
    expect(calendar.value.timeOffs[0]?.type).toBe("CONFERENCE");

    const tooLong = await professionals.getWorkingCalendar(ctx, id, { from: orgDate(), to: orgDate(70) });
    expect(!tooLong.ok && tooLong.error.code).toBe("VALIDATION_FAILED");
  });

  it("F04→F06: a professional without the service enabled cannot be selected for it", async () => {
    const ctx = await professionalsContext();
    const centro = await createUnitWithHours(ctx);
    const serviceId = await createServiceOrThrow(ctx);
    const enabled = await createProfessionalOrThrow(ctx, { fullName: "Bruno Reis", displayName: null });
    const notEnabled = await createProfessionalOrThrow(ctx, {
      registrations: [registration({ number: "222" })],
    });
    const inactive = await createProfessionalOrThrow(ctx, {
      registrations: [registration({ number: "333" })],
      fullName: "Carla Souza",
    });
    for (const professionalId of [enabled, inactive]) {
      await professionals.replaceEnabledServices(ctx, {
        professionalId,
        version: 1,
        serviceIds: [serviceId],
      });
    }
    await professionals.setProfessionalActive(ctx, { professionalId: inactive, active: false });
    await professionals.saveSchedule(ctx, {
      professionalId: enabled,
      validFrom: orgDate(),
      intervals: [{ unitId: centro, weekday: 1, start: h(8), end: h(12) }],
    });

    const bookable = await professionals.listBookableProfessionals(ctx, { serviceId });
    expect(bookable.ok && bookable.value.map((item) => item.id)).toEqual([enabled]);
    expect(bookable.ok && bookable.value[0]?.displayName).toBe("Bruno Reis");
    const inUnit = await professionals.listBookableProfessionals(ctx, { serviceId, unitId: centro });
    expect(inUnit.ok && inUnit.value.map((item) => item.id)).toEqual([enabled]);

    expect(await professionals.isServiceEnabled(ctx, enabled, serviceId)).toEqual({ ok: true, value: true });
    expect(await professionals.isServiceEnabled(ctx, notEnabled, serviceId)).toEqual({
      ok: true,
      value: false,
    });
    expect(await professionals.isServiceEnabled(ctx, inactive, serviceId)).toEqual({
      ok: true,
      value: false,
    });
  });

  it("F04→F08: name and council registration are provided for documents", async () => {
    const ctx = await professionalsContext();
    const id = await createProfessionalOrThrow(ctx);
    const credentials = await professionals.getProfessionalCredentials(ctx, id);
    const expected = {
      country: "BR",
      councilType: "CRM",
      councilOtherName: null,
      number: "123456",
      region: "SP",
      npi: null,
      label: "CRM",
      formatted: "CRM 123456/SP",
    };
    expect(credentials.ok && credentials.value).toEqual({
      fullName: "Ana Paula Lima",
      displayName: "Dra. Ana Lima",
      specialty: "Dermatologia",
      registrations: [expected],
      registration: expected,
    });
    const summaries = await professionals.getProfessionals(ctx, { ids: [id] });
    expect(summaries.ok && summaries.value).toEqual([
      { id, displayName: "Dra. Ana Lima", fullName: "Ana Paula Lima", color: "teal", active: true },
    ]);
  });

  it("F04→F03: the services list counts active professionals per service", async () => {
    const ctx = await professionalsContext();
    const serviceId = await createServiceOrThrow(ctx);
    const first = await createProfessionalOrThrow(ctx);
    const second = await createProfessionalOrThrow(ctx, { registrations: [registration({ number: "222" })] });
    for (const professionalId of [first, second]) {
      await professionals.replaceEnabledServices(ctx, {
        professionalId,
        version: 1,
        serviceIds: [serviceId],
      });
    }
    await professionals.setProfessionalActive(ctx, { professionalId: second, active: false });
    const list = await services.listServices(ctx, {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const item = list.value.groups
      .flatMap((group) => group.services)
      .find((service) => service.id === serviceId);
    expect(item?.enabledProfessionals).toBe(1);
  });
});
