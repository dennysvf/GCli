import { BASIS_POINTS } from "../domain/limits";
import {
  discountMinor,
  isValidDiscount,
  needsApproval,
  needsReason,
  type DiscountInput,
} from "../domain/discount";

// Pure helpers of the receive modal: payment lines, the balance that remains and the effect of a
// discount, so the screen can show them live (PRD F09 Experience).
export type PaymentLine = { key: string; method: string; amountMinor: number; installments: number };

export function totalOf(lines: readonly PaymentLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountMinor, 0);
}

// What is left to receive after the discount, the payments already made and the lines typed.
export function remainingMinor(netMinor: number, paidMinor: number, lines: readonly PaymentLine[]): number {
  return netMinor - paidMinor - totalOf(lines);
}

// "12,5" or "12.5" typed as a percentage becomes basis points (1250); anything else is null.
export function percentToBasisPoints(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  const basisPoints = Math.round(Number(normalized) * 100);
  return basisPoints > 0 && basisPoints <= BASIS_POINTS ? basisPoints : null;
}

export function basisPointsToText(basisPoints: number): string {
  return String(basisPoints / 100).replace(".", ",");
}

export type DiscountPreview = {
  valid: boolean;
  discountMinor: number;
  needsReason: boolean;
  needsApproval: boolean;
};

export function previewDiscount(grossMinor: number, discount: DiscountInput | null): DiscountPreview {
  if (!discount) return { valid: true, discountMinor: 0, needsReason: false, needsApproval: false };
  if (!isValidDiscount(grossMinor, discount)) {
    return { valid: false, discountMinor: 0, needsReason: false, needsApproval: false };
  }
  const amount = discountMinor(grossMinor, discount);
  return {
    valid: true,
    discountMinor: amount,
    needsReason: needsReason(grossMinor, amount),
    needsApproval: needsApproval(grossMinor, amount),
  };
}

export function sameDiscount(a: DiscountInput | null, b: DiscountInput | null): boolean {
  return a === b || (!!a && !!b && a.kind === b.kind && a.value === b.value);
}
