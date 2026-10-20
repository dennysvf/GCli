import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

describe("timeline cursor", () => {
  it("F14: cursor round-trips and rejects tampered text", () => {
    const cursor = { at: new Date("2026-10-06T14:10:00.000Z"), id: "01927a52-0000-7000-8000-000000000201" };
    const text = encodeCursor(cursor);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(text)).toEqual(cursor);

    expect(decodeCursor("not a cursor")).toBeNull();
    expect(decodeCursor(`${text.slice(0, -3)}xyz`)).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ t: "yesterday", i: cursor.id })))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ t: cursor.at.toISOString(), i: "1; DROP TABLE" })))).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
});
