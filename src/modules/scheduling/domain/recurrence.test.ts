import { describe, expect, it } from "vitest";
import { expandSeries, type SeriesRule } from "./recurrence";

const rule = (extra: Partial<SeriesRule>): SeriesRule => ({
  frequency: "WEEKLY",
  weekdays: [2, 4],
  firstDate: "2026-10-06",
  endsAfter: 20,
  endsOn: null,
  ...extra,
});

describe("expandSeries", () => {
  it("F06: a weekly series on Tuesdays and Thursdays for 10 weeks has 20 occurrences", () => {
    const result = expandSeries(rule({}));
    if (!result.ok) throw new Error("invalid");
    expect(result.value).toHaveLength(20);
    expect(result.value.slice(0, 3)).toEqual([
      { index: 1, date: "2026-10-06" },
      { index: 2, date: "2026-10-08" },
      { index: 3, date: "2026-10-13" },
    ]);
    expect(result.value.at(-1)).toEqual({ index: 20, date: "2026-12-10" });
  });

  it("F06: biweekly series skip alternate weeks", () => {
    const result = expandSeries(rule({ frequency: "BIWEEKLY", weekdays: [2], endsAfter: 3 }));
    if (!result.ok) throw new Error("invalid");
    expect(result.value.map((item) => item.date)).toEqual(["2026-10-06", "2026-10-20", "2026-11-03"]);
  });

  it("F06: series can end on a date (inclusive)", () => {
    const result = expandSeries(rule({ endsAfter: null, endsOn: "2026-10-15" }));
    if (!result.ok) throw new Error("invalid");
    expect(result.value.map((item) => item.date)).toEqual([
      "2026-10-06",
      "2026-10-08",
      "2026-10-13",
      "2026-10-15",
    ]);
  });

  it("F06: series limits are enforced", () => {
    expect(expandSeries(rule({ endsAfter: 53 })).ok).toBe(false);
    expect(expandSeries(rule({ endsAfter: 52 })).ok).toBe(true);
    expect(expandSeries(rule({ weekdays: [1, 2, 3, 4, 5, 6, 7] })).ok).toBe(false);
    expect(expandSeries(rule({ weekdays: [] })).ok).toBe(false);
    expect(expandSeries(rule({ endsAfter: null, endsOn: "2027-11-06" })).ok).toBe(false);
    // Six weekdays until a date 12 months ahead exceeds 52 sessions.
    const tooMany = expandSeries(
      rule({ weekdays: [1, 2, 3, 4, 5, 6], endsAfter: null, endsOn: "2027-10-06" }),
    );
    expect(tooMany.ok ? null : tooMany.error).toEqual({
      "recurrence.endsOn": "scheduling.validation.recurrenceMaxSessions",
    });
    expect(expandSeries(rule({ endsAfter: 20, endsOn: "2026-12-01" })).ok).toBe(false);
  });
});
