import { allToNull, cursorOfLast, textColumn } from "./shared";
import type { ColumnDef, Money, RawRow, ReportDefinition, Summary, Totals } from "./types";

type Row = {
  sort_at: Date;
  row_id: string;
  date: string;
  time: string;
  patient: string;
  service: string;
  professional: string;
  unit: string;
  room: string | null;
  status: string;
  price_minor: bigint;
  currency: string;
};
type TotalRow = { status: string; currency: string; total: number; price: bigint | null };

const COLUMNS: ColumnDef[] = [
  { key: "date", kind: "date", align: "left" },
  { key: "time", kind: "time", align: "left" },
  textColumn("patient"),
  textColumn("service"),
  textColumn("professional"),
  textColumn("unit"),
  textColumn("room"),
  { key: "status", kind: "stamp", align: "left", labelPrefix: "analytics.reports.values.status" },
  { key: "price", kind: "money", align: "right" },
];

// PRD F13 report 1: appointments by period, unit, professional, service and status. Assigned to
// the period by the start's local date in the unit's zone (spec F13 decision D11).
export const appointmentsReport: ReportDefinition = {
  id: "appointments",
  columns: COLUMNS,
  referencesService: true,
  referencesReason: false,

  async totals(uow, rc): Promise<Totals> {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const rows = await uow.tx.$queryRaw<TotalRow[]>`
      SELECT a.status, a.currency, count(*)::int AS total, sum(a.price_minor)::bigint AS price
      FROM appointment a
      JOIN unit u ON u.id = a.unit_id
      WHERE a.organization_id = ${organizationId}::uuid
        AND a.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
        AND (${service}::uuid IS NULL OR a.service_id = ${service}::uuid)
        AND (${rc.filters.status}::text = 'ALL' OR a.status = ${rc.filters.status})
        AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
        AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY a.status, a.currency`;
    const counts: Record<string, number> = {};
    const price = new Map<string, bigint>();
    let rowCount = 0;
    for (const row of rows) {
      rowCount += row.total;
      counts[row.status] = (counts[row.status] ?? 0) + row.total;
      price.set(row.currency, (price.get(row.currency) ?? 0n) + (row.price ?? 0n));
    }
    const money: Money[] = [...price].map(([currency, amountMinor]) => ({ currency, amountMinor }));
    return { rowCount, counts, money: { price: money.sort((a, b) => a.currency.localeCompare(b.currency)) } };
  },

  async summaries(): Promise<Summary[]> {
    return [];
  },

  async rows(uow, rc, { limit, offset = 0, after = null }) {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const afterAt = after?.at ?? null;
    const afterId = after?.id ?? null;
    const rows = await uow.tx.$queryRaw<Row[]>`
      SELECT a.starts_at AS sort_at, a.id AS row_id,
             to_char(a.starts_at AT TIME ZONE u.time_zone, 'YYYY-MM-DD') AS date,
             to_char(a.starts_at AT TIME ZONE u.time_zone, 'HH24:MI') AS time,
             coalesce(p.social_name, p.full_name) AS patient,
             s.name AS service,
             coalesce(pr.display_name, pr.full_name) AS professional,
             u.name AS unit, r.name AS room, a.status, a.price_minor, a.currency
      FROM appointment a
      JOIN unit u ON u.id = a.unit_id
      JOIN patient p ON p.id = a.patient_id
      JOIN service s ON s.id = a.service_id
      JOIN professional pr ON pr.id = a.professional_id
      LEFT JOIN room r ON r.id = a.room_id
      WHERE a.organization_id = ${organizationId}::uuid
        AND a.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
        AND (${service}::uuid IS NULL OR a.service_id = ${service}::uuid)
        AND (${rc.filters.status}::text = 'ALL' OR a.status = ${rc.filters.status})
        AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
        AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
        AND (${afterAt}::timestamptz IS NULL OR (a.starts_at, a.id) > (${afterAt}::timestamptz, ${afterId}::uuid))
      ORDER BY a.starts_at, a.id
      LIMIT ${limit} OFFSET ${offset}`;
    return {
      rows: rows.map((row): RawRow => ({
        date: row.date,
        time: row.time,
        patient: row.patient,
        service: row.service,
        professional: row.professional,
        unit: row.unit,
        room: row.room,
        status: row.status,
        price: { amountMinor: row.price_minor, currency: row.currency },
      })),
      cursor: cursorOfLast(rows),
    };
  },
};
