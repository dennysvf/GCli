import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { hash } from "@node-rs/argon2";
import { Pool, type PoolClient } from "pg";
import { e2eEnv } from "./env";

// F14 E2E fixtures (contract Prerequisites, spec assumption 12): the earlier journeys' clinic
// ("Unidade Centro", the services and the Administrator) receives, through SQL, the users,
// professionals, patients, requests, exports and stored files the F14 journeys read. Seeded once per
// run; every handle of the contract is returned by `f14Fixtures()`.

export const F14_PASSWORD = "senhaF14Segura2026";
export const F14_USERS = {
  admin: { email: "f14.admin@e2e.gcli", name: "Dra. Helena", role: "ADMINISTRATOR" },
  manager: { email: "f14.gestor@e2e.gcli", name: "Gestor F14", role: "MANAGER" },
  desk: { email: "f14.recepcao@e2e.gcli", name: "Recepção F14", role: "FRONT_DESK" },
  pro: { email: "f14.paula@e2e.gcli", name: "Dra. Paula", role: "PROFESSIONAL" },
} as const;

export const NOTE_TEXT = "Paciente relata melhora da dor lombar.";
export const ADDENDUM_TEXT = "Retorno em 30 dias.";
export const EXPORT_REASON = "Paciente pediu cópia dos dados em 14/10.";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type F14Fixtures = {
  organizationId: string;
  users: Record<keyof typeof F14_USERS, string>;
  professionals: { paula: string; helena: string };
  rich: {
    patientId: string;
    appointments: { history: string; helena: string; future: string };
    notes: { paula: string; helena: string };
    addendumId: string;
    chargeNumber: string;
    chargeId: string;
  };
  heavy: { patientId: string };
  requests: Record<string, string>;
  patients: Record<string, string>;
  exports: { expired: string; fresh: string };
  keys: { erasable: string; exportExpired: string; exportFresh: string };
};

const id = () => randomUUID();

function normalized(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// A valid CPF built from a random base, so the fixtures never collide with earlier journeys.
function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const length of [9, 10]) {
    const sum = digits
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const check = (sum * 10) % 11;
    digits.push(check === 10 ? 0 : check);
  }
  const text = digits.join("");
  return /^(\d)\1{10}$/.test(text) ? randomCpf() : text;
}

function storage() {
  const env = e2eEnv();
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  return {
    bucket: env.S3_BUCKET ?? "gcli-local",
    client,
    async put(key: string, body: Uint8Array | string, contentType = "application/pdf") {
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: typeof body === "string" ? Buffer.from(body) : body,
          ContentType: contentType,
        }),
      );
    },
  };
}

type Context = {
  db: PoolClient;
  org: string;
  unitId: string;
  roomId: string | null;
  serviceId: string;
  users: F14Fixtures["users"];
  professionals: F14Fixtures["professionals"];
  categories: { exam: string; personal: string; issued: string };
  templateId: string;
  termsId: string;
  store: ReturnType<typeof storage>;
  chargeCounter: { value: number };
};

async function one<T>(db: PoolClient, text: string, params: unknown[] = []): Promise<T> {
  const result = await db.query(text, params);
  const row = result.rows[0] as T | undefined;
  if (!row) throw new Error(`no row for: ${text}`);
  return row;
}

async function insertUser(db: PoolClient, org: string, user: (typeof F14_USERS)[keyof typeof F14_USERS]) {
  const userId = id();
  await db.query(
    `INSERT INTO app_user (id, organization_id, name, email, email_verified, role, status, locale)
     VALUES ($1, $2, $3, $4, true, $5, 'ACTIVE', 'pt-BR')`,
    [userId, org, user.name, user.email, user.role],
  );
  await db.query(
    `INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, 'credential', $3, $4)`,
    [id(), userId, userId, await hash(F14_PASSWORD)],
  );
  return userId;
}

async function insertProfessional(
  db: PoolClient,
  org: string,
  fullName: string,
  displayName: string,
  userId: string,
) {
  const professionalId = id();
  await db.query(
    `INSERT INTO professional (id, organization_id, full_name, display_name, has_no_council, color, linked_user_id)
     VALUES ($1, $2, $3, $4, true, 'teal', $5)`,
    [professionalId, org, fullName, displayName, userId],
  );
  return professionalId;
}

type PatientInput = {
  fullName: string;
  socialName?: string | null;
  cpf?: string | null;
  rg?: string | null;
  mobile?: string;
  secondary?: string | null;
  email?: string | null;
  address?: boolean;
  guardian?: boolean;
  observations?: string | null;
  createdAt?: Date;
};

