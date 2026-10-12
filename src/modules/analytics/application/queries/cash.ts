import type { UnitOfWork } from "@/shared/db/transaction";
import { addAmounts } from "../../domain/kpis";
import { toAmounts, type QueryScope } from "./scope";

export type CashTotals = {
  // Received manual revenues plus manual cash entries.
  revenues: Map<string, bigint>;
  // Paid expenses plus manual cash withdrawals.
  expenses: Map<string, bigint>;
};

type KindRow = { kind: string; currency: string; amount: bigint | null };

// Spec F12 decision D3: the same lines as the F11 statement. Paid entries without a reversal, of
// live entries; "Geral" entries only with all units; cash movements without a reversal and outside
// the transfer categories, dated by their register's business date.
export async function cashTotals(
  uow: UnitOfWork,
  scope: QueryScope,
  includeGeneral: boolean,
): Promise<CashTotals> {
  const { organizationId, unitIds, period } = scope;
  const [entries, movements] = await Promise.all([
    uow.tx.$queryRaw<KindRow[]>`
      SELECT e.kind, p.currency, sum(p.amount_minor)::bigint AS amount
      FROM financial_entry_payment p
      JOIN financial_entry e ON e.id = p.entry_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.reversed_at IS NULL
        AND e.deleted_at IS NULL
        AND p.paid_on BETWEEN ${period.from}::date AND ${period.to}::date
        AND (e.unit_id = ANY(${unitIds}::uuid[]) OR (${includeGeneral} AND e.unit_id IS NULL))
      GROUP BY e.kind, p.currency`,
    uow.tx.$queryRaw<KindRow[]>`
      SELECT m.direction AS kind, m.currency, sum(m.amount_minor)::bigint AS amount
      FROM cash_movement m
      JOIN cash_register r ON r.id = m.register_id
      JOIN financial_category k ON k.id = m.category_id
      WHERE m.organization_id = ${organizationId}::uuid
        AND m.reversed_at IS NULL
        AND k.kind <> 'TRANSFER'
        AND r.organization_id = ${organizationId}::uuid
        AND r.unit_id = ANY(${unitIds}::uuid[])
        AND r.business_date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY m.direction, m.currency`,
  ]);
  const pick = (rows: KindRow[], kind: string) => toAmounts(rows.filter((row) => row.kind === kind));
  return {
    revenues: addAmounts(pick(entries, "REVENUE"), pick(movements, "IN")),
    expenses: addAmounts(pick(entries, "EXPENSE"), pick(movements, "OUT")),
  };
}
