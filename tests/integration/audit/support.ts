import { Pool } from "pg";
import { createAudit, type AuditExport } from "@/modules/audit";
import type { RequestContext } from "@/shared/context/types";
import { db } from "@/shared/db/client";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { addDays } from "@/shared/kernel/calendar-date";
import { newId } from "@/shared/kernel/ids";
import { createOrganization, createUser, DEFAULT_PASSWORD, signedInContext } from "../helpers";

// Fixtures of the F15 contract (docs/F15-audit-log-viewer/contract.md, Prerequisites): written
// directly to the database, as the F01 writer would have recorded them.

export const audit = createAudit();
export const ZONE = "America/Sao_Paulo";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function today(): string {
  return dateInTimeZone(new Date(), ZONE);
}

export function daysAgo(days: number): string {
  return addDays(today(), -days);
}

type EventInput = {
  organizationId: string | null;
  occurredAt: Date;
  actorType?: "USER" | "SYSTEM" | "ANONYMOUS";
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export async function insertEvent(input: EventInput): Promise<string> {
  const id = newId();
  await db().auditEvent.create({
    data: {
      id,
      occurredAt: input.occurredAt,
      organizationId: input.organizationId,
      actorType: input.actorType ?? (input.actorUserId ? "USER" : "SYSTEM"),
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      ...(input.changes ? { changes: input.changes as object } : {}),
      ...(input.metadata ? { metadata: input.metadata as object } : {}),
      ipAddress: input.ipAddress ?? null,
      requestId: newId(),
    },
  });
  return id;
}

export async function insertPatient(
  organizationId: string,
  input: { fullName: string; mobilePhone: string; anonymizedCode?: string; anonymizedAt?: Date },
): Promise<string> {
  const id = newId();
  const anonymized = input.anonymizedCode !== undefined;
  await db().patient.create({
    data: {
      id,
      organizationId,
      fullName: input.fullName,
      normalizedName: input.fullName.toLowerCase(),
      birthDate: new Date("1990-05-10T00:00:00Z"),
      mobilePhone: input.mobilePhone,
      phoneDigits: input.mobilePhone.replace(/\D/g, ""),
      ...(anonymized
        ? {
            active: false,
            inactiveReason: "ANONYMIZED",
            deactivatedAt: input.anonymizedAt ?? new Date(),
            anonymizedAt: input.anonymizedAt ?? new Date(),
            anonymizedCode: input.anonymizedCode ?? null,
          }
        : {}),
    },
  });
  return id;
}

async function contextOf(organizationId: string, role: RequestContext["user"]["role"], name: string) {
  const user = await createUser({ organizationId, role, name, password: DEFAULT_PASSWORD });
  return (await signedInContext(user)).ctx;
}

// org-A ("Clínica Auditoria") with its users, patient-p1, the audit-sample events, patient-anon with
// the audit-anon events, and org-B with ev-b-update.
export async function auditWorld() {
  const orgA = await createOrganization("Clínica Auditoria");
  const admin = await contextOf(orgA, "ADMINISTRATOR", "Ana Admin");
  const adminEnUser = await createUser({ organizationId: orgA, role: "ADMINISTRATOR", name: "Erin Admin" });
  await db().user.update({ where: { id: adminEnUser.id }, data: { locale: "en" } });
  const adminEn = (await signedInContext(adminEnUser)).ctx;
  const manager = await contextOf(orgA, "MANAGER", "Gil Gestor");
  const desk = await contextOf(orgA, "FRONT_DESK", "Carla Recepção");
  const pro = await contextOf(orgA, "PROFESSIONAL", "Dra. Paula");
  const bruno = await createUser({
    organizationId: orgA,
    role: "FRONT_DESK",
    name: "Bruno Antigo",
    status: "INACTIVE",
  });

  const patientP1 = await insertPatient(orgA, { fullName: "Maria Souza", mobilePhone: "+5511988881111" });
  const noteN1 = newId();
  const chargeC1 = newId();
  const registerR1 = newId();
  const apptA1 = newId();
  const now = Date.now();
  const at = (hours: number) => new Date(now - hours * HOUR);

  const events = {
    patientCreate: await insertEvent({
      organizationId: orgA,
      occurredAt: at(11),
      actorUserId: desk.user.id,
      action: "CREATE",
      entityType: "patient",
      entityId: patientP1,
      summary: "Paciente cadastrado",
      changes: { fullName: { before: null, after: "Maria Souza" } },
    }),
    patientUpdate: await insertEvent({
      organizationId: orgA,
      occurredAt: at(10),
      actorUserId: admin.user.id,
      action: "UPDATE",
      entityType: "patient",
      entityId: patientP1,
      summary: "Paciente atualizado",
      ipAddress: "203.0.113.10",
      changes: {
        fullName: { before: "Maria Souza", after: "Maria Souza Lima" },
        phoneMobile: { before: "+5511988881111", after: "+5511977772222" },
      },
    }),
    noteUpdate: await insertEvent({
      organizationId: orgA,
      occurredAt: at(9),
      actorUserId: pro.user.id,
      action: "UPDATE",
      entityType: "clinical_note",
      entityId: noteN1,
      summary: "Registro clínico editado",
      changes: { content: { changed: true, beforeLength: 120, afterLength: 154 } },
    }),
    noteRead: await insertEvent({
      organizationId: orgA,
      occurredAt: at(8),
      actorUserId: pro.user.id,
      action: "READ_SENSITIVE",
      entityType: "clinical_note",
      entityId: noteN1,
      summary: "Registro clínico lido",
    }),
    loginFailed: await insertEvent({
      organizationId: orgA,
      occurredAt: at(7),
      actorType: "ANONYMOUS",
      actorUserId: null,
      action: "LOGIN_FAILED",
      entityType: "user",
      entityId: desk.user.id,
    }),
    denied: await insertEvent({
      organizationId: orgA,
      occurredAt: at(6),
      actorUserId: desk.user.id,
      action: "PERMISSION_DENIED",
      metadata: { permission: "audit:read", target: "/settings/audit" },
    }),
    chargeUpdate: await insertEvent({
      organizationId: orgA,
      occurredAt: at(5),
      actorUserId: manager.user.id,
      action: "UPDATE",
      entityType: "charge",
      entityId: chargeC1,
      summary: "Cobrança paga",
      changes: { status: { before: "OPEN", after: "PAID" } },
    }),
    secret: await insertEvent({
      organizationId: orgA,
      occurredAt: at(4),
      actorUserId: manager.user.id,
      action: "UPDATE",
      entityType: "user",
      entityId: manager.user.id,
      summary: "PIN de aprovação alterado",
      changes: { approvalPinHash: { before: "old-hash", after: "new-hash" } },
    }),
    system: await insertEvent({
      organizationId: orgA,
      occurredAt: at(3),
      actorType: "SYSTEM",
      action: "UPDATE",
      entityType: "cash_register",
      entityId: registerR1,
      summary: "Caixa fechado automaticamente",
      changes: { status: { before: "OPEN", after: "CLOSED" } },
    }),
    bruno: await insertEvent({
      organizationId: orgA,
      occurredAt: at(2),
      actorUserId: bruno.id,
      action: "CREATE",
      entityType: "appointment",
      entityId: apptA1,
      summary: "Agendamento criado",
    }),
    old: await insertEvent({
      organizationId: orgA,
      occurredAt: new Date(now - 400 * DAY),
      actorUserId: admin.user.id,
      action: "CREATE",
      entityType: "patient",
      entityId: patientP1,
      summary: "Paciente cadastrado",
    }),
  };

  const orgB = await createOrganization("Clínica Vizinha");
  const adminB = await contextOf(orgB, "ADMINISTRATOR", "Bia Admin");
  const evBUpdate = await insertEvent({
    organizationId: orgB,
    occurredAt: at(1),
    actorUserId: adminB.user.id,
    action: "UPDATE",
    entityType: "patient",
    entityId: newId(),
    summary: "Paciente atualizado",
    changes: { fullName: { before: "Outra", after: "Outra Pessoa" } },
  });
  // A sign-in failure of an unknown email has no organization and is never shown.
  const orphan = await insertEvent({
    organizationId: null,
    occurredAt: at(1),
    actorType: "ANONYMOUS",
    action: "LOGIN_FAILED",
  });

  return {
    orgA,
    orgB,
    admin,
    adminEn,
    manager,
    desk,
    pro,
    adminB,
    bruno,
    patientP1,
    noteN1,
    events,
    evBUpdate,
    orphan,
  };
}

export type AuditWorld = Awaited<ReturnType<typeof auditWorld>>;

// patient-anon (anonymized two days ago, code A1B2C3) and the audit-anon events.
export async function seedAnonymized(world: AuditWorld) {
  const now = Date.now();
  const patientAnon = await insertPatient(world.orgA, {
    fullName: "Paciente anonimizado #A1B2C3",
    mobilePhone: "",
    anonymizedCode: "A1B2C3",
    anonymizedAt: new Date(now - 2 * DAY),
  });
  const create = await insertEvent({
    organizationId: world.orgA,
    occurredAt: new Date(now - 10 * DAY - HOUR),
    actorUserId: world.desk.user.id,
    action: "CREATE",
    entityType: "patient",
    entityId: patientAnon,
    summary: "Paciente cadastrado",
    changes: {
      fullName: { before: null, after: "Joana Prado" },
      mobilePhone: { before: null, after: "+5511955550000" },
    },
  });
  const update = await insertEvent({
    organizationId: world.orgA,
    occurredAt: new Date(now - 10 * DAY),
    actorUserId: world.admin.user.id,
    action: "UPDATE",
    entityType: "patient",
    entityId: patientAnon,
    summary: "Cadastro do paciente alterado",
    ipAddress: "203.0.113.10",
    changes: {
      fullName: { before: "Joana Prado", after: "Joana Prado Lima" },
      mobilePhone: { before: "+5511955550000", after: "+5511944440000" },
      sex: { before: "NOT_INFORMED", after: "FEMALE" },
    },
  });
  const final = await insertEvent({
    organizationId: world.orgA,
    occurredAt: new Date(now - 2 * DAY),
    actorUserId: world.admin.user.id,
    action: "UPDATE",
    entityType: "patient",
    entityId: patientAnon,
    summary: "Paciente anonimizado",
    changes: { anonymized: { before: false, after: true }, active: { before: true, after: false } },
    metadata: { patientId: patientAnon, anonymizedCode: "A1B2C3" },
  });
  const lgpd = await insertEvent({
    organizationId: world.orgA,
    occurredAt: new Date(now - 2 * DAY + HOUR),
    actorUserId: world.admin.user.id,
    action: "UPDATE",
    entityType: "lgpd_request",
    entityId: newId(),
    summary: "Solicitação LGPD concluída",
    changes: { status: { before: "PROCESSING", after: "COMPLETED" } },
    metadata: { patientId: patientAnon },
  });
  return { patientAnon, events: { create, update, final, lgpd } };
}

// N events written in one statement, spread over [from, to) at distinct instants.
export async function seedEvents(input: {
  organizationId: string;
  count: number;
  from: Date;
  to: Date;
  action: string;
  actorUserId: string | null;
  entityType?: string | null;
}): Promise<void> {
  const step = (input.to.getTime() - input.from.getTime()) / (input.count + 1);
  await db().$executeRaw`
    INSERT INTO audit_event (id, occurred_at, organization_id, actor_type, actor_user_id, action, entity_type, summary)
    SELECT gen_random_uuid(), ${input.from}::timestamptz + make_interval(secs => g * ${step / 1000}::float8),
      ${input.organizationId}::uuid, CASE WHEN ${input.actorUserId}::uuid IS NULL THEN 'SYSTEM' ELSE 'USER' END,
      ${input.actorUserId}::uuid, ${input.action}, ${input.entityType ?? null}, NULL
    FROM generate_series(1, ${input.count}::int) AS g`;
}

// Monthly partitions for past months, created as the owner (spec F15 assumption 15), so a load test
// reads the same plan as production instead of the default partition.
export async function createPastPartitions(months: number): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  try {
    const now = new Date();
    for (let offset = -months; offset <= 0; offset++) {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
      const name = `audit_event_${from.getUTCFullYear()}_${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
      await pool.query(
        `CREATE TABLE IF NOT EXISTS audit_partitions.${name} PARTITION OF audit_event FOR VALUES FROM ('${from.toISOString().slice(0, 10)}') TO ('${to.toISOString().slice(0, 10)}')`,
      );
    }
  } finally {
    await pool.end();
  }
}

export async function readBody(body: AuditExport["body"]): Promise<string> {
  const reader = body.getReader();
  // ignoreBOM keeps the BOM, which is part of what the export must deliver.
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let text = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return text + decoder.decode();
    text += decoder.decode(chunk.value, { stream: true });
  }
}

export async function searchOrThrow(ctx: RequestContext, input: Record<string, unknown> = {}) {
  const result = await audit.searchEvents(ctx, input);
  if (!result.ok) throw new Error(`searchEvents failed: ${result.error.code}`);
  return result.value;
}

export async function detailOrThrow(ctx: RequestContext, eventId: string) {
  const result = await audit.getEvent(ctx, eventId);
  if (!result.ok) throw new Error(`getEvent failed: ${result.error.code}`);
  return result.value;
}

export async function exportOrThrow(ctx: RequestContext, input: Record<string, unknown> = {}) {
  const result = await audit.exportEvents(ctx, input);
  if (!result.ok) throw new Error(`exportEvents failed: ${result.error.code}`);
  return { ...result.value, text: await readBody(result.value.body) };
}

// Data lines of a CSV (after the BOM and the header).
export function csvLines(text: string): string[] {
  return text.slice(1).replace(/\r\n$/, "").split("\r\n");
}
