import { agingBucket } from "../../domain/aging";
import { AGING_BUCKETS } from "../../domain/limits";
import type { UnitOfWork } from "@/shared/db/transaction";
import { cursorOfLast, phoneOf, textColumn } from "./shared";
import type { ColumnDef, Money, RawRow, ReportContext, ReportDefinition, Summary, Totals } from "./types";

type Row = {
  sort_at: Date;
  row_id: string;
  unit_id: string;
  date: string;
  patient: string;
  phone: string | null;
  charge_number: string;
  origin: string;
  net_minor: bigint;
  balance_minor: bigint;
  currency: string;
  days: number;
};
type DaysRow = { days: number; currency: string; total: number; net: bigint | null; balance: bigint | null };

const COLUMNS: ColumnDef[] = [
  textColumn("patient"),
  textColumn("phone"),
  textColumn("chargeNumber"),
  { key: "origin", kind: "label", align: "left", labelPrefix: "analytics.reports.values.chargeOrigin" },
  { key: "issuedOn", kind: "date", align: "left" },
  { key: "amount", kind: "money", align: "right" },
  { key: "balance", kind: "money", align: "right" },
  { key: "daysOpen", kind: "count", align: "right" },
  { key: "bucket", kind: "label", align: "left", labelPrefix: "analytics.reports.values.bucket" },
];

// Bounds of the bucket filter; null when every bucket is listed.
function bucketBounds(bucket: string): { lo: number | null; hi: number | null } {
  const found = AGING_BUCKETS.find((entry) => entry.id === bucket);
  return found ? { lo: found.from, hi: found.to } : { lo: null, hi: null };
}

// Charges that are still open: awaiting approval, open or partially paid (spec F13, assumption 4).
async function groupedByDays(uow: UnitOfWork, rc: ReportContext): Promise<DaysRow[]> {
  const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
  const origin = rc.filters.origin;
  const { lo, hi } = bucketBounds(rc.filters.bucket);
  return uow.tx.$queryRaw<DaysRow[]>`
    SELECT d.days, c.currency, count(*)::int AS total,
           sum(c.net_minor)::bigint AS net, sum(c.net_minor - c.paid_minor)::bigint AS balance
    FROM charge c
    JOIN unit u ON u.id = c.unit_id
    CROSS JOIN LATERAL (
      SELECT greatest(0, (${rc.now}::timestamptz AT TIME ZONE u.time_zone)::date
                         - (c.created_at AT TIME ZONE u.time_zone)::date)::int AS days) d
    WHERE c.organization_id = ${organizationId}::uuid
      AND c.unit_id = ANY(${unitIds}::uuid[])
      AND c.status IN ('PENDING_APPROVAL', 'OPEN', 'PARTIALLY_PAID')
      AND c.net_minor - c.paid_minor > 0
      AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
      AND (${origin}::text = 'ALL' OR c.origin = ${origin})
      AND (${lo}::int IS NULL OR (d.days >= ${lo}::int AND (${hi}::int IS NULL OR d.days <= ${hi}::int)))
      AND c.created_at >= ${windowStart} AND c.created_at < ${windowEnd}
      AND (c.created_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
    GROUP BY d.days, c.currency`;
}

const byCurrency = (a: Money, b: Money) => a.currency.localeCompare(b.currency);

