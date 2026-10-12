import { leadTimeHours } from "../../domain/lead-time";
import { allToNull, cursorOfLast, phoneOf, textColumn } from "./shared";
import type { ColumnDef, RawRow, ReportDefinition, Summary, Totals } from "./types";

type Row = {
  sort_at: Date;
  row_id: string;
  unit_id: string;
  starts_at: Date;
  cancelled_at: Date | null;
  date: string;
  patient: string;
  phone: string | null;
  service: string;
  professional: string;
  status: string;
  origin: string | null;
  reason: string | null;
};

const COLUMNS: ColumnDef[] = [
  { key: "date", kind: "date", align: "left" },
  textColumn("patient"),
  textColumn("phone"),
  textColumn("service"),
  textColumn("professional"),
  { key: "type", kind: "stamp", align: "left", labelPrefix: "analytics.reports.values.status" },
  { key: "origin", kind: "label", align: "left", labelPrefix: "analytics.reports.values.cancellationOrigin" },
  textColumn("reason"),
  { key: "leadTimeHours", kind: "count", align: "right" },
];

// PRD F13 report 2: cancellations and no-shows. The note typed with a cancellation is free text
// that may hold personal data, so it is never selected (spec F13, assumption 6).
export const cancellationsReport: ReportDefinition = {
  id: "cancellations",
  columns: COLUMNS,
  referencesService: true,
  referencesReason: true,

  async totals(uow, rc): Promise<Totals> {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const reason = allToNull(rc.filters.reason);
    const rows = await uow.tx.$queryRaw<{ status: string; total: number }[]>`
      SELECT a.status, count(*)::int AS total
      FROM appointment a
      JOIN unit u ON u.id = a.unit_id
      WHERE a.organization_id = ${organizationId}::uuid
        AND a.unit_id = ANY(${unitIds}::uuid[])
        AND a.status IN ('CANCELLED', 'NO_SHOW')
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
        AND (${service}::uuid IS NULL OR a.service_id = ${service}::uuid)
        AND (${rc.filters.type}::text = 'ALL' OR a.status = ${rc.filters.type})
        AND (${rc.filters.origin}::text = 'ALL' OR a.cancellation_origin = ${rc.filters.origin})
        AND (${reason}::uuid IS NULL OR a.cancellation_reason_id = ${reason}::uuid)
        AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
        AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY a.status`;
    const counts: Record<string, number> = { CANCELLED: 0, NO_SHOW: 0 };
    let rowCount = 0;
    for (const row of rows) {
      counts[row.status] = row.total;
      rowCount += row.total;
    }
    return { rowCount, counts, money: {} };
  },

  async summaries(uow, rc): Promise<Summary[]> {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const reason = allToNull(rc.filters.reason);
    const [byReason, byProfessional] = await Promise.all([
      uow.tx.$queryRaw<{ reason: string | null; total: number }[]>`
        SELECT cr.name AS reason, count(*)::int AS total
        FROM appointment a
        JOIN unit u ON u.id = a.unit_id
        LEFT JOIN cancellation_reason cr ON cr.id = a.cancellation_reason_id
        WHERE a.organization_id = ${organizationId}::uuid
          AND a.unit_id = ANY(${unitIds}::uuid[])
          AND a.status = 'CANCELLED'
          AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
          AND (${service}::uuid IS NULL OR a.service_id = ${service}::uuid)
          AND ${rc.filters.type}::text IN ('ALL', 'CANCELLED')
          AND (${rc.filters.origin}::text = 'ALL' OR a.cancellation_origin = ${rc.filters.origin})
          AND (${reason}::uuid IS NULL OR a.cancellation_reason_id = ${reason}::uuid)
          AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
          AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
        GROUP BY cr.name
        ORDER BY count(*) DESC, cr.name`,
      uow.tx.$queryRaw<{ professional: string; cancelled: number; no_shows: number }[]>`
        SELECT coalesce(pr.display_name, pr.full_name) AS professional,
               (count(*) FILTER (WHERE a.status = 'CANCELLED'))::int AS cancelled,
               (count(*) FILTER (WHERE a.status = 'NO_SHOW'))::int AS no_shows
        FROM appointment a
        JOIN unit u ON u.id = a.unit_id
        JOIN professional pr ON pr.id = a.professional_id
        WHERE a.organization_id = ${organizationId}::uuid
          AND a.unit_id = ANY(${unitIds}::uuid[])
          AND a.status IN ('CANCELLED', 'NO_SHOW')
          AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
          AND (${service}::uuid IS NULL OR a.service_id = ${service}::uuid)
          AND (${rc.filters.type}::text = 'ALL' OR a.status = ${rc.filters.type})
          AND (${rc.filters.origin}::text = 'ALL' OR a.cancellation_origin = ${rc.filters.origin})
          AND (${reason}::uuid IS NULL OR a.cancellation_reason_id = ${reason}::uuid)
          AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
          AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
        GROUP BY pr.id, pr.display_name, pr.full_name
        ORDER BY 1`,
    ]);
    return [
      {
        key: "byReason",
        columns: [
          textColumn("reason", "analytics.reports.noReason"),
          { key: "count", kind: "count", align: "right" },
        ],
        rows: byReason.map((row) => ({ reason: row.reason, count: row.total })),
      },
      {
        key: "byProfessional",
        columns: [
          textColumn("professional"),
          { key: "cancelled", kind: "count", align: "right" },
          { key: "noShows", kind: "count", align: "right" },
        ],
        rows: byProfessional.map((row) => ({
          professional: row.professional,
          cancelled: row.cancelled,
          noShows: row.no_shows,
        })),
      },
    ];
  },

  async rows(uow, rc, { limit, offset = 0, after = null }) {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const reason = allToNull(rc.filters.reason);
    const afterAt = after?.at ?? null;
    const afterId = after?.id ?? null;
    const rows = await uow.tx.$queryRaw<Row[]>`
      SELECT a.starts_at AS sort_at, a.id AS row_id, a.unit_id, a.starts_at, a.cancelled_at,
             to_char(a.starts_at AT TIME ZONE u.time_zone, 'YYYY-MM-DD') AS date,
             coalesce(p.social_name, p.full_name) AS patient, p.mobile_phone AS phone,
             s.name AS service, coalesce(pr.display_name, pr.full_name) AS professional,
             a.status, a.cancellation_origin AS origin, cr.name AS reason
      FROM appointment a
      JOIN unit u ON u.id = a.unit_id
      JOIN patient p ON p.id = a.patient_id
      JOIN service s ON s.id = a.service_id
      JOIN professional pr ON pr.id = a.professional_id
      LEFT JOIN cancellation_reason cr ON cr.id = a.cancellation_reason_id
      WHERE a.organization_id = ${organizationId}::uuid
        AND a.unit_id = ANY(${unitIds}::uuid[])
        AND a.status IN ('CANCELLED', 'NO_SHOW')
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
        AND (${service}::uuid IS NULL OR a.service_id = ${service}::uuid)
        AND (${rc.filters.type}::text = 'ALL' OR a.status = ${rc.filters.type})
        AND (${rc.filters.origin}::text = 'ALL' OR a.cancellation_origin = ${rc.filters.origin})
        AND (${reason}::uuid IS NULL OR a.cancellation_reason_id = ${reason}::uuid)
        AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
        AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
        AND (${afterAt}::timestamptz IS NULL OR (a.starts_at, a.id) > (${afterAt}::timestamptz, ${afterId}::uuid))
      ORDER BY a.starts_at, a.id
      LIMIT ${limit} OFFSET ${offset}`;
    return {
      rows: rows.map((row): RawRow => ({
        date: row.date,
        patient: row.patient,
        phone: phoneOf(rc, row.unit_id, row.phone),
        service: row.service,
        professional: row.professional,
        type: row.status,
        origin: row.status === "CANCELLED" ? row.origin : null,
        reason: row.status === "CANCELLED" ? row.reason : null,
        leadTimeHours:
          row.status === "CANCELLED" && row.cancelled_at
            ? leadTimeHours(row.cancelled_at, row.starts_at)
            : null,
      })),
      cursor: cursorOfLast(rows),
    };
  },
};
