// The statement (PRD F11): lines from every source in one currency, with a running balance that
// starts from the balance before the period. Pure; the application layer gathers the lines.
export type StatementSource = "PATIENT" | "REVENUE" | "EXPENSE" | "CASH_IN" | "CASH_OUT";

export type StatementInput = {
  date: string;
  source: StatementSource;
  description: string;
  // A document number shown beside the description (the charge number of a patient payment).
  reference?: string | null;
  category: string | null;
  // Signed: positive money in, negative money out.
  amountMinor: number;
  // Stable tie-break inside a day (time of day or id).
  order: string;
};

export type StatementLine = {
  date: string;
  source: StatementSource;
  description: string;
  reference: string | null;
  category: string | null;
  inMinor: number;
  outMinor: number;
  balanceMinor: number;
};

export type Statement = {
  previousBalanceMinor: number;
  lines: StatementLine[];
  totalsByCategory: { source: StatementSource; category: string | null; totalMinor: number }[];
  totalsBySource: Record<StatementSource, number>;
  resultMinor: number;
  closingBalanceMinor: number;
};

const SOURCE_ORDER: StatementSource[] = ["PATIENT", "REVENUE", "CASH_IN", "CASH_OUT", "EXPENSE"];

export function sumSigned(inputs: readonly { amountMinor: number }[]): number {
  return inputs.reduce((sum, input) => sum + input.amountMinor, 0);
}

export function buildStatement(input: {
  previousBalanceMinor: number;
  lines: readonly StatementInput[];
}): Statement {
  const sorted = [...input.lines].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) ||
      a.order.localeCompare(b.order),
  );
  let balance = input.previousBalanceMinor;
  const lines: StatementLine[] = sorted.map((line) => {
    balance += line.amountMinor;
    return {
      date: line.date,
      source: line.source,
      description: line.description,
      reference: line.reference ?? null,
      category: line.category,
      inMinor: line.amountMinor > 0 ? line.amountMinor : 0,
      outMinor: line.amountMinor < 0 ? -line.amountMinor : 0,
      balanceMinor: balance,
    };
  });
  const totalsBySource: Record<StatementSource, number> = {
    PATIENT: 0,
    REVENUE: 0,
    EXPENSE: 0,
    CASH_IN: 0,
    CASH_OUT: 0,
  };
  const byCategory = new Map<
    string,
    { source: StatementSource; category: string | null; totalMinor: number }
  >();
  for (const line of sorted) {
    totalsBySource[line.source] += line.amountMinor;
    const key = `${line.source}|${line.category ?? ""}`;
    const total = byCategory.get(key) ?? { source: line.source, category: line.category, totalMinor: 0 };
    total.totalMinor += line.amountMinor;
    byCategory.set(key, total);
  }
  return {
    previousBalanceMinor: input.previousBalanceMinor,
    lines,
    totalsByCategory: [...byCategory.values()].sort(
      (a, b) =>
        SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source) ||
        (a.category ?? "").localeCompare(b.category ?? ""),
    ),
    totalsBySource,
    resultMinor: balance - input.previousBalanceMinor,
    closingBalanceMinor: balance,
  };
}
