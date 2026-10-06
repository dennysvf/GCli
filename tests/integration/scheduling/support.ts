import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { createOrganization, createUser, signedInContext } from "../helpers";
import { createUnitWithHours, h, professionalInput, registration } from "../professionals/support";
import { patientInput } from "../patients/support";

export type Ctx = Awaited<ReturnType<typeof signedInContext>>["ctx"];
export type Role = "ADMINISTRATOR" | "MANAGER" | "FRONT_DESK" | "PROFESSIONAL";

export { h };

// Calendar date in the unit's zone (America/Sao_Paulo), offset by a number of days.
export function day(offset: number): string {
  return dateInTimeZone(new Date(Date.now() + offset * 86_400_000), "America/Sao_Paulo");
}

async function userContext(organizationId: string, role: Role, name: string) {
  const user = await createUser({ organizationId, role, name });
  return { user, ctx: (await signedInContext(user)).ctx };
}

async function serviceOrThrow(
  ctx: Ctx,
  categoryId: string,
  input: {
    name: string;
    durationMinutes: number;
    prices: { currency: string; amountMinor: number }[];
    requiresRoom: boolean;
    color: string;
  },
) {
  const created = await services.createService(ctx, {
    ...input,
    categoryId,
    description: null,
    allowedRoomIds: [],
  });
  if (!created.ok) throw new Error(`createService failed: ${created.error.code}`);
  return created.value.serviceId;
}

async function professionalOrThrow(
  ctx: Ctx,
  input: { displayName: string; councilNumber: string; linkedUserId?: string | null },
  serviceIds: string[],
  unitId: string,
) {
  const created = await professionals.createProfessional(
    ctx,
    professionalInput({
      fullName: `${input.displayName} Silva`,
      displayName: input.displayName,
      registrations: [registration({ number: input.councilNumber })],
      email: null,
      linkedUserId: input.linkedUserId ?? null,
    }),
  );
  if (!created.ok) throw new Error(`createProfessional failed: ${created.error.code}`);
  const id = created.value.professionalId;
  const enabled = await professionals.replaceEnabledServices(ctx, {
    professionalId: id,
    version: 1,
    serviceIds,
  });
  if (!enabled.ok) throw new Error(`replaceEnabledServices failed: ${enabled.error.code}`);
  const schedule = await professionals.saveSchedule(ctx, {
    professionalId: id,
    validFrom: day(0),
    intervals: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ unitId, weekday, start: h(8), end: h(18) })),
  });
  if (!schedule.ok) throw new Error(`saveSchedule failed: ${schedule.error.code}`);
  return id;
}

async function patientOrThrow(ctx: Ctx, overrides: Record<string, unknown>) {
  const created = await patients.createPatient(ctx, patientInput({ confirmDuplicate: true, ...overrides }));
  if (!created.ok || created.value.kind !== "created") throw new Error("createPatient failed");
  return created.value.patientId;
}

// One clinic ready to book: a unit open every day 07:00–21:00 with two rooms, a service that
// requires a room (50 min, R$ 250,00) and one that does not (30 min), two professionals working
// every day 08:00–18:00 (Ana linked to a Professional user) and two patients.
export async function schedulingWorld(organizationId?: string) {
  const orgId = organizationId ?? (await createOrganization());
  const admin = await userContext(orgId, "ADMINISTRATOR", "Admin Teste");
  const manager = await userContext(orgId, "MANAGER", "Gerente Teste");
  const desk = await userContext(orgId, "FRONT_DESK", "Recepção Teste");
  const proUser = await userContext(orgId, "PROFESSIONAL", "Ana Lima");

  const unitId = await createUnitWithHours(admin.ctx, {
    hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, intervals: [{ start: h(7), end: h(21) }] })),
  });
  const sala1 = await units.createRoom(admin.ctx, { unitId, name: "Sala 1" });
  const sala2 = await units.createRoom(admin.ctx, { unitId, name: "Sala 2" });
  if (!sala1.ok || !sala2.ok) throw new Error("createRoom failed");

  const category = await services.createCategory(admin.ctx, { name: "Consultas" });
  if (!category.ok) throw new Error("createCategory failed");
  const consulta = await serviceOrThrow(admin.ctx, category.value.categoryId, {
    name: "Consulta",
    durationMinutes: 50,
    prices: [{ currency: "BRL", amountMinor: 25_000 }],
    requiresRoom: true,
    color: "blue",
  });
  const retorno = await serviceOrThrow(admin.ctx, category.value.categoryId, {
    name: "Retorno",
    durationMinutes: 30,
    prices: [{ currency: "BRL", amountMinor: 12_000 }],
    requiresRoom: false,
    color: "emerald",
  });

  const ana = await professionalOrThrow(
    admin.ctx,
    { displayName: "Dra. Ana", councilNumber: "111111", linkedUserId: proUser.user.id },
    [consulta, retorno],
    unitId,
  );
  const bruno = await professionalOrThrow(
    admin.ctx,
    { displayName: "Dr. Bruno", councilNumber: "222222" },
    [consulta, retorno],
    unitId,
  );
  const maria = await patientOrThrow(desk.ctx, {
    fullName: "Maria Silva Oliveira",
    socialName: "Mari Oliveira",
  });
  const joao = await patientOrThrow(desk.ctx, {
    fullName: "João Pedro Santos",
    birthDate: "1979-02-10",
    mobilePhone: "(11) 97777-6666",
  });
  // The professional's context is resolved after the link exists.
  const pro = (await signedInContext(proUser.user)).ctx;

  return {
    organizationId: orgId,
    admin: admin.ctx,
    manager: manager.ctx,
    desk: desk.ctx,
    pro,
    unitId,
    rooms: { sala1: sala1.value.roomId, sala2: sala2.value.roomId },
    services: { consulta, retorno },
    professionals: { ana, bruno },
    patients: { maria, joao },
  };
}

export type World = Awaited<ReturnType<typeof schedulingWorld>>;

export function booking(world: World, overrides: Record<string, unknown> = {}) {
  return {
    patientId: world.patients.maria,
    serviceId: world.services.consulta,
    professionalId: world.professionals.ana,
    unitId: world.unitId,
    roomId: world.rooms.sala1,
    date: day(7),
    startTime: "10:00",
    notes: null,
    ...overrides,
  };
}

export async function bookOrThrow(ctx: Ctx, input: Record<string, unknown>) {
  const result = await scheduling.bookAppointment(ctx, input);
  if (!result.ok)
    throw new Error(`bookAppointment failed: ${result.error.code} ${JSON.stringify(result.error)}`);
  return result.value;
}

export async function firstReasonId(ctx: Ctx) {
  const reasons = await scheduling.listCancellationReasons(ctx, { activeOnly: true });
  if (!reasons.ok || !reasons.value[0]) throw new Error("no reasons");
  return reasons.value[0].id;
}
