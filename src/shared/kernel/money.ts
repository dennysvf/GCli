// Money as integer minor units plus a currency (ADR-010, ADR-029, architecture 5.8): floats never
// represent amounts and amounts of different currencies are never added.
import { formatMoney, numberSeparators } from "@/shared/i18n/format";
import { isCurrency, minorUnits, type Currency } from "./countries/codes";
import { domainError } from "./errors";
import { fail, ok, type Result } from "./result";

// Adding BRL to EUR is a bug, not a user error (HTTP 500 in the F16 error table).
export class CurrencyMismatchError extends Error {
  readonly code = "MONEY_CURRENCY_MISMATCH";
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} and ${b}`);
  }
}

export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: Currency,
  ) {}

  static of(amountMinor: number, currency: Currency): Money {
    if (!Number.isSafeInteger(amountMinor))
      throw new RangeError(`Money needs integer minor units, got ${amountMinor}`);
    if (!isCurrency(currency)) throw new RangeError(`Unsupported currency ${String(currency)}`);
    return new Money(amountMinor, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  // Parses what a user types in a money field of a locale: "1.234,56" in pt-BR and es, "1,234.56"
  // in en. The currency decides how many decimals are allowed (the Chilean peso has none).
  // Negative values are not user input; refunds and discounts are computed, never typed.
  static parse(text: string, currency: Currency, locale: string): Result<Money> {
    if (text.includes("-")) return fail(domainError("MONEY_INVALID", 400));
    const { decimal, group } = numberSeparators(locale);
    const digits = minorUnits(currency);
    // Currency symbols and spaces are ignored.
    const cleaned = text.replace(/[^\d.,]/g, "");
    const escape = (value: string) => value.replace(/[.,]/g, "\\$&");
    const fraction = digits > 0 ? `(?:${escape(decimal)}(\\d{1,${digits}}))?` : "";
    const pattern = new RegExp(`^(\\d{1,3}(?:${escape(group)}\\d{3})+|\\d+)${fraction}$`);
    const match = pattern.exec(cleaned);
    if (!match) return fail(domainError("MONEY_INVALID", 400));
    const whole = (match[1] ?? "0").split(group).join("");
    const minor = Number(whole) * 10 ** digits + Number((match[2] ?? "").padEnd(digits, "0") || 0);
    if (!Number.isSafeInteger(minor)) return fail(domainError("MONEY_INVALID", 400));
    return ok(new Money(minor, currency));
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) throw new CurrencyMismatchError(this.currency, other.currency);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }

  format(locale: string): string {
    return formatMoney(this, locale);
  }

  // ---- BRL helpers of F03 and F06, removed when their prices move to a currency per row ----

  static fromCents(cents: number): Money {
    return Money.of(cents, "BRL");
  }

  get cents(): number {
    return this.amountMinor;
  }
}

// Sums grouped by currency, so reports never mix them (used by F12 and F13).
export class MoneyTotals {
  private readonly sums = new Map<Currency, number>();

  add(money: Money): this {
    this.sums.set(money.currency, (this.sums.get(money.currency) ?? 0) + money.amountMinor);
    return this;
  }

  get(currency: Currency): Money {
    return Money.of(this.sums.get(currency) ?? 0, currency);
  }

  // Totals ordered by currency code, so output is stable.
  toList(): Money[] {
    return [...this.sums.keys()].sort().map((currency) => this.get(currency));
  }

  isEmpty(): boolean {
    return this.sums.size === 0;
  }

  static of(items: Iterable<Money>): MoneyTotals {
    const totals = new MoneyTotals();
    for (const item of items) totals.add(item);
    return totals;
  }
}

// "R$ 1.234,56" for amounts stored before the currency column existed (all of them are BRL).
export function formatCents(cents: number): string {
  return Money.fromCents(cents).format("pt-BR");
}