async function insertPatient(ctx: Context, input: PatientInput): Promise<string> {
  const patientId = id();
  const mobile = input.mobile ?? "+5511988887777";
  await ctx.db.query(
    `INSERT INTO patient (id, organization_id, full_name, social_name, normalized_name, birth_date, sex,
       document_country, document_type, document_number, rg, mobile_phone, secondary_phone, phone_digits, email,
       address_country, postal_code, street, number, district, city, region, observations,
       guardian_name, guardian_relationship, guardian_phone, created_by_id, updated_by_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, '1985-03-02', 'MALE', $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $25, $26, $26)`,
    [
      patientId,
      ctx.org,
      input.fullName,
      input.socialName ?? null,
      normalized(input.fullName),
      input.cpf ? "BR" : null,
      input.cpf ? "CPF" : null,
      input.cpf ?? null,
      input.rg ?? null,
      mobile,
      input.secondary ?? null,
      [mobile, input.secondary]
        .filter(Boolean)
        .map((phone) => (phone ?? "").replace(/^\+55/, ""))
        .join(" "),
      input.email ?? null,
      input.address ? "BR" : null,
      input.address ? "01310100" : null,
      input.address ? "Avenida Paulista" : null,
      input.address ? "1000" : null,
      input.address ? "Bela Vista" : null,
      input.address ? "São Paulo" : null,
      input.address ? "SP" : null,
      input.observations ?? null,
      input.guardian ? "Carla Mendes" : null,
      input.guardian ? "MOTHER" : null,
      input.guardian ? "+5511977776666" : null,
      ctx.users.desk,
      input.createdAt ?? new Date(),
    ],
  );
  return patientId;
}

async function insertAppointment(
  ctx: Context,
  input: {
    patientId: string;
    professionalId: string;
    startsAt: Date;
    status: string;
    roomId?: string | null;
    history?: { status: string; at: Date; by: string }[];
    notes?: string | null;
  },
): Promise<string> {
  const appointmentId = id();
  const cancelled = input.status === "CANCELLED";
  const reasonId = cancelled
    ? (
        await one<{ id: string }>(
          ctx.db,
          `SELECT id FROM cancellation_reason WHERE organization_id = $1 LIMIT 1`,
          [ctx.org],
        )
      ).id
    : null;
  await ctx.db.query(
    `INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, room_id,
       starts_at, ends_at, duration_minutes, price_minor, currency, status, notes, created_by_id, updated_by_id,
       created_at, updated_at, cancellation_origin, cancellation_reason_id, cancelled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8::timestamptz + interval '30 minutes', 30, 25000, 'BRL', $9, $10,
       $11, $11, $12, $12, $13, $14, $15)`,
    [
      appointmentId,
      ctx.org,
      ctx.unitId,
      input.professionalId,
      ctx.serviceId,
      input.patientId,
      input.roomId ?? null,
      input.startsAt,
      input.status,
      input.notes ?? null,
      ctx.users.desk,
      new Date(input.startsAt.getTime() - 7 * DAY),
      cancelled ? "PATIENT" : null,
      reasonId,
      cancelled ? new Date(input.startsAt.getTime() - DAY) : null,
    ],
  );
  const history = input.history ?? [
    { status: "SCHEDULED", at: new Date(input.startsAt.getTime() - 7 * DAY), by: ctx.users.desk },
  ];
  let previous: string | null = null;
  for (const line of history) {
    await ctx.db.query(
      `INSERT INTO appointment_status_change (id, organization_id, appointment_id, from_status, to_status, changed_at, changed_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id(), ctx.org, appointmentId, previous, line.status, line.at, line.by],
    );
    previous = line.status;
  }
  return appointmentId;
}

async function insertNote(
  ctx: Context,
  input: {
    patientId: string;
    appointmentId: string | null;
    professionalId: string;
    authorId: string;
    text: string;
    at: Date;
  },
): Promise<string> {
  const noteId = id();
  await ctx.db.query(
    `INSERT INTO clinical_note (id, organization_id, patient_id, appointment_id, kind, professional_id, author_user_id,
       status, content_html, content_text, characters, draft_saved_at, locks_at, finalized_at, finalized_by_id,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'FINALIZED', $8, $9, $10, $11, $11::timestamptz + interval '24 hours', $11, $7,
       $11, $11)`,
    [
      noteId,
      ctx.org,
      input.patientId,
      input.appointmentId,
      input.appointmentId ? "ENCOUNTER" : "STANDALONE",
      input.professionalId,
      input.authorId,
      `<p>${input.text}</p>`,
      input.text,
      input.text.length,
      input.at,
    ],
  );
  return noteId;
}

async function insertDocument(
  ctx: Context,
  input: {
    patientId: string;
    title: string;
    kind?: "UPLOADED" | "GENERATED";
    clinical?: boolean;
    store?: boolean;
    at?: Date;
  },
): Promise<{ id: string; key: string }> {
  const documentId = id();
  const key = `org/${ctx.org}/documents/${id()}`;
  const generated = input.kind === "GENERATED";
  const category = input.clinical
    ? ctx.categories.exam
    : generated
      ? ctx.categories.issued
      : ctx.categories.personal;
  await ctx.db.query(
    `INSERT INTO patient_document (id, organization_id, patient_id, kind, category_id, title, is_clinical, status,
       file_name, source_content_type, source_object_key, object_key, content_type, size_bytes, stored_bytes,
       author_user_id, professional_id, unit_id, template_id, template_version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'READY', $8, 'application/pdf', $9, $9, 'application/pdf', 20, 20,
       $10, $11, $12, $13, $14, $15, $15)`,
    [
      documentId,
      ctx.org,
      input.patientId,
      generated ? "GENERATED" : "UPLOADED",
      category,
      input.title,
      input.clinical ?? false,
      `${normalized(input.title).replace(/\s+/g, "-")}.pdf`,
      key,
      ctx.users.desk,
      generated ? ctx.professionals.paula : null,
      generated ? ctx.unitId : null,
      generated ? ctx.templateId : null,
      generated ? 1 : null,
      input.at ?? new Date(),
    ],
  );
  if (input.store !== false) await ctx.store.put(key, `%PDF-1.4 ${input.title}`);
  return { id: documentId, key };
}

async function insertConsent(ctx: Context, patientId: string, options: { file?: boolean; at?: Date } = {}) {
  const consentId = id();
  const key = options.file ? `org/${ctx.org}/patients/${id()}` : null;
  if (key) await ctx.store.put(key, "%PDF-1.4 termo assinado");
  await ctx.db.query(
    `INSERT INTO consent_record (id, organization_id, patient_id, terms_version_id, consented_at, method, recorded_by_id,
       file_object_key, file_name, file_size)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      consentId,
      ctx.org,
      patientId,
      ctx.termsId,
      options.at ?? new Date(),
      key ? "PAPER_UPLOADED" : "VERBAL",
      ctx.users.desk,
      key,
      key ? "termo-assinado.pdf" : null,
      key ? 24 : null,
    ],
  );
  return consentId;
}

