import { describe, expect, it } from "vitest";
import {
  addAmounts,
  averageTicket,
  divideRounded,
  moneyLines,
  percentChange,
  pointsChange,
  ratio,
  result,
} from "./kpis";

describe("dashboard KPI math", () => {
  it("F12: cancellation rate is cancelled over all booked; no-show rate is no-shows over completed plus no-shows", () => {
    // 412 kept, 31 cancelled; 371 completed, 18 no-shows.
    expect(ratio(31, 412 + 31)).toBeCloseTo(0.07, 4);
    expect(ratio(18, 371 + 18)).toBeCloseTo(0.0463, 4);
    expect(ratio(0, 0)).toBeNull();
  });

  it("F12: average ticket and result are computed per currency and never summed across currencies", () => {
    const received = new Map([
      ["BRL", 5_730_000n],
      ["EUR", 100_000n],
    ]);
    const tickets = averageTicket(
      received,
      new Map([
        ["BRL", 371],
        ["EUR", 0],
      ]),
    );
    expect(tickets).toEqual(new Map([["BRL", 15_445n]]));

    const totals = result(
      received,
      new Map([["BRL", 180_000n]]),
      new Map([
        ["BRL", 2_100_000n],
        ["USD", 500n],
      ]),
    );
    expect(totals).toEqual(
      new Map([
        ["BRL", 3_810_000n],
        ["EUR", 100_000n],
        ["USD", -500n],
      ]),
    );
    expect(
      addAmounts(
        new Map([["BRL", 1n]]),
        new Map([
          ["BRL", 2n],
          ["EUR", 3n],
        ]),
      ),
    ).toEqual(
      new Map([
        ["BRL", 3n],
        ["EUR", 3n],
      ]),
    );
  });

  it("F12: variation is a percentage for values and percentage points for rates", () => {
    expect(percentChange(412, 368, "HIGHER_IS_BETTER")).toEqual({
      kind: "PERCENT",
      value: 12,
      significant: true,
      tone: "GOOD",
    });
    expect(pointsChange(0.7242, 0.6912, "HIGHER_IS_BETTER")).toEqual({
      kind: "POINTS",
      value: 3.3,
      significant: true,
      tone: "GOOD",
    });
    expect(pointsChange(0.07, 0.081, "LOWER_IS_BETTER")).toEqual({
      kind: "POINTS",
      value: -1.1,
      significant: false,
      tone: "GOOD",
    });
  });

  it("F12: a zero previous value gives no comparison base", () => {
    expect(percentChange(46, 0, "HIGHER_IS_BETTER")).toEqual({
      kind: "NO_BASE",
      value: null,
      significant: false,
      tone: "NEUTRAL",
    });
    expect(percentChange(0, 0, "HIGHER_IS_BETTER")).toEqual({
      kind: "NONE",
      value: 0,
      significant: false,
      tone: "NEUTRAL",
    });
    expect(pointsChange(0.5, null, "HIGHER_IS_BETTER").kind).toBe("NO_BASE");
  });

  it("F12: variation is significant from 5% or 2 p.p., and its tone follows the meaning of the KPI", () => {
    expect(percentChange(104, 100, "HIGHER_IS_BETTER").significant).toBe(false);
    expect(percentChange(105, 100, "HIGHER_IS_BETTER").significant).toBe(true);
    expect(percentChange(110, 100, "LOWER_IS_BETTER").tone).toBe("BAD");
    expect(percentChange(139, 100, "NEUTRAL").tone).toBe("NEUTRAL");
    expect(pointsChange(0.12, 0.1, "LOWER_IS_BETTER")).toMatchObject({ significant: true, tone: "BAD" });
    expect(pointsChange(0.119, 0.1, "LOWER_IS_BETTER").significant).toBe(false);
  });

  it("F12: money lines list each currency of either period", () => {
    const lines = moneyLines(
      new Map([["EUR", 200n]]),
      new Map([
        ["BRL", 100n],
        ["EUR", 100n],
      ]),
      "HIGHER_IS_BETTER",
    );
    expect(lines.map((line) => [line.currency, line.amountMinor, line.change.value])).toEqual([
      ["BRL", 0n, -100],
      ["EUR", 200n, 100],
    ]);
  });

  it("F12: minor units are divided with rounding half away from zero", () => {
    expect(divideRounded(5n, 2n)).toBe(3n);
    expect(divideRounded(-5n, 2n)).toBe(-3n);
    expect(divideRounded(4n, 3n)).toBe(1n);
  });
});
