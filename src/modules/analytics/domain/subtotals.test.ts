import { describe, expect, it } from "vitest";
import { subtotalsByGroup } from "./subtotals";

describe("revenue subtotals", () => {
  it("F13: revenue subtotals per group separate payments, refunds and net per currency", () => {
    const result = subtotalsByGroup([
      { group: "PIX", currency: "BRL", kind: "PAYMENT", amountMinor: 10_000n },
      { group: "PIX", currency: "BRL", kind: "PAYMENT", amountMinor: 5_000n },
      { group: "PIX", currency: "BRL", kind: "REFUND", amountMinor: 2_000n },
      { group: "PIX", currency: "EUR", kind: "PAYMENT", amountMinor: 700n },
      { group: "CASH", currency: "BRL", kind: "PAYMENT", amountMinor: 300n },
    ]);
    expect(result).toEqual([
      { group: "CASH", currency: "BRL", payments: 300n, refunds: 0n, net: 300n },
      { group: "PIX", currency: "BRL", payments: 15_000n, refunds: 2_000n, net: 13_000n },
      { group: "PIX", currency: "EUR", payments: 700n, refunds: 0n, net: 700n },
    ]);
  });
});