// A charge with an optional payment (and an optional partial refund of it).
async function insertCharge(
  ctx: Context,
  input: {
    patientId: string;
    appointmentId?: string | null;
    grossMinor: number;
    paidMinor?: number;
    refundMinor?: number;
    at?: Date;
  },
): Promise<{ id: string; number: string }> {
  const chargeId = id();
  ctx.chargeCounter.value += 1;
  const number = `F14-${String(ctx.chargeCounter.value).padStart(6, "0")}`;
  const paid = input.paidMinor ?? 0;
  const refund = input.refundMinor ?? 0;
  const net = input.grossMinor;
  const balance = paid - refund;
  const status = balance >= net ? "PAID" : balance > 0 ? "PARTIALLY_PAID" : "OPEN";
  const at = input.at ?? new Date();
  await ctx.db.query(
    `INSERT INTO charge (id, organization_id, number, patient_id, origin, appointment_id, service_id, description, unit_id,
       currency, gross_minor, net_minor, paid_minor, status, created_by_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'BRL', $10, $10, $11, $12, $13, $14, $14)`,
    [
      chargeId,
      ctx.org,
      number,
      input.patientId,
      input.appointmentId ? "APPOINTMENT" : "MANUAL",
      input.appointmentId ?? null,
      input.appointmentId ? ctx.serviceId : null,
      input.appointmentId ? null : "Avaliação",
      ctx.unitId,
      net,
      balance,
      status,
      ctx.users.desk,
      at,
    ],
  );
  if (paid > 0) {
    const paymentId = id();
    await ctx.db.query(
      `INSERT INTO payment_submission (organization_id, id, charge_id, user_id, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [ctx.org, paymentId, chargeId, ctx.users.desk, at],
    );
    await ctx.db.query(
      `INSERT INTO payment (id, organization_id, charge_id, kind, submission_id, method, amount_minor, refunded_minor,
         currency, unit_id, received_at, user_id)
       VALUES ($1, $2, $3, 'PAYMENT', $1, 'PIX', $4, $5, 'BRL', $6, $7, $8)`,
      [
        paymentId,
        ctx.org,
        chargeId,
        paid,
        refund,
        ctx.unitId,
        new Date(at.getTime() + 10 * 60_000),
        ctx.users.desk,
      ],
    );
    if (refund > 0) {
      await ctx.db.query(
        `INSERT INTO payment (id, organization_id, charge_id, kind, refunded_payment_id, method, amount_minor, currency,
           unit_id, received_at, user_id, reason)
         VALUES ($1, $2, $3, 'REFUND', $4, 'PIX', $5, 'BRL', $6, $7, $8, 'Desconto concedido depois')`,
        [
          id(),
          ctx.org,
          chargeId,
          paymentId,
          -refund,
          ctx.unitId,
          new Date(at.getTime() + DAY),
          ctx.users.admin,
        ],
      );
    }
  }
  return { id: chargeId, number };
}

async function insertRequest(
  ctx: Context,
  input: {
    patientId: string;
    type: "ACCESS" | "CORRECTION" | "ANONYMIZATION";
    description?: string;
    createdAt?: Date;
    completedAt?: Date;
  },
): Promise<string> {
  const requestId = id();
  await ctx.db.query(
    `INSERT INTO lgpd_request (id, organization_id, patient_id, type, requested_by, description, status, resolution,
       created_by_id, created_at, completed_at, completed_by_id, updated_at)
     VALUES ($1, $2, $3, $4, 'PATIENT', $5, $6, $7, $8, $9, $10, $11, $9)`,
    [
      requestId,
      ctx.org,
      input.patientId,
      input.type,
      input.description ?? EXPORT_REASON,
      input.completedAt ? "COMPLETED" : "PENDING",
      input.completedAt && input.type === "CORRECTION" ? "Telefone corrigido no cadastro." : null,
      ctx.users.admin,
      input.createdAt ?? new Date(),
      input.completedAt ?? null,
      input.completedAt ? ctx.users.admin : null,
    ],
  );
  return requestId;
}

async function insertReadyExport(
  ctx: Context,
  requestId: string,
  readyAt: Date,
): Promise<{ id: string; key: string }> {
  const exportId = id();
  const key = `org/${ctx.org}/privacy/${id()}.zip`;
  await ctx.store.put(key, randomBytes(64), "application/zip");
  await ctx.db.query(
    `INSERT INTO lgpd_export (id, organization_id, request_id, status, locale, object_key, size_bytes, file_count,
       requested_by_id, requested_at, ready_at, expires_at)
     VALUES ($1, $2, $3, 'READY', 'pt-BR', $4, 64, 2, $5, $6, $6, $6::timestamptz + interval '168 hours')`,
    [exportId, ctx.org, requestId, key, ctx.users.admin, readyAt],
  );
  return { id: exportId, key };
}

async function seed(db: PoolClient): Promise<F14Fixtures> {
  const org = (await one<{ id: string }>(db, `SELECT id FROM organization ORDER BY created_at LIMIT 1`)).id;
  // The earlier journeys' unit, room and service when they ran; otherwise the fixtures create them,
  // so the F14 journeys can also run on their own (contract persistent state "clinic-f14").
  const unit =
    ((
      await db.query(
        `SELECT id FROM unit WHERE organization_id = $1 AND currency = 'BRL'
         ORDER BY (name = 'Unidade Centro') DESC, created_at LIMIT 1`,
        [org],
      )
    ).rows[0] as { id: string } | undefined) ??
    (await one<{ id: string }>(
      db,
      `INSERT INTO unit (id, organization_id, name, country, currency, time_zone)
       VALUES ($1, $2, 'Unidade Centro', 'BR', 'BRL', 'America/Sao_Paulo') RETURNING id`,
      [id(), org],
    ));
  const room =
    ((
      await db.query(
        `SELECT id FROM room WHERE organization_id = $1 AND unit_id = $2 AND name = 'Sala 1' LIMIT 1`,
        [org, unit.id],
      )
    ).rows[0] as { id: string } | undefined) ??
    (await one<{ id: string }>(
      db,
      `INSERT INTO room (id, organization_id, unit_id, name) VALUES ($1, $2, $3, 'Sala 1') RETURNING id`,
      [id(), org, unit.id],
    ));
  let service = (
    await db.query(
      `SELECT id FROM service WHERE organization_id = $1 AND name ILIKE 'Consulta%' ORDER BY created_at LIMIT 1`,
      [org],
    )
  ).rows[0] as { id: string } | undefined;
  if (!service) {
    const categoryId = id();
    await db.query(
      `INSERT INTO service_category (id, organization_id, name, sort_order) VALUES ($1, $2, 'Consultas F14', 99)`,
      [categoryId, org],
    );
    for (const [name, minutes] of [
      ["Consulta", 30],
      ["Retorno", 30],
    ] as const) {
      const serviceId = id();
      await db.query(
        `INSERT INTO service (id, organization_id, category_id, name, duration_minutes, color) VALUES ($1, $2, $3, $4, $5, 'blue')`,
        [serviceId, org, categoryId, name, minutes],
      );
      await db.query(
        `INSERT INTO service_price (service_id, organization_id, currency, amount_minor) VALUES ($1, $2, 'BRL', 25000)`,
        [serviceId, org],
      );
      service ??= { id: serviceId };
    }
  }
  if (!service) throw new Error("no service");
  const reasons = await db.query(`SELECT 1 FROM cancellation_reason WHERE organization_id = $1 LIMIT 1`, [
    org,
  ]);
  if (reasons.rowCount === 0) {
    await db.query(
      `INSERT INTO cancellation_reason (id, organization_id, name, sort_order) VALUES ($1, $2, 'Imprevisto', 1)`,
      [id(), org],
    );
  }
  const users = {
    admin: await insertUser(db, org, F14_USERS.admin),
    manager: await insertUser(db, org, F14_USERS.manager),
    desk: await insertUser(db, org, F14_USERS.desk),
    pro: await insertUser(db, org, F14_USERS.pro),
  };
  const professionals = {
    paula: await insertProfessional(db, org, "Paula Andrade", "Dra. Paula", users.pro),
    helena: await insertProfessional(db, org, "Helena Prado", "Dra. Helena", users.admin),
  };
  // The 50,000 appointments of other patients belong to a professional of their own, so their
  // times never meet the fixtures above in the double-booking constraint.
  const volume = id();
  await db.query(
    `INSERT INTO professional (id, organization_id, full_name, display_name, has_no_council, color)
     VALUES ($1, $2, 'Profissional Volume F14', 'Prof. Volume', true, 'slate')`,
    [volume, org],
  );
  const category = async (name: string, clinical: boolean) => {
    const found = (
      await db.query(
        `SELECT id FROM document_category WHERE organization_id = $1 AND lower(name) = lower($2)`,
        [org, name],
      )
    ).rows[0] as { id: string } | undefined;
    if (found) return found.id;
    const categoryId = id();
    await db.query(
      `INSERT INTO document_category (id, organization_id, name, is_clinical) VALUES ($1, $2, $3, $4)`,
      [categoryId, org, name, clinical],
    );
    return categoryId;
  };
  const categories = {
    exam: await category("Exame F14", true),
    personal: await category("Documento pessoal", false),
    issued: await category("Documento emitido F14", false),
  };
  const templateId = id();
  await db.query(
    `INSERT INTO document_template (id, organization_id, name, type, body_html, body_text) VALUES ($1, $2, 'Atestado F14', 'CERTIFICATE', '<p>Atesto.</p>', 'Atesto.')`,
    [templateId, org],
  );
  const terms =
    ((
      await db.query(
        `SELECT id FROM privacy_terms_version WHERE organization_id = $1 ORDER BY version LIMIT 1`,
        [org],
      )
    ).rows[0] as { id: string } | undefined) ??
    (await one<{ id: string }>(
      db,
      `INSERT INTO privacy_terms_version (id, organization_id, version, text) VALUES ($1, $2, 1, 'Termos de privacidade.') RETURNING id`,
      [id(), org],
    ));
  const ctx: Context = {
    db,
    org,
    unitId: unit.id,
    roomId: room.id,
    serviceId: service.id,
    users,
    professionals,
    categories,
    templateId,
    termsId: terms.id,
    store: storage(),
    chargeCounter: { value: 0 },
  };
  const now = Date.now();
  const at = (days: number, hour = 13) => {
    const date = new Date(now + days * DAY);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
  };

  // patient-rich: "Lia Fernandes", registered 60 days ago, with every event type.
  const rich = await insertPatient(ctx, { fullName: "Lia Fernandes", createdAt: new Date(now - 60 * DAY) });
  await insertConsent(ctx, rich, { at: new Date(now - 59 * DAY) });
  const historyStart = at(-10);
  const history = await insertAppointment(ctx, {
    patientId: rich,
    professionalId: professionals.paula,
    startsAt: historyStart,
    status: "COMPLETED",
    roomId: ctx.roomId,
    history: [
      { status: "SCHEDULED", at: new Date(historyStart.getTime() - 5 * DAY), by: users.desk },
      { status: "CONFIRMED", at: new Date(historyStart.getTime() - DAY), by: users.desk },
      { status: "CHECKED_IN", at: new Date(historyStart.getTime() - 10 * 60_000), by: users.desk },
      { status: "IN_PROGRESS", at: new Date(historyStart.getTime() + 5 * 60_000), by: users.pro },
      { status: "COMPLETED", at: new Date(historyStart.getTime() + 30 * 60_000), by: users.pro },
    ],
  });
  const helena = await insertAppointment(ctx, {
    patientId: rich,
    professionalId: professionals.helena,
    startsAt: at(-12, 15),
    status: "COMPLETED",
  });
  const future = await insertAppointment(ctx, {
    patientId: rich,
    professionalId: professionals.paula,
    startsAt: at(7, 14),
    status: "SCHEDULED",
  });
  await insertAppointment(ctx, {
    patientId: rich,
    professionalId: professionals.paula,
    startsAt: at(-14, 12),
    status: "CANCELLED",
  });
  await insertAppointment(ctx, {
    patientId: rich,
    professionalId: professionals.paula,
    startsAt: at(-16, 12),
    status: "NO_SHOW",
  });
  const rescheduled = await insertAppointment(ctx, {
    patientId: rich,
    professionalId: professionals.paula,
    startsAt: at(-18, 12),
    status: "COMPLETED",
  });
  await db.query(
    `INSERT INTO appointment_reschedule (id, organization_id, appointment_id, previous_starts_at, previous_ends_at,
       previous_professional_id, previous_status, source, rescheduled_at, rescheduled_by_id)
     VALUES ($1, $2, $3, $4, $4::timestamptz + interval '30 minutes', $5, 'SCHEDULED', 'FORM', $6, $7)`,
    [id(), org, rescheduled, at(-19, 12), professionals.paula, at(-25, 12), users.desk],
  );
  // Enough past appointments for more than 110 events visible to the administrator.
  for (let index = 0; index < 110; index++) {
    await insertAppointment(ctx, {
      patientId: rich,
      professionalId: professionals.paula,
      startsAt: new Date(at(-20, 10).getTime() - (index * DAY) / 3),
      status: "COMPLETED",
    });
  }
  const notePaula = await insertNote(ctx, {
    patientId: rich,
    appointmentId: history,
    professionalId: professionals.paula,
    authorId: users.pro,
    text: NOTE_TEXT,
    at: new Date(historyStart.getTime() + 40 * 60_000),
  });
  const addendumId = id();
  await db.query(
    `INSERT INTO clinical_note_addendum (id, organization_id, note_id, author_user_id, professional_id, content_html,
       content_text, characters, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      addendumId,
      org,
      notePaula,
      users.pro,
      professionals.paula,
      `<p>${ADDENDUM_TEXT}</p>`,
      ADDENDUM_TEXT,
      ADDENDUM_TEXT.length,
      at(-9),
    ],
  );
  const noteHelena = await insertNote(ctx, {
    patientId: rich,
    appointmentId: helena,
    professionalId: professionals.helena,
    authorId: users.admin,
    text: "Avaliação inicial sem queixas.",
    at: at(-12, 16),
  });
  await insertDocument(ctx, { patientId: rich, title: "Exame de sangue", clinical: true, at: at(-11) });
  await insertDocument(ctx, { patientId: rich, title: "RG digitalizado", at: at(-30) });
  await insertDocument(ctx, { patientId: rich, title: "Atestado", kind: "GENERATED", at: at(-10, 16) });
  const richCharge = await insertCharge(ctx, {
    patientId: rich,
    appointmentId: history,
    grossMinor: 25_000,
    paidMinor: 25_000,
    refundMinor: 5_000,
    at: new Date(historyStart.getTime() - 9 * 60_000),
  });

  // patient-heavy: 10,000 events of every type, in an organization with 50,000 other appointments.
  const heavy = await insertPatient(ctx, {
    fullName: "Paciente Histórico Longo",
    createdAt: new Date(now - 900 * DAY),
  });
  const other = await insertPatient(ctx, {
    fullName: "Paciente Outros Agendamentos",
    createdAt: new Date(now - 900 * DAY),
  });
  await db.query(
    `INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, starts_at, ends_at,
       duration_minutes, price_minor, currency, status, created_by_id, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2, $3, $4, $5, $6::timestamptz - make_interval(hours => g),
       $6::timestamptz - make_interval(hours => g) + interval '30 minutes', 30, 12000, 'BRL', 'COMPLETED', $7, now(), now()
     FROM generate_series(1, 50000) AS g`,
    [org, unit.id, volume, service.id, other, new Date(now - 30 * DAY), users.desk],
  );
  await db.query(
    `INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, starts_at, ends_at,
       duration_minutes, price_minor, currency, status, created_by_id, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2, $3, $4, $5, $6::timestamptz - make_interval(hours => g),
       $6::timestamptz - make_interval(hours => g) + interval '30 minutes', 30, 12000, 'BRL', 'COMPLETED', $7, now(), now()
     FROM generate_series(1, 4000) AS g`,
    [org, unit.id, professionals.paula, service.id, heavy, new Date(now - 60 * DAY), users.desk],
  );
  await insertAppointment(ctx, {
    patientId: heavy,
    professionalId: professionals.helena,
    startsAt: at(-3, 18),
    status: "COMPLETED",
  });
  await db.query(
    `INSERT INTO appointment_status_change (id, organization_id, appointment_id, from_status, to_status, changed_at, changed_by_id)
     SELECT gen_random_uuid(), organization_id, id, NULL, 'SCHEDULED', created_at, $3
     FROM appointment WHERE organization_id = $1 AND patient_id = $2`,
    [org, heavy, users.desk],
  );
  await db.query(
    `INSERT INTO clinical_note (id, organization_id, patient_id, kind, professional_id, author_user_id, status,
       content_html, content_text, characters, draft_saved_at, locks_at, finalized_at, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2, 'STANDALONE', $3, $4, 'FINALIZED', '<p>Evolução.</p>', 'Evolução.', 9, t,
       t + interval '24 hours', t, t, t
     FROM (SELECT now() - make_interval(hours => g * 3) AS t FROM generate_series(1, 1500) AS g) AS times`,
    [org, heavy, professionals.paula, users.pro],
  );
  await db.query(
    `INSERT INTO clinical_note_addendum (id, organization_id, note_id, author_user_id, professional_id, content_html,
       content_text, characters, created_at)
     SELECT gen_random_uuid(), organization_id, id, author_user_id, professional_id, '<p>Adendo.</p>', 'Adendo.', 7,
       created_at + interval '1 hour'
     FROM clinical_note WHERE organization_id = $1 AND patient_id = $2 ORDER BY created_at DESC LIMIT 500`,
    [org, heavy],
  );
  await db.query(
    `INSERT INTO patient_document (id, organization_id, patient_id, kind, category_id, title, is_clinical, status,
       file_name, source_content_type, source_object_key, object_key, content_type, size_bytes, stored_bytes,
       author_user_id, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2, 'UPLOADED', $3, 'Documento ' || g, false, 'READY', 'documento.pdf',
       'application/pdf', 'org/x/documents/' || g, 'org/x/documents/' || g, 'application/pdf', 1000, 1000, $4,
       now() - make_interval(hours => g * 2), now()
     FROM generate_series(1, 1500) AS g`,
    [org, heavy, categories.personal, users.desk],
  );
  await db.query(
    `INSERT INTO charge (id, organization_id, number, patient_id, origin, description, unit_id, currency, gross_minor,
       net_minor, paid_minor, status, created_by_id, created_at, updated_at)
     SELECT gen_random_uuid(), $1, 'H-' || lpad(g::text, 6, '0'), $2, 'MANUAL', 'Produto', $3, 'BRL', 10000, 10000,
       10000, 'PAID', $4, now() - make_interval(hours => g * 5), now()
     FROM generate_series(1, 1250) AS g`,
    [org, heavy, unit.id, users.desk],
  );
  await db.query(
    `INSERT INTO payment_submission (organization_id, id, charge_id, user_id, created_at)
     SELECT organization_id, id, id, $3, created_at FROM charge WHERE organization_id = $1 AND patient_id = $2`,
    [org, heavy, users.desk],
  );
  await db.query(
    `INSERT INTO payment (id, organization_id, charge_id, kind, submission_id, method, amount_minor, currency, unit_id,
       received_at, user_id)
     SELECT gen_random_uuid(), organization_id, id, 'PAYMENT', id, 'PIX', 10000, 'BRL', unit_id,
       created_at + interval '10 minutes', $3
     FROM charge WHERE organization_id = $1 AND patient_id = $2`,
    [org, heavy, users.desk],
  );
  await db.query(
    `INSERT INTO consent_record (id, organization_id, patient_id, terms_version_id, consented_at, method, recorded_by_id)
     SELECT gen_random_uuid(), $1, $2, $3, now() - make_interval(days => g), 'VERBAL', $4
     FROM generate_series(1, 249) AS g`,
    [org, heavy, terms.id, users.desk],
  );

  // Requests of patient-rich for the register (contract UI-REQUESTS-02 and 05).
  const requests: Record<string, string> = {
    overdue: await insertRequest(ctx, {
      patientId: rich,
      type: "ACCESS",
      createdAt: new Date(now - 16 * DAY),
    }),
    day15: await insertRequest(ctx, {
      patientId: rich,
      type: "CORRECTION",
      createdAt: new Date(now - 15 * DAY),
    }),
    closedOld: await insertRequest(ctx, {
      patientId: rich,
      type: "CORRECTION",
      createdAt: new Date(now - 20 * DAY),
      completedAt: new Date(now - 18 * DAY),
    }),
    correction: await insertRequest(ctx, { patientId: rich, type: "CORRECTION" }),
  };

  // patient-export "Bruna Teixeira": 5 stored files (consent, attachment, clinical upload, upload, issued).
  const exportPatient = await insertPatient(ctx, {
    fullName: "Bruna Teixeira",
    cpf: randomCpf(),
    mobile: "+5511977771234",
    email: "bruna.teixeira@exemplo.com.br",
    address: true,
  });
  await insertConsent(ctx, exportPatient, { file: true });
  const brunaAppointment = await insertAppointment(ctx, {
    patientId: exportPatient,
    professionalId: professionals.helena,
    startsAt: at(-40, 13),
    status: "COMPLETED",
  });
  await insertAppointment(ctx, {
    patientId: exportPatient,
    professionalId: professionals.helena,
    startsAt: at(-41, 13),
    status: "COMPLETED",
  });
  const brunaNote = await insertNote(ctx, {
    patientId: exportPatient,
    appointmentId: brunaAppointment,
    professionalId: professionals.helena,
    authorId: users.admin,
    text: "Paciente relata melhora após a sessão.",
    at: at(-40, 14),
  });
  const attachmentKey = `org/${org}/clinical/${id()}`;
  await ctx.store.put(attachmentKey, "imagem do exame", "image/jpeg");
  await db.query(
    `INSERT INTO clinical_attachment (id, organization_id, note_id, uploaded_by_id, file_name, source_content_type,
       source_object_key, object_key, content_type, size_bytes, status)
     VALUES ($1, $2, $3, $4, 'raio-x.jpg', 'image/jpeg', $5, $5, 'image/jpeg', 15, 'READY')`,
    [id(), org, brunaNote, users.admin, attachmentKey],
  );
  await insertDocument(ctx, { patientId: exportPatient, title: "Exame de imagem", clinical: true });
  await insertDocument(ctx, { patientId: exportPatient, title: "RG digitalizado" });
  await insertDocument(ctx, { patientId: exportPatient, title: "Atestado", kind: "GENERATED" });
  await insertCharge(ctx, { patientId: exportPatient, grossMinor: 15_000, paidMinor: 15_000 });
  requests.export = await insertRequest(ctx, { patientId: exportPatient, type: "ACCESS" });

  // patient-export-500: 500 stored files sharing 20 objects (2.45 MB on average) and 500 appointments.
  const export500 = await insertPatient(ctx, { fullName: "Paciente Quinhentos Arquivos" });
  const sharedKeys: string[] = [];
  for (const [index, size] of [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 6, 20].entries()) {
    const key = `org/${org}/documents/f14-500-${index}`;
    await ctx.store.put(key, randomBytes(size * 1024 * 1024), "application/octet-stream");
    sharedKeys.push(key);
  }
  await db.query(
    `INSERT INTO patient_document (id, organization_id, patient_id, kind, category_id, title, is_clinical, status,
       file_name, source_content_type, source_object_key, object_key, content_type, size_bytes, stored_bytes,
       author_user_id, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2, 'UPLOADED', $3, 'Documento ' || g, false, 'READY', 'documento-' || g || '.bin',
       'application/octet-stream', ($4::text[])[1 + (g % 20)], ($4::text[])[1 + (g % 20)], 'application/octet-stream',
       1000, 1000, $5, now() - make_interval(hours => g), now()
     FROM generate_series(1, 500) AS g`,
    [org, export500, categories.personal, sharedKeys, users.desk],
  );
  await db.query(
    `INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, starts_at, ends_at,
       duration_minutes, price_minor, currency, status, created_by_id, created_at, updated_at)
     SELECT gen_random_uuid(), $1, $2, $3, $4, $5, $6::timestamptz - make_interval(hours => g),
       $6::timestamptz - make_interval(hours => g) + interval '30 minutes', 30, 12000, 'BRL', 'COMPLETED', $7, now(), now()
     FROM generate_series(1, 500) AS g`,
    [org, unit.id, professionals.helena, service.id, export500, new Date(now - 8000 * HOUR), users.desk],
  );
  requests.export500 = await insertRequest(ctx, { patientId: export500, type: "ACCESS" });

  // patient-export-broken: a document whose stored file does not exist.
  const broken = await insertPatient(ctx, { fullName: "Paciente Arquivo Perdido" });
  await insertDocument(ctx, { patientId: broken, title: "Arquivo perdido", store: false });
  requests.exportBroken = await insertRequest(ctx, { patientId: broken, type: "ACCESS" });

  // export-expired and export-fresh of a completed access request.
  requests.exportExpired = await insertRequest(ctx, {
    patientId: exportPatient,
    type: "ACCESS",
    createdAt: new Date(now - 9 * DAY),
    completedAt: new Date(now - 8 * DAY),
  });
  const expired = await insertReadyExport(ctx, requests.exportExpired, new Date(now - 8 * DAY));
  const fresh = await insertReadyExport(ctx, requests.exportExpired, new Date(now - DAY));

  // Anonymization patients.
  const eligible = async (fullName: string) => {
    const patientId = await insertPatient(ctx, {
      fullName,
      socialName: `${fullName.split(" ")[0]} C.`,
      cpf: randomCpf(),
      rg: "123456789",
      mobile: "+5511966665555",
      secondary: "+551133334444",
      email: `${normalized(fullName).replace(/\s+/g, ".")}@exemplo.com.br`,
      address: true,
      guardian: true,
      observations: "Prefere atendimento pela manhã.",
    });
    const appointmentId = await insertAppointment(ctx, {
      patientId,
      professionalId: professionals.paula,
      startsAt: new Date(now - (300 + Object.keys(requests).length) * DAY),
      status: "COMPLETED",
      notes: `Ligar para ${fullName}`,
    });
    await insertCharge(ctx, { patientId, appointmentId, grossMinor: 25_000, paidMinor: 25_000 });
    const upload = await insertDocument(ctx, { patientId, title: "RG digitalizado" });
    await insertDocument(ctx, { patientId, title: "Atestado", kind: "GENERATED" });
    await insertConsent(ctx, patientId);
    return { patientId, uploadKey: upload.key };
  };
  const anonOk = await eligible("Rafael Mendes Costa");
  requests.anonOk = await insertRequest(ctx, { patientId: anonOk.patientId, type: "ANONYMIZATION" });
  const anonName = await eligible("Helena Duarte Ramos");
  requests.anonName = await insertRequest(ctx, { patientId: anonName.patientId, type: "ANONYMIZATION" });
  const anonClinical = await insertPatient(ctx, { fullName: "Paciente Com Registro Clínico" });
  await insertNote(ctx, {
    patientId: anonClinical,
    appointmentId: null,
    professionalId: professionals.paula,
    authorId: users.pro,
    text: "Evolução clínica.",
    at: new Date(now - 30 * DAY),
  });
  requests.anonClinical = await insertRequest(ctx, { patientId: anonClinical, type: "ANONYMIZATION" });
  const anonClinicalDoc = await insertPatient(ctx, { fullName: "Paciente Com Documento Clínico" });
  await insertDocument(ctx, { patientId: anonClinicalDoc, title: "Laudo", clinical: true });
  requests.anonClinicalDoc = await insertRequest(ctx, { patientId: anonClinicalDoc, type: "ANONYMIZATION" });
  const anonFuture = await insertPatient(ctx, { fullName: "Paciente Com Agendamento Futuro" });
  await insertAppointment(ctx, {
    patientId: anonFuture,
    professionalId: professionals.paula,
    startsAt: at(3, 19),
    status: "SCHEDULED",
  });
  requests.anonFuture = await insertRequest(ctx, { patientId: anonFuture, type: "ANONYMIZATION" });
  const anonOpen = await insertPatient(ctx, { fullName: "Paciente Com Cobrança Aberta" });
  await insertCharge(ctx, { patientId: anonOpen, grossMinor: 8_000 });
  requests.anonOpen = await insertRequest(ctx, { patientId: anonOpen, type: "ANONYMIZATION" });

  return {
    organizationId: org,
    users,
    professionals,
    rich: {
      patientId: rich,
      appointments: { history, helena, future },
      notes: { paula: notePaula, helena: noteHelena },
      addendumId,
      chargeNumber: richCharge.number,
      chargeId: richCharge.id,
    },
    heavy: { patientId: heavy },
    requests,
    patients: {
      export: exportPatient,
      export500,
      broken,
      anonOk: anonOk.patientId,
      anonName: anonName.patientId,
      anonClinical,
      anonClinicalDoc,
      anonFuture,
      anonOpen,
    },
    exports: { expired: expired.id, fresh: fresh.id },
    keys: { erasable: anonOk.uploadKey, exportExpired: expired.key, exportFresh: fresh.key },
  };
}

// The handles of this run, next to the other Playwright outputs (the database is fresh each run).
const HANDLES = join(process.cwd(), "test-results", "f14-fixtures.json");

// Seeds once per E2E run; later calls (the second spec file) read the handles back after checking
// that they belong to this database.
export async function f14Fixtures(): Promise<F14Fixtures> {
  const pool = new Pool({ connectionString: e2eEnv().DATABASE_URL, max: 1 });
  const db = await pool.connect();
  try {
    const existing = await db.query(`SELECT id FROM app_user WHERE email = $1`, [F14_USERS.admin.email]);
    const adminId = (existing.rows[0] as { id: string } | undefined)?.id;
    if (adminId) {
      const stored = JSON.parse(await readFile(HANDLES, "utf8")) as F14Fixtures;
      if (stored.users.admin !== adminId) throw new Error("F14 fixture handles belong to another run");
      return stored;
    }
    await db.query("BEGIN");
    const fixtures = await seed(db);
    await db.query("COMMIT");
    await db.query("ANALYZE").catch(() => undefined);
    await mkdir(dirname(HANDLES), { recursive: true });
    await writeFile(HANDLES, JSON.stringify(fixtures, null, 2));
    return fixtures;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}
