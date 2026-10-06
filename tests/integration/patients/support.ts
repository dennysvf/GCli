import { patients, type PatientAppointments } from "@/modules/patients";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { createOrganization, createUser, signedInContext } from "../helpers";

export type Role = "ADMINISTRATOR" | "MANAGER" | "FRONT_DESK" | "PROFESSIONAL";
export type TestContext = Awaited<ReturnType<typeof patientsContext>>;

export const VALID_CPF = "52998224725";
export const OTHER_CPF = "11144477735";

// A Brazilian CPF as the identity document of a patient.
export const cpfDoc = (number: string) => ({ country: "BR", type: "CPF", number });

export async function patientsContext(
  role: Role = "FRONT_DESK",
  organizationId?: string,
  name = "Ana Souza",
) {
  const orgId = organizationId ?? (await createOrganization());
  const user = await createUser({ organizationId: orgId, role, name });
  return (await signedInContext(user)).ctx;
}

// Birth date for someone of the given age in the organization's default time zone.
export function birthDateForAge(years: number, extraDays = 0): string {
  const today = dateInTimeZone(new Date(), "America/Sao_Paulo");
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  return new Date(Date.UTC(year - years, month - 1, day - extraDays)).toISOString().slice(0, 10);
}

export function patientInput(overrides: Record<string, unknown> = {}) {
  return {
    mode: "full",
    fullName: "Maria Silva Oliveira",
    socialName: null,
    birthDate: "1988-04-12",
    sex: "FEMALE",
    document: null,
    mobilePhone: "(11) 98888-7777",
    email: "maria@exemplo.com.br",
    address: {
      country: "BR",
      postalCode: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      city: "São Paulo",
      region: "SP",
    },
    tagIds: [],
    guardian: null,
    ...overrides,
  };
}

export async function createPatientOrThrow(ctx: TestContext, overrides: Record<string, unknown> = {}) {
  const result = await patients.createPatient(ctx, patientInput({ confirmDuplicate: true, ...overrides }));
  if (!result.ok) throw new Error(`createPatient failed: ${result.error.code}`);
  if (result.value.kind !== "created") throw new Error("unexpected duplicate warning");
  return result.value.patientId;
}

export async function publishTerms(ctx: TestContext, text = "Termos de privacidade da clínica. ".repeat(3)) {
  const result = await patients.publishTermsVersion(ctx, { text });
  if (!result.ok) throw new Error(`publishTermsVersion failed: ${result.error.code}`);
  return result.value.version;
}

// Fake scheduling (F06).
export function fakeAppointments(
  values: { future?: number; visible?: string[]; last?: Record<string, string> } = {},
): PatientAppointments {
  return {
    countFuture: async () => values.future ?? 0,
    lastAppointmentDates: async () => new Map(Object.entries(values.last ?? {})),
    hasAppointmentWith: async (_org, _professional, patientId) => (values.visible ?? []).includes(patientId),
    patientIdsFor: async () => values.visible ?? [],
  };
}

export { createUser, signedInContext };
