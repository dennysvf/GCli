import { describe, expect, it } from "vitest";
import { createTtlCache } from "./cache";

describe("dashboard cache", () => {
  it("F12: cached results expire after 5 minutes", () => {
    let now = new Date("2026-10-10T12:00:00Z");
    const cache = createTtlCache<number>({ clock: () => now });
    cache.set("k", 1);
    now = new Date("2026-10-10T12:04:59Z");
    expect(cache.get("k")).toBe(1);
    now = new Date("2026-10-10T12:05:00Z");
    expect(cache.get("k")).toBeUndefined();
  });

  it("F12: the cache evicts the oldest entry beyond its size", () => {
    const cache = createTtlCache<number>({ clock: () => new Date(), maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 3);
    cache.set("c", 4);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(3);
    expect(cache.get("c")).toBe(4);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });
});
