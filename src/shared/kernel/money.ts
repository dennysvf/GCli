import { domainError } from "./errors";
import { fail, ok, type Result } from "./result";

// Money as integer cents (ADR-010, architecture 5.8): floats never represent amounts.
export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) throw new RangeError(`Money needs integer cents, got ${cents}`);
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  // Parses what a user types in a BRL field: "1.234,56", "R$ 12,3", "80". Negative values are
  // not user input; refunds and discounts are computed, never typed.
  static parseBRL(text: string): Result<Money> {
    const cleaned = text.replace(/R\$/i, "").replace(/\s/g, "");
    if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(cleaned)) {
      return fail(domainError("MONEY_INVALID", 400));
    }
    const [whole = "0", fraction = ""] = cleaned.replace(/\./g, "").split(",");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents)) return fail(domainError("MONEY_INVALID", 400));
    return ok(new Money(cents));
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  // "R$ 1.234,56" with a regular space, so text matches the same way everywhere.
  format(): string {
    return BRL.format(this.cents / 100).replace(/ /g, " ");
  }
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number): string {
  return Money.fromCents(cents).format();
}
