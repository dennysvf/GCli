import { SIGNIFICANT_CHANGE_PERCENT, SIGNIFICANT_CHANGE_POINTS } from "./limits";

// Which direction of a KPI is good news (spec F12, assumption 10).
export type Polarity = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | "NEUTRAL";
export type ChangeKind = "PERCENT" | "POINTS" | "NO_BASE" | "NONE";
export type Tone = "GOOD" | "BAD" | "NEUTRAL";
export type Change = { kind: ChangeKind; value: number | null; significant: boolean; tone: Tone };

// Amounts per currency (ADR-029: never summed across currencies).
export type CurrencyAmounts = ReadonlyMap<string, bigint>;

// A rate with a zero denominator has no value (spec F12, assumption 5).
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function toneOf(delta: number, polarity: Polarity): Tone {
  if (delta === 0 || polarity === "NEUTRAL") return "NEUTRAL";
  return delta > 0 === (polarity === "HIGHER_IS_BETTER") ? "GOOD" : "BAD";
}

// Spec F12 decision D7: counts and money change by a relative percentage, rounded to an integer.
export function percentChange(current: number, previous: number, polarity: Polarity): Change {
  if (previous === 0) {
    return current === 0
      ? { kind: "NONE", value: 0, significant: false, tone: "NEUTRAL" }
      : { kind: "NO_BASE", value: null, significant: false, tone: "NEUTRAL" };
  }
  const value = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (value === 0) return { kind: "NONE", value: 0, significant: false, tone: "NEUTRAL" };
  return {
    kind: "PERCENT",
    value,
    significant: Math.abs(value) >= SIGNIFICANT_CHANGE_PERCENT,
    tone: toneOf(value, polarity),
  };
}

// Spec F12 decision D7: rates change by percentage points, with one decimal.
export function pointsChange(current: number | null, previous: number | null, polarity: Polarity): Change {
  if (current === null || previous === null)
    return { kind: "NO_BASE", value: null, significant: false, tone: "NEUTRAL" };
  const value = Math.round((current - previous) * 1000) / 10;
  if (value === 0) return { kind: "NONE", value: 0, significant: false, tone: "NEUTRAL" };
  return {
    kind: "POINTS",
    value,
    significant: Math.abs(value) >= SIGNIFICANT_CHANGE_POINTS,
    tone: toneOf(value, polarity),
  };
}

// Integer division rounded half away from zero, for minor units.
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * a + b) / (2n * b);
  return negative ? -quotient : quotient;
}

// PRD F12: Ticket médio = received ÷ completed appointments, per currency (spec F12, assumption 4).
// A currency without completed appointments has no ticket.
export function averageTicket(
  received: CurrencyAmounts,
  completedByCurrency: ReadonlyMap<string, number>,
): Map<string, bigint> {
  const tickets = new Map<string, bigint>();
  for (const [currency, completed] of completedByCurrency) {
    if (completed <= 0) continue;
    tickets.set(currency, divideRounded(received.get(currency) ?? 0n, BigInt(completed)));
  }
  return tickets;
}

// PRD F12: Resultado = Recebido + manual revenues − paid expenses, per currency (spec F12 decision
// D3: the same lines as the F11 statement).
export function result(
  received: CurrencyAmounts,
  revenues: CurrencyAmounts,
  expenses: CurrencyAmounts,
): Map<string, bigint> {
  const currencies = new Set([...received.keys(), ...revenues.keys(), ...expenses.keys()]);
  const totals = new Map<string, bigint>();
  for (const currency of currencies) {
    totals.set(
      currency,
      (received.get(currency) ?? 0n) + (revenues.get(currency) ?? 0n) - (expenses.get(currency) ?? 0n),
    );
  }
  return totals;
}

export type MoneyLine = { currency: string; amountMinor: bigint; previousMinor: bigint; change: Change };

// One line per currency present in either period, sorted by currency (PRD F16: money cards list one
// line per currency).
export function moneyLines(
  current: CurrencyAmounts,
  previous: CurrencyAmounts,
  polarity: Polarity,
): MoneyLine[] {
  const currencies = [...new Set([...current.keys(), ...previous.keys()])].sort();
  return currencies.map((currency) => {
    const amountMinor = current.get(currency) ?? 0n;
    const previousMinor = previous.get(currency) ?? 0n;
    return {
      currency,
      amountMinor,
      previousMinor,
      change: percentChange(Number(amountMinor), Number(previousMinor), polarity),
    };
  });
}

// Sums two amount maps currency by currency.
export function addAmounts(a: CurrencyAmounts, b: CurrencyAmounts): Map<string, bigint> {
  const totals = new Map(a);
  for (const [currency, amount] of b) totals.set(currency, (totals.get(currency) ?? 0n) + amount);
  return totals;
}
