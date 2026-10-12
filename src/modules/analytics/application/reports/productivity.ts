import type { UnitOfWork } from "@/shared/db/transaction";
import { divideRounded } from "../../domain/kpis";
import { textColumn } from "./shared";
import type { ColumnDef, Money, RawRow, ReportContext, ReportDefinition, Summary, Totals } from "./types";

type Row = {
  professional: string;
  currency: string;
  completed: number;
  no_shows: number;
  cancelled: number;
  minutes: number;
  billed: bigint;
  received: bigint;
};

const COLUMNS: ColumnDef[] = [
  textColumn("professional"),
  { key: "completed", kind: "count", align: "right" },
  { key: "noShows", kind: "count", align: "right" },
  { key: "cancelled", kind: "count", align: "right" },
  { key: "hoursAttended", kind: "hours", align: "right" },
  { key: "billed", kind: "money", align: "right" },
  { key: "received", kind: "money", align: "right" },
  { key: "averageTicket", kind: "money", align: "right" },
];

// One row per professional and currency (spec F13 decision D10). The three aggregates follow the
// dashboard rules: appointments by start, charges by creation, payments by receipt, each in the
// local date of the unit.
async function fetchRows(uow: UnitOfWork, rc: ReportContext): Promise<Row[]> {
  const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
  return uow.tx.$queryRaw<Row[]>`
    WITH appts AS (
      SELECT a.professional_id, a.currency,
             (count(*) FILTER (WHERE a.status = 'COMPLETED'))::int AS completed,
             (count(*) FILTER (WHERE a.status = 'NO_SHOW'))::int AS no_shows,
             (count(*) FILTER (WHERE a.status = 'CANCELLED'))::int AS cancelled,
             coalesce(sum(a.duration_minutes) FILTER (WHERE a.status = 'COMPLETED'), 0)::int AS minutes
      FROM appointment a
      JOIN unit u ON u.id = a.unit_id
      WHERE a.organization_id = ${organizationId}::uuid
        AND a.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
        AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
        AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY a.professional_id, a.currency
    ), billed AS (
      SELECT c.professional_id, c.currency, sum(c.net_minor)::bigint AS amount
      FROM charge c
      JOIN unit u ON u.id = c.unit_id
      WHERE c.organization_id = ${organizationId}::uuid
        AND c.unit_id = ANY(${unitIds}::uuid[])
        AND c.professional_id IS NOT NULL
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND c.status <> 'CANCELLED'
        AND c.created_at >= ${windowStart} AND c.created_at < ${windowEnd}
        AND (c.created_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY c.professional_id, c.currency
    ), received AS (
      SELECT c.professional_id, p.currency, sum(p.amount_minor)::bigint AS amount
      FROM payment p
      JOIN unit u ON u.id = p.unit_id
      JOIN charge c ON c.id = p.charge_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.unit_id = ANY(${unitIds}::uuid[])
        AND c.professional_id IS NOT NULL
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND p.received_at >= ${windowStart} AND p.received_at < ${windowEnd}
        AND (p.received_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY c.professional_id, p.currency
    ), keys AS (
      SELECT professional_id, currency FROM appts
      UNION SELECT professional_id, currency FROM billed
      UNION SELECT professional_id, currency FROM received
    )
    SELECT coalesce(pr.display_name, pr.full_name) AS professional, k.currency,
           coalesce(ap.completed, 0)::int AS completed, coalesce(ap.no_shows, 0)::int AS no_shows,
           coalesce(ap.cancelled, 0)::int AS cancelled, coalesce(ap.minutes, 0)::int AS minutes,
           coalesce(b.amount, 0)::bigint AS billed, coalesce(r.amount, 0)::bigint AS received
    FROM keys k
    JOIN professional pr ON pr.id = k.professional_id
    LEFT JOIN appts ap ON ap.professional_id = k.professional_id AND ap.currency = k.currency
    LEFT JOIN billed b ON b.professional_id = k.professional_id AND b.currency = k.currency
    LEFT JOIN received r ON r.professional_id = k.professional_id AND r.currency = k.currency
    ORDER BY 1, k.currency`;
}

const byCurrency = (a: Money, b: Money) => a.currency.localeCompare(b.currency);

// PRD F13 report 5: production per professional. The report is one small table, so it is read at
// once; the keyset cursor is never needed.
export const productivityReport: ReportDefinition = {
  id: "productivity",
  columns: COLUMNS,
  referencesService: false,
  referencesReason: false,

  async totals(uow, rc): Promise<Totals> {
    const rows = await fetchRows(uow, rc);
    const billed = new Map<string, bigint>();
    const received = new Map<string, bigint>();
    const counts = { completed: 0, noShows: 0, cancelled: 0 };
    for (const row of rows) {
      counts.completed += row.completed;
      counts.noShows += row.no_shows;
      counts.cancelled += row.cancelled;
      billed.set(row.currency, (billed.get(row.currency) ?? 0n) + row.billed);
      received.set(row.currency, (received.get(row.currency) ?? 0n) + row.received);
    }
    const list = (values: Map<string, bigint>): Money[] =>
      [...values].map(([currency, amountMinor]) => ({ currency, amountMinor })).sort(byCurrency);
    return { rowCount: rows.length, counts, money: { billed: list(billed), received: list(received) } };
  },

  async summaries(): Promise<Summary[]> {
    return [];
  },

  async rows(uow, rc, { limit, offset = 0, after = null }) {
    if (after) return { rows: [], cursor: null };
    const rows = await fetchRows(uow, rc);
    return {
      rows: rows.slice(offset, offset + limit).map((row): RawRow => ({
        professional: row.professional,
        completed: row.completed,
        noShows: row.no_shows,
        cancelled: row.cancelled,
        hoursAttended: Math.round((row.minutes / 60) * 10) / 10,
        billed: { amountMinor: row.billed, currency: row.currency },
        received: { amountMinor: row.received, currency: row.currency },
        averageTicket:
          row.completed > 0
            ? { amountMinor: divideRounded(row.received, BigInt(row.completed)), currency: row.currency }
            : null,
      })),
      cursor: null,
    };
  },
};
