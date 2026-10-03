import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { countryProfile } from "@/shared/kernel/countries";
import { closeHelpers, resetDatabase } from "../helpers";
import { patientInput } from "../patients/support";
import { h, orgDate, professionalInput, registration } from "../professionals/support";
import { booking, bookOrThrow, schedulingWorld, type World } from "../scheduling/support";
import { brl } from "../services/support";
import { fakeAppointments, fullWeek, managerContext } from "../units/support";

beforeEach(resetDatabase);
afterEach(() => units.registerScheduledAppointments(null));
afterAll(closeHelpers);

const PT_UNIT = {
  name: "Unidade Lisboa",
  country: "PT",
  timeZone: "Europe/Lisbon",
  phone: "912 345 678",
  email: null,
  address: { postalCode: "1100053", street: "Rua Augusta", number: "5", city: "Lisboa", region: "Lisboa" },
};

async function createPortugueseUnit(world: World) {
  const created = await units.createUnit(world.admin, PT_UNIT);
  if (!created.ok) throw new Error(`createUnit failed: ${created.error.code}`);
  const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    intervals: [{ start: h(8), end: h(18) }],
  }));
  const saved = await units.replaceBusinessHours(world.admin, {
    unitId: created.value.unitId,
    days: fullWeek(hours),
  });
  if (!saved.ok) throw new Error(`replaceBusinessHours failed: ${saved.error.code}`);
  return created.value;
}

