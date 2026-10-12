import { subtotalsByGroup, type RevenueLine } from "../../domain/subtotals";
import { allToNull, cursorOfLast, textColumn } from "./shared";
import type { ColumnDef, Money, RawRow, ReportDefinition, Summary, Totals } from "./types";

type Row = {
  sort_at: Date;
  row_id: string;
  date: string;
  patient: string;
  charge_number: string;
  method: string;
  service: string | null;
  professional: string | null;
  unit: string;
  kind: string;
  amount_minor: bigint;
  currency: string;
};
type GroupRow = { grp: string | null; kind: string; currency: string; amount: bigint | null };
type TotalRow = { kind: string; currency: string; total: number; amount: bigint | null };

const COLUMNS: ColumnDef[] = [
  { key: "date", kind: "date", align: "left" },
  textColumn("patient"),
  textColumn("chargeNumber"),
  { key: "method", kind: "label", align: "left", labelPrefix: "analytics.reports.values.method" },
  textColumn("service", "analytics.reports.noService"),
  textColumn("professional", "analytics.reports.noProfessional"),
  textColumn("unit"),
  { key: "type", kind: "stamp", align: "left", labelPrefix: "analytics.reports.values.paymentKind" },
  { key: "amount", kind: "money", align: "right" },
];

const byCurrency = (a: Money, b: Money) => a.currency.localeCompare(b.currency);

