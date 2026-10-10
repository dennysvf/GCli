import type { UnitOfWork } from "@/shared/db/transaction";
import { toAmounts, type QueryScope } from "./scope";

export type ChargeTotals = {
  billed: Map<string, bigint>;
  receivable: Map<string, bigint>;
  received: Map<string, bigint>;
};

type BilledRow = { currency: string; billed: bigint | null; receivable: bigint | null };
type ReceivedRow = { currency: string; amount: bigint | null };

// PRD F12: Faturado (net of non-cancelled charges created in the period), A receber (their open
// balance) and Recebido (payments minus refunds received in the period). Refunds are stored with a
// negative amount (F09), so Recebido is a plain sum. With a professional selected, both follow the
// charge's professional (spec F12 decision D4).
export async function chargeTotals(uow: UnitOfWork, scope: QueryScope): Promise<ChargeTotals> {
  const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = scope;
  const [billed, received] = await Promise.all([
    uow.tx.$queryRaw<BilledRow[]>`
      SELECT c.currency,
             sum(c.net_minor)::bigint AS billed,
             sum(c.net_minor - c.paid_minor)::bigint AS receivable
      FROM charge c
      JOIN unit u ON u.id = c.unit_id
      WHERE c.organization_id = ${organizationId}::uuid
        AND c.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND c.status <> 'CANCELLED'
        AND c.created_at >= ${windowStart} AND c.created_at < ${windowEnd}
        AND (c.created_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY c.currency`,
    uow.tx.$queryRaw<ReceivedRow[]>`
      SELECT p.currency, sum(p.amount_minor)::bigint AS amount
      FROM payment p
      JOIN unit u ON u.id = p.unit_id
      JOIN charge c ON c.id = p.charge_id
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR c.professional_id = ${professionalId}::uuid)
        AND p.received_at >= ${windowStart} AND p.received_at < ${windowEnd}
        AND (p.received_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY p.currency`,
  ]);
  return {
    billed: toAmounts(billed.map((row) => ({ currency: row.currency, amount: row.billed }))),
    receivable: toAmounts(billed.map((row) => ({ currency: row.currency, amount: row.receivable }))),
    received: toAmounts(received),
  };
}
