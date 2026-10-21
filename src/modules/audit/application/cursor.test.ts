import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

describe("audit cursor", () => {
  it("F15: a cursor round-trips and an invalid cursor is rejected", () => {
    const cursor = { occurredAt: "2026-10-17T13:42:05.120456Z", id: "0192f0a8-1d2e-7a00-8c11-5b6c7d8e9f01" };
    const text = encodeCursor(cursor);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(text)).toEqual(cursor);
    expect(decodeCursor("not a cursor!")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-10-17|x").toString("base64url"))).toBeNull();
    expect(
      decodeCursor(Buffer.from(`${cursor.occurredAt}|${cursor.id}|extra`).toString("base64url")),
    ).toBeNull();
  });
});
