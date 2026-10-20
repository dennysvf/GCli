import type { UnitOfWork } from "@/shared/db/transaction";
import { groupOf, type TimelineKind } from "../domain/timeline-event";
import type {
  AppointmentHistoryLine,
  TimelineItem,
  TimelineQuery,
  TimelineReader,
} from "../application/ports";

// The timeline is a read model over the source tables, never a copy (ADR-040). Raw SQL is not
// scoped by the tenant extension, so every query filters organization_id explicitly.
//
// A page is read in two steps: first the keys (kind, id, time) of one UNION ALL whose branches are
// each narrowed by the patient index, the allowed kinds, the window and the keyset cursor and cut
// to `limit` rows; then the details of the few rows of the page, by id. The heavy columns are never
// computed for rows that do not make the page. Note text is never selected.

// Sentinels that make "no cursor" and "no bound" plain comparisons the planner can use.
const NO_CURSOR_AT = "infinity";
const NO_CURSOR_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const NO_LOWER = "-infinity";
const NO_UPPER = "infinity";

type KeyRow = { kind: TimelineKind; id: string; occurred_at: Date };

function has(query: TimelineQuery, kind: TimelineKind): boolean {
  return query.kinds.includes(kind);
}

async function pageKeys(uow: UnitOfWork, query: TimelineQuery): Promise<KeyRow[]> {
  const org = query.organizationId;
  const patient = query.patientId;
  const lower = query.from ? query.from.toISOString() : NO_LOWER;
  const upper = query.to ? query.to.toISOString() : NO_UPPER;
  const cursorAt = query.cursor ? query.cursor.at.toISOString() : NO_CURSOR_AT;
  const cursorId = query.cursor ? query.cursor.id : NO_CURSOR_ID;
  const limit = query.limit;
  const own = query.ownProfessionalId;
  return uow.tx.$queryRaw<KeyRow[]>`
    SELECT kind, id, occurred_at FROM (
      (SELECT 'PATIENT_REGISTERED'::text AS kind, p.id, p.created_at AS occurred_at
       FROM patient p
       WHERE ${has(query, "PATIENT_REGISTERED")}::boolean
         AND p.organization_id = ${org}::uuid AND p.id = ${patient}::uuid
         AND p.created_at >= ${lower}::timestamptz AND p.created_at < ${upper}::timestamptz
         AND (p.created_at, p.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid))
      UNION ALL
      (SELECT 'CONSENT_RECORDED', c.id, c.consented_at
       FROM consent_record c
       WHERE ${has(query, "CONSENT_RECORDED")}::boolean
         AND c.organization_id = ${org}::uuid AND c.patient_id = ${patient}::uuid
         AND c.consented_at >= ${lower}::timestamptz AND c.consented_at < ${upper}::timestamptz
         AND (c.consented_at, c.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid)
       ORDER BY c.consented_at DESC, c.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'APPOINTMENT', a.id, a.starts_at
       FROM appointment a
       WHERE ${has(query, "APPOINTMENT")}::boolean
         AND a.organization_id = ${org}::uuid AND a.patient_id = ${patient}::uuid
         AND (${own}::uuid IS NULL OR a.professional_id = ${own}::uuid)
         AND a.starts_at >= ${lower}::timestamptz AND a.starts_at < ${upper}::timestamptz
         AND (a.starts_at, a.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid)
       ORDER BY a.starts_at DESC, a.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'CLINICAL_NOTE_FINALIZED', n.id, n.finalized_at
       FROM clinical_note n
       WHERE ${has(query, "CLINICAL_NOTE_FINALIZED")}::boolean
         AND n.organization_id = ${org}::uuid AND n.patient_id = ${patient}::uuid
         AND n.status = 'FINALIZED' AND n.finalized_at IS NOT NULL
         AND n.finalized_at >= ${lower}::timestamptz AND n.finalized_at < ${upper}::timestamptz
         AND (n.finalized_at, n.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid)
       ORDER BY n.finalized_at DESC, n.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'CLINICAL_ADDENDUM_ADDED', ad.id, ad.created_at
       FROM clinical_note_addendum ad
       JOIN clinical_note n ON n.id = ad.note_id AND n.organization_id = ad.organization_id
       WHERE ${has(query, "CLINICAL_ADDENDUM_ADDED")}::boolean
         AND ad.organization_id = ${org}::uuid AND n.patient_id = ${patient}::uuid
         AND ad.created_at >= ${lower}::timestamptz AND ad.created_at < ${upper}::timestamptz
         AND (ad.created_at, ad.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid)
       ORDER BY ad.created_at DESC, ad.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT CASE WHEN d.kind = 'GENERATED' THEN 'DOCUMENT_GENERATED' ELSE 'DOCUMENT_UPLOADED' END, d.id, d.created_at
       FROM patient_document d
       WHERE ((d.kind = 'UPLOADED' AND ${has(query, "DOCUMENT_UPLOADED")}::boolean)
              OR (d.kind = 'GENERATED' AND ${has(query, "DOCUMENT_GENERATED")}::boolean))
         AND d.organization_id = ${org}::uuid AND d.patient_id = ${patient}::uuid
         AND d.status <> 'FAILED'
         AND (${query.clinicalDocuments}::boolean OR NOT d.is_clinical)
         AND d.created_at >= ${lower}::timestamptz AND d.created_at < ${upper}::timestamptz
         AND (d.created_at, d.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid)
       ORDER BY d.created_at DESC, d.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT 'CHARGE_CREATED', ch.id, ch.created_at
       FROM charge ch
       WHERE ${has(query, "CHARGE_CREATED")}::boolean
         AND ch.organization_id = ${org}::uuid AND ch.patient_id = ${patient}::uuid
         AND ch.created_at >= ${lower}::timestamptz AND ch.created_at < ${upper}::timestamptz
         AND (ch.created_at, ch.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid)
       ORDER BY ch.created_at DESC, ch.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT CASE WHEN pm.kind = 'REFUND' THEN 'PAYMENT_REFUNDED' ELSE 'PAYMENT_RECEIVED' END, pm.id, pm.received_at
       FROM payment pm
       JOIN charge ch ON ch.id = pm.charge_id AND ch.organization_id = pm.organization_id
       WHERE ((pm.kind = 'REFUND' AND ${has(query, "PAYMENT_REFUNDED")}::boolean)
              OR (pm.kind <> 'REFUND' AND ${has(query, "PAYMENT_RECEIVED")}::boolean))
         AND pm.organization_id = ${org}::uuid AND ch.patient_id = ${patient}::uuid
         AND pm.received_at >= ${lower}::timestamptz AND pm.received_at < ${upper}::timestamptz
         AND (pm.received_at, pm.id) < (${cursorAt}::timestamptz, ${cursorId}::uuid)
       ORDER BY pm.received_at DESC, pm.id DESC LIMIT ${limit})
    ) events
    ORDER BY occurred_at DESC, id DESC
    LIMIT ${limit}`;
}