// PRD F13 report 3: payments and refunds received in the period. Refunds are stored with a
// negative amount (F09), so the rows carry the signed amount. With a professional selected, the
// charge's professional is used, as in the dashboard (spec F13, assumption 7).
export const revenueReport: ReportDefinition = {
  id: "revenue",
  columns: COLUMNS,
  referencesService: true,
  referencesReason: false,

  async totals(uow, rc): Promise<Totals> {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const rows = await uow.tx.$queryRaw<TotalRow[]>`
      SELECT p.kind, p.currency, count(*)::int AS total, sum(p.amount_minor)::bigint AS amount
      FROM payment p
      JOIN unit u ON u.id = p.unit_id
      JOIN charge c ON c.id = p.charge_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND (${service}::uuid IS NULL OR c.service_id = ${service}::uuid)
        AND (${rc.filters.method}::text = 'ALL' OR p.method = ${rc.filters.method})
        AND p.received_at >= ${windowStart} AND p.received_at < ${windowEnd}
        AND (p.received_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY p.kind, p.currency`;
    const counts: Record<string, number> = { PAYMENT: 0, REFUND: 0 };
    const payments = new Map<string, bigint>();
    const refunds = new Map<string, bigint>();
    let rowCount = 0;
    for (const row of rows) {
      rowCount += row.total;
      counts[row.kind] = (counts[row.kind] ?? 0) + row.total;
      const target = row.kind === "REFUND" ? refunds : payments;
      target.set(row.currency, (target.get(row.currency) ?? 0n) + (row.amount ?? 0n));
    }
    const currencies = [...new Set([...payments.keys(), ...refunds.keys()])].sort();
    const list = (amounts: Map<string, bigint>): Money[] =>
      currencies.map((currency) => ({ currency, amountMinor: amounts.get(currency) ?? 0n }));
    const net: Money[] = currencies.map((currency) => ({
      currency,
      amountMinor: (payments.get(currency) ?? 0n) + (refunds.get(currency) ?? 0n),
    }));
    return {
      rowCount,
      counts,
      money: { payments: list(payments).sort(byCurrency), refunds: list(refunds).sort(byCurrency), net },
    };
  },

  async summaries(uow, rc): Promise<Summary[]> {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const groupBy = rc.filters.groupBy;
    const rows = await uow.tx.$queryRaw<GroupRow[]>`
      SELECT CASE ${groupBy}::text
               WHEN 'METHOD' THEN p.method
               WHEN 'SERVICE' THEN s.name
               WHEN 'PROFESSIONAL' THEN coalesce(pr.display_name, pr.full_name)
               ELSE u.name
             END AS grp,
             p.kind, p.currency, sum(p.amount_minor)::bigint AS amount
      FROM payment p
      JOIN unit u ON u.id = p.unit_id
      JOIN charge c ON c.id = p.charge_id
      LEFT JOIN service s ON s.id = c.service_id
      LEFT JOIN professional pr ON pr.id = c.professional_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND (${service}::uuid IS NULL OR c.service_id = ${service}::uuid)
        AND (${rc.filters.method}::text = 'ALL' OR p.method = ${rc.filters.method})
        AND p.received_at >= ${windowStart} AND p.received_at < ${windowEnd}
        AND (p.received_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY 1, p.kind, p.currency`;
    const lines: RevenueLine[] = rows.map((row) => {
      const amount = row.amount ?? 0n;
      return {
        group: row.grp ?? "",
        currency: row.currency,
        kind: row.kind === "REFUND" ? "REFUND" : "PAYMENT",
        // Refunds are negative in the source; the domain subtracts a positive refund amount.
        amountMinor: row.kind === "REFUND" ? -amount : amount,
      };
    });
    const groupColumn: ColumnDef =
      groupBy === "METHOD"
        ? { key: "group", kind: "label", align: "left", labelPrefix: "analytics.reports.values.method" }
        : textColumn(
            "group",
            groupBy === "SERVICE"
              ? "analytics.reports.noService"
              : groupBy === "PROFESSIONAL"
                ? "analytics.reports.noProfessional"
                : undefined,
          );
    return [
      {
        key: "subtotals",
        columns: [
          groupColumn,
          { key: "payments", kind: "money", align: "right" },
          { key: "refunds", kind: "money", align: "right" },
          { key: "net", kind: "money", align: "right" },
        ],
        rows: subtotalsByGroup(lines).map((entry): RawRow => ({
          group: entry.group === "" ? null : entry.group,
          payments: { amountMinor: entry.payments, currency: entry.currency },
          refunds: { amountMinor: -entry.refunds, currency: entry.currency },
          net: { amountMinor: entry.net, currency: entry.currency },
        })),
      },
    ];
  },

  async rows(uow, rc, { limit, offset = 0, after = null }) {
    const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = rc.scope;
    const service = allToNull(rc.filters.service);
    const afterAt = after?.at ?? null;
    const afterId = after?.id ?? null;
    const rows = await uow.tx.$queryRaw<Row[]>`
      SELECT p.received_at AS sort_at, p.id AS row_id,
             to_char(p.received_at AT TIME ZONE u.time_zone, 'YYYY-MM-DD') AS date,
             coalesce(pt.social_name, pt.full_name) AS patient, c.number AS charge_number,
             p.method, s.name AS service, coalesce(pr.display_name, pr.full_name) AS professional,
             u.name AS unit, p.kind, p.amount_minor, p.currency
      FROM payment p
      JOIN unit u ON u.id = p.unit_id
      JOIN charge c ON c.id = p.charge_id
      JOIN patient pt ON pt.id = c.patient_id
      LEFT JOIN service s ON s.id = c.service_id
      LEFT JOIN professional pr ON pr.id = c.professional_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND (${service}::uuid IS NULL OR c.service_id = ${service}::uuid)
        AND (${rc.filters.method}::text = 'ALL' OR p.method = ${rc.filters.method})
        AND p.received_at >= ${windowStart} AND p.received_at < ${windowEnd}
        AND (p.received_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
        AND (${afterAt}::timestamptz IS NULL OR (p.received_at, p.id) > (${afterAt}::timestamptz, ${afterId}::uuid))
      ORDER BY p.received_at, p.id
      LIMIT ${limit} OFFSET ${offset}`;
    return {
      rows: rows.map((row): RawRow => ({
        date: row.date,
        patient: row.patient,
        chargeNumber: row.charge_number,
        method: row.method,
        service: row.service,
        professional: row.professional,
        unit: row.unit,
        type: row.kind,
        amount: { amountMinor: row.amount_minor, currency: row.currency },
      })),
      cursor: cursorOfLast(rows),
    };
  },
};