// PRD F13 report 4: open charges with aging buckets by days open (spec F13 decision D2).
export const receivablesReport: ReportDefinition = {
  id: "receivables",
  columns: COLUMNS,
  referencesService: false,
  referencesReason: false,

  async totals(uow, rc): Promise<Totals> {
    const rows = await groupedByDays(uow, rc);
    const counts: Record<string, number> = {};
    const amount = new Map<string, bigint>();
    const balance = new Map<string, bigint>();
    let rowCount = 0;
    for (const row of rows) {
      rowCount += row.total;
      const bucket = agingBucket(row.days);
      counts[bucket] = (counts[bucket] ?? 0) + row.total;
      amount.set(row.currency, (amount.get(row.currency) ?? 0n) + (row.net ?? 0n));
      balance.set(row.currency, (balance.get(row.currency) ?? 0n) + (row.balance ?? 0n));
    }
    const list = (values: Map<string, bigint>): Money[] =>
      [...values].map(([currency, amountMinor]) => ({ currency, amountMinor })).sort(byCurrency);
    return { rowCount, counts, money: { amount: list(amount), balance: list(balance) } };
  },

  async summaries(uow, rc): Promise<Summary[]> {
    const rows = await groupedByDays(uow, rc);
    const perBucket = new Map<string, { total: number; balance: Map<string, bigint> }>();
    for (const row of rows) {
      const bucket = agingBucket(row.days);
      const entry = perBucket.get(bucket) ?? { total: 0, balance: new Map<string, bigint>() };
      entry.total += row.total;
      entry.balance.set(row.currency, (entry.balance.get(row.currency) ?? 0n) + (row.balance ?? 0n));
      perBucket.set(bucket, entry);
    }
    const summaryRows: RawRow[] = [];
    for (const bucket of AGING_BUCKETS) {
      const entry = perBucket.get(bucket.id);
      if (!entry) continue;
      for (const [currency, amountMinor] of [...entry.balance].sort(([a], [b]) => a.localeCompare(b))) {
        summaryRows.push({ bucket: bucket.id, count: entry.total, balance: { amountMinor, currency } });
      }
    }
    return [
      {
        key: "byBucket",
        columns: [
          { key: "bucket", kind: "label", align: "left", labelPrefix: "analytics.reports.values.bucket" },
          { key: "count", kind: "count", align: "right" },
          { key: "balance", kind: "money", align: "right" },
        ],
        rows: summaryRows,
      },
    ];
  },

  async rows(uow, rc, { limit, offset = 0, after = null }) {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const origin = rc.filters.origin;
    const { lo, hi } = bucketBounds(rc.filters.bucket);
    const afterAt = after?.at ?? null;
    const afterId = after?.id ?? null;
    const rows = await uow.tx.$queryRaw<Row[]>`
      SELECT c.created_at AS sort_at, c.id AS row_id, c.unit_id,
             to_char(c.created_at AT TIME ZONE u.time_zone, 'YYYY-MM-DD') AS date,
             coalesce(pt.social_name, pt.full_name) AS patient, pt.mobile_phone AS phone,
             c.number AS charge_number, c.origin, c.net_minor,
             (c.net_minor - c.paid_minor) AS balance_minor, c.currency, d.days
      FROM charge c
      JOIN unit u ON u.id = c.unit_id
      JOIN patient pt ON pt.id = c.patient_id
      CROSS JOIN LATERAL (
        SELECT greatest(0, (${rc.now}::timestamptz AT TIME ZONE u.time_zone)::date
                           - (c.created_at AT TIME ZONE u.time_zone)::date)::int AS days) d
      WHERE c.organization_id = ${organizationId}::uuid
        AND c.unit_id = ANY(${unitIds}::uuid[])
        AND c.status IN ('PENDING_APPROVAL', 'OPEN', 'PARTIALLY_PAID')
        AND c.net_minor - c.paid_minor > 0
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND (${origin}::text = 'ALL' OR c.origin = ${origin})
        AND (${lo}::int IS NULL OR (d.days >= ${lo}::int AND (${hi}::int IS NULL OR d.days <= ${hi}::int)))
        AND c.created_at >= ${windowStart} AND c.created_at < ${windowEnd}
        AND (c.created_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
        AND (${afterAt}::timestamptz IS NULL OR (c.created_at, c.id) > (${afterAt}::timestamptz, ${afterId}::uuid))
      ORDER BY c.created_at, c.id
      LIMIT ${limit} OFFSET ${offset}`;
    return {
      rows: rows.map((row): RawRow => ({
        patient: row.patient,
        phone: phoneOf(rc, row.unit_id, row.phone),
        chargeNumber: row.charge_number,
        origin: row.origin,
        issuedOn: row.date,
        amount: { amountMinor: row.net_minor, currency: row.currency },
        balance: { amountMinor: row.balance_minor, currency: row.currency },
        daysOpen: row.days,
        bucket: agingBucket(row.days),
      })),
      cursor: cursorOfLast(rows),
    };
  },
};