function idsOf(keys: KeyRow[], ...kinds: TimelineKind[]): string[] {
  return keys.filter((key) => kinds.includes(key.kind)).map((key) => key.id);
}

type RegisteredRow = { id: string; created_at: Date; author: string | null };
type ConsentRow = { id: string; consented_at: Date; method: string; version: number; author: string | null };
type AppointmentRow = {
  id: string;
  starts_at: Date;
  status: string;
  is_overbooking: boolean;
  service_name: string;
  professional_name: string;
  unit_name: string;
  time_zone: string;
  room_name: string | null;
  author: string | null;
  reschedules: number;
};
type HistoryRow = { appointment_id: string; to_status: string; changed_at: Date; author: string | null };
type NoteRow = {
  id: string;
  finalized_at: Date;
  auto_finalized: boolean;
  professional_name: string;
  service_name: string | null;
  addenda: number;
};
type AddendumRow = { id: string; note_id: string; created_at: Date; professional_name: string };
type DocumentRow = {
  id: string;
  kind: string;
  created_at: Date;
  title: string;
  is_clinical: boolean;
  archived: boolean;
  erased: boolean;
  category_name: string;
  author: string | null;
};
type ChargeRow = {
  id: string;
  created_at: Date;
  number: string;
  origin: string;
  net_minor: string;
  currency: string;
  status: string;
  time_zone: string;
  item: string | null;
  author: string | null;
};
type PaymentRow = {
  id: string;
  kind: string;
  received_at: Date;
  method: string;
  amount_minor: string;
  currency: string;
  number: string;
  time_zone: string;
  author: string | null;
};

