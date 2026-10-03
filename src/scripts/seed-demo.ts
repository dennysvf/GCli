import { hash } from "@node-rs/argon2";
import { parseArgs } from "node:util";
import { registerModules } from "@/composition";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import type { RequestContext } from "@/shared/context/types";
import { db } from "@/shared/db/client";
import { addDays, isoWeekday } from "@/shared/kernel/calendar-date";
import { newId } from "@/shared/kernel/ids";
import { dateInTimeZone } from "@/shared/kernel/time-zones";

// Demo data for local development: services, professionals with working hours, patients and two
// weeks of appointments in several statuses. Everything goes through the use cases, so the data
// follows the same rules, audit and history as the application. Local databases only:
//   npm run seed:demo
const PASSWORD = "Demo2026senha";
const TZ = "America/Sao_Paulo";

// Deterministic pseudo-random numbers, so two runs on empty databases give the same agenda.
let seed = 20261003;
function random(): number {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;

function must<T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string; fields?: unknown } },
  what: string,
): T {
  if (!result.ok)
    throw new Error(`${what}: ${result.error.code} ${JSON.stringify(result.error.fields ?? {})}`);
  return result.value;
}

async function createUser(organizationId: string, name: string, email: string, role: string) {
  const id = newId();
  await db().user.create({
    data: { id, organizationId, name, email, emailVerified: true, role, status: "ACTIVE" },
  });
  await db().account.create({
    data: {
      id: newId(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hash(PASSWORD),
    },
  });
  return id;
}

const PATIENTS = [
  { fullName: "Maria Silva Oliveira", socialName: null, birthDate: "1988-04-12", mobilePhone: "11988887777" },
  { fullName: "João Pedro Santos", socialName: null, birthDate: "1979-02-10", mobilePhone: "11977776666" },
  {
    fullName: "Mariana Costa Ferreira",
    socialName: "Mari Ferreira",
    birthDate: "1995-07-21",
    mobilePhone: "11966665555",
  },
  { fullName: "Carlos Eduardo Lima", socialName: null, birthDate: "1965-11-03", mobilePhone: "11955554444" },
  { fullName: "Fernanda Alves Rocha", socialName: null, birthDate: "1990-01-30", mobilePhone: "11944443333" },
  { fullName: "Rafael Gomes Pereira", socialName: null, birthDate: "1983-09-15", mobilePhone: "11933332222" },
  {
    fullName: "Juliana Martins Souza",
    socialName: null,
    birthDate: "2001-05-08",
    mobilePhone: "11922221111",
  },
  {
    fullName: "Lucas Henrique Barbosa",
    socialName: null,
    birthDate: "1998-12-19",
    mobilePhone: "11911110000",
  },
  {
    fullName: "Patrícia Mendes Araújo",
    socialName: null,
    birthDate: "1972-03-27",
    mobilePhone: "11999990000",
  },
  {
    fullName: "Gabriel Ribeiro Teixeira",
    socialName: null,
    birthDate: "1993-08-02",
    mobilePhone: "11998887766",
  },
  { fullName: "Aline Cardoso Nunes", socialName: null, birthDate: "1986-06-14", mobilePhone: "11997776655" },
  {
    fullName: "Roberto Carvalho Dias",
    socialName: null,
    birthDate: "1958-10-25",
    mobilePhone: "11996665544",
  },
  {
    fullName: "Camila Duarte Moreira",
    socialName: null,
    birthDate: "1999-02-17",
    mobilePhone: "11995554433",
  },
  {
    fullName: "Thiago Azevedo Castro",
    socialName: null,
    birthDate: "1991-04-09",
    mobilePhone: "11994443322",
  },
  {
    fullName: "Beatriz Lopes Freitas",
    socialName: "Bia Freitas",
    birthDate: "2004-09-30",
    mobilePhone: "11993332211",
  },
] as const;

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { force: { type: "boolean" } } });
  registerModules();

  const admin = await db().user.findFirst({ where: { role: "ADMINISTRATOR", status: "ACTIVE" } });
  if (!admin) {
    console.error("Nenhum administrador ativo. Rode antes: npm run setup:admin");
    return 1;
  }
  if ((await db().service.count()) > 0 && !values.force) {
    console.error(
      "O banco já tem serviços cadastrados; os dados de demonstração não foram criados (use --force).",
    );
    return 1;
  }
  const ctx: RequestContext = {
    kind: "user",
    requestId: newId(),
    organizationId: admin.organizationId,
    user: { id: admin.id, name: admin.name, email: admin.email, role: "ADMINISTRATOR" },
    sessionId: "seed-demo",
    linkedProfessionalId: null,
    ipAddress: null,
    userAgent: "seed-demo",
  };

  // Units: the existing ones, with three rooms in the first and two in the second.
  const unitList = must(await units.listUnits(ctx, { activeOnly: true }), "listUnits");
  const main = unitList[0];
  const second = unitList[1] ?? unitList[0];
  if (!main || !second) {
    console.error("Cadastre ao menos uma unidade antes de popular os dados.");
    return 1;
  }
  const roomsOf = async (unitId: string) =>
    must(await units.listRooms(ctx, unitId, { activeOnly: true }), "listRooms");
  const ensureRooms = async (unitId: string, names: string[]) => {
    for (const name of names) {
      if (!(await roomsOf(unitId)).some((room) => room.name === name)) {
        must(await units.createRoom(ctx, { unitId, name }), "createRoom");
      }
    }
  };
  await ensureRooms(main.id, ["Sala 2", "Sala 3"]);
  if (second.id !== main.id) await ensureRooms(second.id, ["Sala 2"]);

  // Services by category.
  const existing = must(await services.listCategories(ctx), "listCategories");
  const category = async (name: string) =>
    existing.find((item) => item.name.toLowerCase() === name.toLowerCase())?.id ??
    must(await services.createCategory(ctx, { name }), "createCategory").categoryId;
  const consultas = await category("Consultas");
  const procedimentos = await category("Procedimentos");
  const fisioterapia = await category("Fisioterapia");
  const service = async (input: {
    name: string;
    categoryId: string;
    durationMinutes: number;
    priceCents: number;
    color: string;
    requiresRoom: boolean;
  }) =>
    must(
      await services.createService(ctx, { ...input, description: null, allowedRoomIds: [] }),
      "createService",
    ).serviceId;
  const consulta = await service({
    name: "Consulta dermatológica",
    categoryId: consultas,
    durationMinutes: 30,
    priceCents: 25_000,
    color: "blue",
    requiresRoom: false,
  });
  const retorno = await service({
    name: "Retorno",
    categoryId: consultas,
    durationMinutes: 15,
    priceCents: 12_000,
    color: "sky",
    requiresRoom: false,
  });
  const limpeza = await service({
    name: "Limpeza de pele",
    categoryId: procedimentos,
    durationMinutes: 60,
    priceCents: 18_000,
    color: "pink",
    requiresRoom: true,
  });
  const peeling = await service({
    name: "Peeling químico",
    categoryId: procedimentos,
    durationMinutes: 45,
    priceCents: 35_000,
    color: "violet",
    requiresRoom: true,
  });
  const fisio = await service({
    name: "Sessão de fisioterapia",
    categoryId: fisioterapia,
    durationMinutes: 45,
    priceCents: 14_000,
    color: "teal",
    requiresRoom: true,
  });

  // Users: front desk, and a Professional user linked to Dra. Beatriz.
  await createUser(admin.organizationId, "Rita Recepção", "rita@clinicademo.com.br", "FRONT_DESK");
  const beatrizUser = await createUser(
    admin.organizationId,
    "Beatriz Costa",
    "beatriz@clinicademo.com.br",
    "PROFESSIONAL",
  );

  // Professionals with enabled services and working hours (08–12 and 13–18). Each one splits the
  // week between the two units, so every unit has two professionals on every weekday:
  //   Paulista:       Mon Beatriz+Carla, Tue Bruno+Carla, Wed Beatriz+Diego, Thu Bruno+Carla, Fri Beatriz+Diego
  //   Paulista 2465:  Mon Bruno+Diego,   Tue Beatriz+Diego, Wed Bruno+Carla, Thu Beatriz+Diego, Fri Bruno+Carla
  type Week = Record<number, string>;
  const u1 = main.id;
  const u2 = second.id;
  const weeks: Record<"beatriz" | "bruno" | "carla" | "diego", Week> = {
    beatriz: { 1: u1, 2: u2, 3: u1, 4: u2, 5: u1 },
    bruno: { 1: u2, 2: u1, 3: u2, 4: u1, 5: u2 },
    carla: { 1: u1, 2: u1, 3: u2, 4: u1, 5: u2 },
    diego: { 1: u2, 2: u2, 3: u1, 4: u2, 5: u1 },
  };
  const intervalsOf = (week: Week) =>
    Object.entries(week).flatMap(([weekday, unitId]) => [
      { unitId, weekday: Number(weekday), start: 8 * 60, end: 12 * 60 },
      { unitId, weekday: Number(weekday), start: 13 * 60, end: 18 * 60 },
    ]);
  const professional = async (
    input: {
      fullName: string;
      displayName: string;
      specialty: string;
      councilType: string;
      councilNumber: string | null;
      color: string;
      linkedUserId?: string;
    },
    serviceIds: string[],
    intervals: { unitId: string; weekday: number; start: number; end: number }[],
  ) => {
    const id = must(
      await professionals.createProfessional(ctx, {
        ...input,
        councilOtherName: null,
        councilState: input.councilType === "NONE" ? null : "SP",
        cpf: null,
        phone: null,
        email: null,
        linkedUserId: input.linkedUserId ?? null,
      }),
      "createProfessional",
    ).professionalId;
    must(
      await professionals.replaceEnabledServices(ctx, { professionalId: id, version: 1, serviceIds }),
      "services",
    );
    must(
      await professionals.saveSchedule(ctx, {
        professionalId: id,
        // F04: a schedule starts today or later; last week's demo appointments are justified exceptions.
        validFrom: today(),
        intervals,
      }),
      "saveSchedule",
    );
    return id;
  };
  const beatriz = await professional(
    {
      fullName: "Beatriz Costa Andrade",
      displayName: "Dra. Beatriz Costa",
      specialty: "Dermatologia",
      councilType: "CRM",
      councilNumber: "123456",
      color: "indigo",
      linkedUserId: beatrizUser,
    },
    [consulta, retorno, peeling],
    intervalsOf(weeks.beatriz),
  );
  const bruno = await professional(
    {
      fullName: "Bruno Reis Carvalho",
      displayName: "Dr. Bruno Reis",
      specialty: "Dermatologia",
      councilType: "CRM",
      councilNumber: "654321",
      color: "amber",
    },
    [consulta, retorno, peeling, limpeza],
    intervalsOf(weeks.bruno),
  );
  const carla = await professional(
    {
      fullName: "Carla Souza Pinto",
      displayName: "Carla Souza",
      specialty: "Fisioterapia",
      councilType: "CREFITO",
      councilNumber: "98765-F",
      color: "teal",
    },
    [fisio],
    intervalsOf(weeks.carla),
  );
  const diego = await professional(
    {
      fullName: "Diego Martins Rocha",
      displayName: "Diego Martins",
      specialty: "Estética",
      councilType: "NONE",
      councilNumber: null,
      color: "orange",
    },
    [limpeza, peeling],
    intervalsOf(weeks.diego),
  );
  // Carla is on vacation for three days next week (the agenda shows the time-off).
  must(
    await professionals.createTimeOff(ctx, {
      professionalId: carla,
      type: "VACATION",
      allDay: true,
      startsAt: nextWeekday(9),
      endsAt: addDays(nextWeekday(9), 2),
      note: null,
    }),
    "createTimeOff",
  );

  // Patients.
  const patientIds: string[] = [];
  for (const patient of PATIENTS) {
    const created = must(
      await patients.createPatient(ctx, {
        mode: "full",
        sex: "NOT_INFORMED",
        tagIds: [],
        guardian: null,
        confirmDuplicate: true,
        ...patient,
      }),
      "createPatient",
    );
    if (created.kind === "created") patientIds.push(created.patientId);
  }

  // Appointments: last week (completed, no-shows, a cancellation) and the next two weeks.
  const roomIds = new Map<string, string[]>();
  for (const unitId of new Set([u1, u2])) {
    roomIds.set(
      unitId,
      (await roomsOf(unitId)).map((room) => room.id),
    );
  }
  const rooms = roomIds.get(u1) ?? [];
  // A recurring physiotherapy series, booked first so the random appointments work around it, on
  // a day Carla works at the main unit.
  let firstDay = nextWeekday(1);
  while (weeks.carla[isoWeekday(firstDay)] !== u1) firstDay = nextWeekday(1 + daysBetweenToday(firstDay));
  const seriesInput = {
    patientId: patientIds[3],
    serviceId: fisio,
    professionalId: carla,
    unitId: main.id,
    roomId: rooms[2] ?? rooms[0],
    date: firstDay,
    startTime: "08:00",
    notes: "Plano de 6 sessões após cirurgia no joelho.",
    recurrence: { frequency: "WEEKLY", weekdays: [isoWeekday(firstDay)], endsAfter: 6, endsOn: null },
  };
  // Sessions that fall on Carla's vacation are skipped, as the front desk would do.
  const preview = must(await scheduling.previewSeries(ctx, seriesInput), "previewSeries");
  const series = await scheduling.bookSeries(ctx, {
    ...seriesInput,
    resolutions: preview.occurrences
      .filter((item) => item.status === "CONFLICT")
      .map((item) => ({ index: item.index, action: "SKIP" })),
  });
  const plan: { professionalId: string; serviceIds: string[]; week: Week }[] = [
    { professionalId: beatriz, serviceIds: [consulta, consulta, retorno, peeling], week: weeks.beatriz },
    { professionalId: bruno, serviceIds: [consulta, retorno, limpeza, peeling], week: weeks.bruno },
    { professionalId: carla, serviceIds: [fisio], week: weeks.carla },
    { professionalId: diego, serviceIds: [limpeza, peeling], week: weeks.diego },
  ];
  const reasonId = must(await scheduling.listCancellationReasons(ctx, { activeOnly: true }), "reasons")[0]
    ?.id;
  const start = addDays(today(), -7);
  let booked = 0;
  for (let offset = 0; offset < 21; offset++) {
    const date = addDays(start, offset);
    const weekday = isoWeekday(date);
    if (weekday > 5) continue;
    const past = date < today();
    for (const person of plan) {
      const unitId = person.week[weekday];
      if (!unitId) continue;
      for (const hour of [8, 9, 10, 11, 13, 14, 15, 16, 17]) {
        if (random() < 0.45) continue;
        const serviceId = pick(person.serviceIds);
        const needsRoom = [limpeza, peeling, fisio].includes(serviceId);
        const roomId = needsRoom ? pick(roomIds.get(unitId) ?? []) : null;
        const minute = pick([0, 0, 15, 30]);
        const result = await scheduling.bookAppointment(ctx, {
          patientId: pick(patientIds),
          serviceId,
          professionalId: person.professionalId,
          unitId,
          roomId: roomId ?? null,
          date,
          startTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
          notes: random() < 0.15 ? "Paciente pediu para confirmar por WhatsApp." : null,
          ...(past ? { exceptionJustification: "Dados de demonstração (atendimento passado)." } : {}),
        });
        // Overlaps (a room or patient already busy) are skipped, as the front desk would see them.
        if (!result.ok) continue;
        booked += 1;
        const id = result.value.appointmentId;
        let version = 1;
        const move = async (to: string) => {
          const changed = await scheduling.changeAppointmentStatus(ctx, { appointmentId: id, version, to });
          if (changed.ok) version = changed.value.version;
          return changed.ok;
        };
        const roll = random();
        if (past) {
          if (roll < 0.1 && reasonId) {
            await scheduling.cancelAppointment(ctx, {
              appointmentId: id,
              version,
              origin: pick(["PATIENT", "CLINIC"]),
              reasonId,
              note: null,
            });
          } else if (roll < 0.2) {
            await move("NO_SHOW");
          } else {
            for (const to of ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"]) await move(to);
          }
        } else if (roll < 0.45) {
          await move("CONFIRMED");
        } else if (roll < 0.5 && reasonId) {
          await scheduling.cancelAppointment(ctx, {
            appointmentId: id,
            version,
            origin: "PATIENT",
            reasonId,
            note: "Viagem a trabalho.",
          });
        }
      }
    }
  }

  // An Encaixe in the coming days.
  const occupied = await db().appointment.findFirst({
    where: { professionalId: beatriz, startsAt: { gt: new Date() }, status: { not: "CANCELLED" } },
    orderBy: { startsAt: "asc" },
  });
  if (occupied) {
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(occupied.startsAt);
    await scheduling.bookAppointment(ctx, {
      patientId: patientIds[0],
      serviceId: retorno,
      professionalId: beatriz,
      unitId: main.id,
      roomId: null,
      date: dateInTimeZone(occupied.startsAt, TZ),
      startTime: local,
      notes: "Encaixe: retorno rápido para mostrar exames.",
      confirmOverbooking: true,
    });
  }

  console.log("Dados de demonstração criados:");
  console.log(
    `- 5 serviços, 4 profissionais, ${patientIds.length} pacientes, ${booked} agendamentos avulsos`,
  );
  console.log(
    `- série de fisioterapia: ${series.ok ? `${series.value.appointmentIds.length} sessões` : series.error.code}`,
  );
  console.log(
    `- usuários (senha ${PASSWORD}): rita@clinicademo.com.br (Recepção), beatriz@clinicademo.com.br (Profissional)`,
  );
  return 0;
}

function today(): string {
  return dateInTimeZone(new Date(), TZ);
}

function daysBetweenToday(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);
}

// The first weekday (Monday to Friday) at least `from` days ahead.
function nextWeekday(from: number): string {
  let date = addDays(today(), from);
  while (isoWeekday(date) > 5) date = addDays(date, 1);
  return date;
}

main()
  .then(async (code) => {
    await db().$disconnect();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await db().$disconnect();
    process.exit(1);
  });
