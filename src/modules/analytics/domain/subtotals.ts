export type RevenueLine = {
  group: string;
  currency: string;
  kind: "PAYMENT" | "REFUND";
  amountMinor: bigint;
};
export type GroupSubtotal = {
  group: string;
  currency: string;
  payments: bigint;
  refunds: bigint;
  net: bigint;
};

// PRD F13 "Receitas": subtotals per grouping and currency. Refund amounts are positive in the rows
// and subtracted here; currencies are never summed together (ADR-029).
export function subtotalsByGroup(lines: RevenueLine[]): GroupSubtotal[] {
  const totals = new Map<string, GroupSubtotal>();
  for (const line of lines) {
    const key = `${line.group}\u0000${line.currency}`;
    const entry = totals.get(key) ?? {
      group: line.group,
      currency: line.currency,
      payments: 0n,
      refunds: 0n,
      net: 0n,
    };
    if (line.kind === "PAYMENT") entry.payments += line.amountMinor;
    else entry.refunds += line.amountMinor;
    entry.net = entry.payments - entry.refunds;
    totals.set(key, entry);
  }
  return [...totals.values()].sort(
    (a, b) => a.group.localeCompare(b.group) || a.currency.localeCompare(b.currency),
  );
}
