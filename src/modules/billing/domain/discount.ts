import { BASIS_POINTS, DISCOUNT_APPROVAL_ABOVE_PERCENT, DISCOUNT_REASON_ABOVE_PERCENT } from "./limits";

// A discount is a percentage (basis points) or a fixed amount (minor units) over the gross amount
// of a charge (PRD F09). Everything here is integer arithmetic.
export type DiscountKind = "PERCENT" | "AMOUNT";
export type DiscountInput = { kind: DiscountKind; value: number };

// A percentage is rounded down to the cent, so rounding never gives more discount than typed.
export function discountMinor(grossMinor: number, discount: DiscountInput): number {
  if (discount.kind === "AMOUNT") return discount.value;
  return Number((BigInt(grossMinor) * BigInt(discount.value)) / BigInt(BASIS_POINTS));
}

// Greater than zero, a whole number, and not more than the gross amount (100% is allowed).
export function isValidDiscount(grossMinor: number, discount: DiscountInput): boolean {
  if (!Number.isSafeInteger(discount.value) || discount.value <= 0) return false;
  if (discount.kind === "PERCENT" && discount.value > BASIS_POINTS) return false;
  const amount = discountMinor(grossMinor, discount);
  return amount > 0 && amount <= grossMinor;
}

// The thresholds use the effective discount over the gross amount, so a fixed amount is judged
// like the equivalent percentage: 10.01% needs a reason, 20.01% needs approval.
function exceeds(grossMinor: number, discountAmount: number, percent: number): boolean {
  return BigInt(discountAmount) * 100n > BigInt(grossMinor) * BigInt(percent);
}

export function needsReason(grossMinor: number, discountAmount: number): boolean {
  return exceeds(grossMinor, discountAmount, DISCOUNT_REASON_ABOVE_PERCENT);
}

export function needsApproval(grossMinor: number, discountAmount: number): boolean {
  return exceeds(grossMinor, discountAmount, DISCOUNT_APPROVAL_ABOVE_PERCENT);
}