const none = <T>(): Promise<T[]> => Promise.resolve([]);

async function details(uow: UnitOfWork, query: TimelineQuery, keys: KeyRow[]) {
  const org = query.organizationId;
  const registered = idsOf(keys, "PATIENT_REGISTERED");
  const consents = idsOf(keys, "CONSENT_RECORDED");
  const appointments = idsOf(keys, "APPOINTMENT");
  const notes = idsOf(keys, "CLINICAL_NOTE_FINALIZED");
  const addenda = idsOf(keys, "CLINICAL_ADDENDUM_ADDED");
  const documents = idsOf(keys, "DOCUMENT_UPLOADED", "DOCUMENT_GENERATED");
  const charges = idsOf(keys, "CHARGE_CREATED");
  const payments = idsOf(keys, "PAYMENT_RECEIVED", "PAYMENT_REFUNDED");
  // One transaction connection: the reads run one after the other.
  const registeredRows = registered.length
    ? await uow.tx.$queryRaw<RegisteredRow[]>`
        SELECT p.id, p.created_at, u.name AS author
        FROM patient p LEFT JOIN app_user u ON u.id = p.created_by_id
        WHERE p.organization_id = ${org}::uuid AND p.id = ANY(${registered}::uuid[])`
    : await none<RegisteredRow>();
  const consentRows = consents.length
    ? await uow.tx.$queryRaw<ConsentRow[]>`
        SELECT c.id, c.consented_at, c.method, t.version, u.name AS author
        FROM consent_record c
        JOIN privacy_terms_version t ON t.id = c.terms_version_id
        LEFT JOIN app_user u ON u.id = c.recorded_by_id
        WHERE c.organization_id = ${org}::uuid AND c.id = ANY(${consents}::uuid[])`
    : await none<ConsentRow>();
  const appointmentRows = appointments.length
    ? await uow.tx.$queryRaw<AppointmentRow[]>`
        SELECT a.id, a.starts_at, a.status, a.is_overbooking, s.name AS service_name,
               COALESCE(pr.display_name, pr.full_name) AS professional_name, un.name AS unit_name,
               un.time_zone, r.name AS room_name, u.name AS author,
               (SELECT count(*) FROM appointment_reschedule rs
                 WHERE rs.appointment_id = a.id AND rs.organization_id = a.organization_id)::int AS reschedules
        FROM appointment a
        JOIN service s ON s.id = a.service_id
        JOIN professional pr ON pr.id = a.professional_id
        JOIN unit un ON un.id = a.unit_id
        LEFT JOIN room r ON r.id = a.room_id
        LEFT JOIN app_user u ON u.id = a.created_by_id
        WHERE a.organization_id = ${org}::uuid AND a.id = ANY(${appointments}::uuid[])`
    : await none<AppointmentRow>();
  const historyRows = appointments.length
    ? await uow.tx.$queryRaw<HistoryRow[]>`
        SELECT sc.appointment_id, sc.to_status, sc.changed_at, u.name AS author
        FROM appointment_status_change sc
        LEFT JOIN app_user u ON u.id = sc.changed_by_id
        WHERE sc.organization_id = ${org}::uuid AND sc.appointment_id = ANY(${appointments}::uuid[])
        ORDER BY sc.changed_at, sc.id`
    : await none<HistoryRow>();
  const noteRows = notes.length
    ? await uow.tx.$queryRaw<NoteRow[]>`
        SELECT n.id, n.finalized_at, n.auto_finalized,
               COALESCE(pr.display_name, pr.full_name) AS professional_name, s.name AS service_name,
               (SELECT count(*) FROM clinical_note_addendum ad
                 WHERE ad.note_id = n.id AND ad.organization_id = n.organization_id)::int AS addenda
        FROM clinical_note n
        JOIN professional pr ON pr.id = n.professional_id
        LEFT JOIN appointment a ON a.id = n.appointment_id
        LEFT JOIN service s ON s.id = a.service_id
        WHERE n.organization_id = ${org}::uuid AND n.id = ANY(${notes}::uuid[])`
    : await none<NoteRow>();
  const addendumRows = addenda.length
    ? await uow.tx.$queryRaw<AddendumRow[]>`
        SELECT ad.id, ad.note_id, ad.created_at, COALESCE(pr.display_name, pr.full_name) AS professional_name
        FROM clinical_note_addendum ad
        JOIN professional pr ON pr.id = ad.professional_id
        WHERE ad.organization_id = ${org}::uuid AND ad.id = ANY(${addenda}::uuid[])`
    : await none<AddendumRow>();
  const documentRows = documents.length
    ? await uow.tx.$queryRaw<DocumentRow[]>`
        SELECT d.id, d.kind, d.created_at, d.title, d.is_clinical, d.archived_at IS NOT NULL AS archived,
               d.erased_at IS NOT NULL AS erased, cat.name AS category_name, u.name AS author
        FROM patient_document d
        JOIN document_category cat ON cat.id = d.category_id
        LEFT JOIN app_user u ON u.id = d.author_user_id
        WHERE d.organization_id = ${org}::uuid AND d.id = ANY(${documents}::uuid[])`
    : await none<DocumentRow>();
  const chargeRows = charges.length
    ? await uow.tx.$queryRaw<ChargeRow[]>`
        SELECT ch.id, ch.created_at, ch.number, ch.origin, ch.net_minor::text AS net_minor, ch.currency,
               ch.status, un.time_zone, COALESCE(s.name, ch.description) AS item, u.name AS author
        FROM charge ch
        JOIN unit un ON un.id = ch.unit_id
        LEFT JOIN service s ON s.id = ch.service_id
        LEFT JOIN app_user u ON u.id = ch.created_by_id
        WHERE ch.organization_id = ${org}::uuid AND ch.id = ANY(${charges}::uuid[])`
    : await none<ChargeRow>();
  const paymentRows = payments.length
    ? await uow.tx.$queryRaw<PaymentRow[]>`
        SELECT pm.id, pm.kind, pm.received_at, pm.method, pm.amount_minor::text AS amount_minor, pm.currency,
               ch.number, un.time_zone, u.name AS author
        FROM payment pm
        JOIN charge ch ON ch.id = pm.charge_id AND ch.organization_id = pm.organization_id
        JOIN unit un ON un.id = pm.unit_id
        LEFT JOIN app_user u ON u.id = pm.user_id
        WHERE pm.organization_id = ${org}::uuid AND pm.id = ANY(${payments}::uuid[])`
    : await none<PaymentRow>();
  return {
    registered: new Map(registeredRows.map((row) => [row.id, row])),
    consents: new Map(consentRows.map((row) => [row.id, row])),
    appointments: new Map(appointmentRows.map((row) => [row.id, row])),
    history: historyRows,
    notes: new Map(noteRows.map((row) => [row.id, row])),
    addenda: new Map(addendumRows.map((row) => [row.id, row])),
    documents: new Map(documentRows.map((row) => [row.id, row])),
    charges: new Map(chargeRows.map((row) => [row.id, row])),
    payments: new Map(paymentRows.map((row) => [row.id, row])),
  };
}