describe("country profiles", () => {
  it("F16: a unit's country defines its settings and cannot change after it has appointments", async () => {
    const ctx = await managerContext();
    const created = await units.createUnit(ctx, PT_UNIT);
    expect(created).toMatchObject({ ok: true, value: { currency: "EUR", servicesWithoutPrice: [] } });
    if (!created.ok) return;

    const unit = await units.getUnit(ctx, created.value.unitId);
    expect(unit.ok && unit.value).toMatchObject({
      country: "PT",
      currency: "EUR",
      timeZone: "Europe/Lisbon",
      phone: "+351912345678",
      address: { country: "PT", postalCode: "1100-053", region: "Lisboa" },
    });

    // The time zone must belong to the country.
    const wrongZone = await units.createUnit(ctx, {
      ...PT_UNIT,
      name: "Outra",
      timeZone: "America/Sao_Paulo",
    });
    expect(!wrongZone.ok && wrongZone.error.fields?.timeZone).toBe("units.validation.timeZoneRequired");

    const update = (country: string, timeZone: string) =>
      units.updateUnit(ctx, {
        ...PT_UNIT,
        country,
        timeZone,
        unitId: created.value.unitId,
        version: 1,
        phone: null,
        address: {},
      });
    // Without appointments the country can change; with one it is locked.
    units.registerScheduledAppointments(fakeAppointments({ hasAnyInUnit: true }));
    const locked = await update("ES", "Europe/Madrid");
    expect(!locked.ok && locked.error.code).toBe("UNITS_COUNTRY_LOCKED");
    units.registerScheduledAppointments(null);
    expect((await update("ES", "Europe/Madrid")).ok).toBe(true);
    expect(await db().unit.findUniqueOrThrow({ where: { id: created.value.unitId } })).toMatchObject({
      country: "ES",
      currency: "EUR",
    });
  });

  it("F16: units outside Brazil apply Brazilian legal rules and warn the administrator", () => {
    expect(countryProfile("BR").legalRulesValidated).toBe(true);
    for (const code of ["PT", "ES", "MX", "AR", "CL", "CO", "US"] as const) {
      expect(countryProfile(code).legalRulesValidated).toBe(false);
    }
  });

  it("F16: documents are validated per type, unique per type and masked for front desk", async () => {
    const world = await schedulingWorld();
    const dni = (number: string) => ({ country: "ES", type: "DNI_ES", number });
    const invalid = await patients.createPatient(world.desk, patientInput({ document: dni("12345678A") }));
    expect(!invalid.ok && invalid.error.fields?.["document.number"]).toBe(
      "validation.documentInvalid?type=DNI",
    );
    const first = await patients.createPatient(
      world.desk,
      patientInput({ fullName: "Marta Gómez Ruiz", document: dni("12345678Z"), confirmDuplicate: true }),
    );
    expect(first.ok).toBe(true);
    const same = await patients.createPatient(
      world.desk,
      patientInput({ fullName: "Lucía Pérez Díaz", document: dni("12345678-z"), confirmDuplicate: true }),
    );
    expect(!same.ok && same.error.code).toBe("PATIENTS_DOCUMENT_TAKEN");
    // The same number under another type is another document.
    const other = await patients.createPatient(
      world.desk,
      patientInput({
        fullName: "Rui Santos Lima",
        document: { country: "AR", type: "DNI_AR", number: "12345678" },
        confirmDuplicate: true,
      }),
    );
    expect(other.ok).toBe(true);

    const found = await patients.searchPatients(world.desk, { q: "12345678Z" });
    expect(found.ok && found.value.items.map((item) => item.document)).toEqual([
      { type: "DNI_ES", display: "•••678Z" },
    ]);
    // A document of any type is also found by its digits.
    const byDigits = await patients.searchPatients(world.manager, { q: "12345678" });
    expect(byDigits.ok && byDigits.value.items).toHaveLength(1);
    expect(byDigits.ok && byDigits.value.items[0]?.document).toEqual({
      type: "DNI_AR",
      display: "12.345.678",
    });
  });

  it("F16: every amount is stored in minor units with its currency, and booking snapshots the unit currency", async () => {
    const world = await schedulingWorld();
    const portugal = await createPortugueseUnit(world);
    // Creating a unit in a new currency lists the services that have no price in it.
    expect(portugal.servicesWithoutPrice.map((service) => service.name).sort()).toEqual([
      "Consulta",
      "Retorno",
    ]);

    // A professional needs a registration in the country of the unit to work there.
    const created = await professionals.createProfessional(
      world.admin,
      professionalInput({
        fullName: "Inês Carvalho",
        displayName: "Dra. Inês",
        registrations: [registration({ number: "888888" })],
      }),
    );
    if (!created.ok) throw new Error(created.error.code);
    const professionalId = created.value.professionalId;
    const enabled = await professionals.replaceEnabledServices(world.admin, {
      professionalId,
      version: 1,
      serviceIds: [world.services.consulta, world.services.retorno],
    });
    if (!enabled.ok) throw new Error(enabled.error.code);
    const intervals = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      unitId: portugal.unitId,
      weekday,
      start: h(8),
      end: h(18),
    }));
    const noRegistration = await professionals.saveSchedule(world.admin, {
      professionalId,
      validFrom: orgDate(),
      intervals,
    });
    expect(!noRegistration.ok && noRegistration.error).toMatchObject({
      code: "PROFESSIONALS_REGISTRATION_REQUIRED",
      params: { country: "Portugal", unit: "Unidade Lisboa" },
    });

    const professional = await professionals.getProfessional(world.admin, professionalId);
    if (!professional.ok) throw new Error("professional");
    const withPortugal = await professionals.updateProfessional(world.admin, {
      ...professionalInput({
        fullName: "Inês Carvalho",
        displayName: "Dra. Inês",
        registrations: [
          registration({ number: "888888" }),
          registration({ country: "PT", councilType: "ORDEM_MEDICOS", number: "12345", region: null }),
        ],
      }),
      professionalId,
      version: professional.value.version,
    });
    if (!withPortugal.ok) throw new Error(withPortugal.error.code);
    const schedule = await professionals.saveSchedule(world.admin, {
      professionalId,
      validFrom: orgDate(),
      intervals,
    });
    if (!schedule.ok) throw new Error(`saveSchedule failed: ${schedule.error.code}`);

    const input = {
      ...booking(world, {
        unitId: portugal.unitId,
        professionalId,
        roomId: null,
        serviceId: world.services.retorno,
        startTime: "10:00",
      }),
    };
    // F16: booking needs a price in the unit currency.
    const noPrice = await scheduling.bookAppointment(world.admin, input);
    expect(!noPrice.ok && noPrice.error).toMatchObject({
      code: "SCHEDULING_NO_PRICE_FOR_CURRENCY",
      params: { currency: "EUR" },
    });

    const service = await services.getService(world.admin, world.services.retorno);
    if (!service.ok) throw new Error("service");
    const priced = await services.updateService(world.admin, {
      serviceId: world.services.retorno,
      version: service.value.version,
      name: service.value.name,
      categoryId: service.value.categoryId,
      description: null,
      durationMinutes: service.value.durationMinutes,
      prices: [...brl(12_000), { currency: "EUR", amountMinor: 6000 }],
      color: service.value.color,
      requiresRoom: false,
      allowedRoomIds: [],
    });
    expect(priced.ok).toBe(true);
    const booked = await bookOrThrow(world.admin, input);
    expect(booked.price).toEqual({ amountMinor: 6000, currency: "EUR" });
    const row = await db().appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } });
    expect(row).toMatchObject({ priceMinor: 6000n, currency: "EUR" });
    const history = await db().servicePriceChange.findMany({
      where: { serviceId: world.services.retorno, currency: "EUR" },
    });
    expect(history).toMatchObject([{ previousAmountMinor: null, amountMinor: 6000n }]);
  });

  it("F16: a service needs a price in every currency in use", async () => {
    const world = await schedulingWorld();
    await createPortugueseUnit(world);
    const service = await services.getService(world.admin, world.services.retorno);
    if (!service.ok) throw new Error("service");
    const missing = await services.updateService(world.admin, {
      serviceId: world.services.retorno,
      version: service.value.version,
      name: service.value.name,
      categoryId: service.value.categoryId,
      description: null,
      durationMinutes: service.value.durationMinutes,
      prices: brl(12_000),
      color: service.value.color,
      requiresRoom: false,
      allowedRoomIds: [],
    });
    expect(!missing.ok && missing.error).toMatchObject({
      code: "SERVICES_PRICE_REQUIRED",
      fields: { "prices.EUR": "services.errors.SERVICES_PRICE_REQUIRED?currency=EUR" },
      params: { currency: "EUR" },
    });
  });

  it("F16: country profiles drive the patient address and the councils of each country", () => {
    expect(countryProfile("US").address.region.regions).toHaveLength(51);
    expect(countryProfile("ES").councils.some((council) => council.type === "COLEGIO_MEDICOS")).toBe(true);
    expect(countryProfile("MX").paymentMethods).toContain("SPEI");
  });
});
