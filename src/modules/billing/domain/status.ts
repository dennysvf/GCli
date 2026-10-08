// PRD F09 status of a charge, always derived from the money it holds.
export const CHARGE_STATUSES = ["PENDING_APPROVAL", "OPEN", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const CHARGE_ORIGINS = ["APPOINTMENT", "MANUAL", "PACKAGE"] as const;
export type ChargeOrigin = (typeof CHARGE_ORIGINS)[number];

export function deriveStatus(input: {
  netMinor: number;
  paidMinor: number;
  hasPendingDiscount: boolean;
  cancelled: boolean;
}): ChargeStatus {
  if (input.cancelled) return "CANCELLED";
  if (input.hasPendingDiscount) return "PENDING_APPROVAL";
  // Net 0 (a 100% discount) is settled without any payment.
  if (input.paidMinor >= input.netMinor) return "PAID";
  return input.paidMinor > 0 ? "PARTIALLY_PAID" : "OPEN";
}

// Statuses that can still receive a discount change or a payment attempt.
export function isLive(status: ChargeStatus): boolean {
  return status !== "CANCELLED";
}

// "2026-000123": the year and a yearly sequence per organization. Not a fiscal number.
export function formatChargeNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, "0")}`;
}