type Details = Awaited<ReturnType<typeof details>>;

function historyOf(rows: HistoryRow[]): Map<string, AppointmentHistoryLine[]> {
  const byAppointment = new Map<string, AppointmentHistoryLine[]>();
  for (const row of rows) {
    const lines = byAppointment.get(row.appointment_id) ?? [];
    lines.push({
      toStatus: row.to_status,
      changedAt: row.changed_at.toISOString(),
      changedByName: row.author,
    });
    byAppointment.set(row.appointment_id, lines);
  }
  return byAppointment;
}

function toItem(
  key: KeyRow,
  found: Details,
  history: Map<string, AppointmentHistoryLine[]>,
  organizationZone: string,
): TimelineItem | null {
  const base = {
    key: `${key.kind}:${key.id}`,
    group: groupOf(key.kind),
    occurredAt: key.occurred_at.toISOString(),
  };
  switch (key.kind) {
    case "PATIENT_REGISTERED": {
      const row = found.registered.get(key.id);
      return row ? { ...base, kind: key.kind, timeZone: organizationZone, authorName: row.author } : null;
    }
    case "CONSENT_RECORDED": {
      const row = found.consents.get(key.id);
      return row
        ? {
            ...base,
            kind: key.kind,
            timeZone: organizationZone,
            authorName: row.author,
            termsVersion: row.version,
            method: row.method,
          }
        : null;
    }
    case "APPOINTMENT": {
      const row = found.appointments.get(key.id);
      return row
        ? {
            ...base,
            kind: key.kind,
            timeZone: row.time_zone,
            authorName: row.author,
            appointmentId: row.id,
            status: row.status,
            serviceName: row.service_name,
            professionalName: row.professional_name,
            unitName: row.unit_name,
            roomName: row.room_name,
            isOverbooking: row.is_overbooking,
            rescheduleCount: row.reschedules,
            history: history.get(row.id) ?? [],
          }
        : null;
    }
    case "CLINICAL_NOTE_FINALIZED": {
      const row = found.notes.get(key.id);
      return row
        ? {
            ...base,
            kind: key.kind,
            timeZone: organizationZone,
            authorName: row.professional_name,
            noteId: row.id,
            professionalName: row.professional_name,
            serviceName: row.service_name,
            autoFinalized: row.auto_finalized,
            addendaCount: row.addenda,
          }
        : null;
    }
    case "CLINICAL_ADDENDUM_ADDED": {
      const row = found.addenda.get(key.id);
      return row
        ? {
            ...base,
            kind: key.kind,
            timeZone: organizationZone,
            authorName: row.professional_name,
            noteId: row.note_id,
            addendumId: row.id,
            professionalName: row.professional_name,
          }
        : null;
    }
    case "DOCUMENT_UPLOADED":
    case "DOCUMENT_GENERATED": {
      const row = found.documents.get(key.id);
      return row
        ? {
            ...base,
            kind: key.kind,
            timeZone: organizationZone,
            authorName: row.author,
            documentId: row.id,
            title: row.title,
            categoryName: row.category_name,
            clinical: row.is_clinical,
            archived: row.archived,
            erased: row.erased,
          }
        : null;
    }
    case "CHARGE_CREATED": {
      const row = found.charges.get(key.id);
      return row
        ? {
            ...base,
            kind: key.kind,
            timeZone: row.time_zone,
            authorName: row.author,
            chargeId: row.id,
            number: row.number,
            origin: row.origin,
            itemName: row.item,
            netMinor: row.net_minor,
            currency: row.currency,
            status: row.status,
          }
        : null;
    }
    case "PAYMENT_RECEIVED":
    case "PAYMENT_REFUNDED": {
      const row = found.payments.get(key.id);
      return row
        ? {
            ...base,
            kind: key.kind,
            timeZone: row.time_zone,
            authorName: row.author,
            paymentId: row.id,
            chargeNumber: row.number,
            method: row.method,
            amountMinor: row.amount_minor,
            currency: row.currency,
          }
        : null;
    }
  }
}

export const sqlTimelineReader: TimelineReader = {
  async page(uow, query) {
    if (query.kinds.length === 0) return [];
    const keys = await pageKeys(uow, query);
    if (keys.length === 0) return [];
    const found = await details(uow, query, keys);
    const history = historyOf(found.history);
    return keys
      .map((key) => toItem(key, found, history, query.organizationTimeZone))
      .filter((item): item is TimelineItem => item !== null);
  },

  async notePatientId(uow, organizationId, noteId) {
    const rows = await uow.tx.$queryRaw<{ patient_id: string }[]>`
      SELECT patient_id FROM clinical_note
      WHERE organization_id = ${organizationId}::uuid AND id = ${noteId}::uuid`;
    return rows[0]?.patient_id ?? null;
  },
};
