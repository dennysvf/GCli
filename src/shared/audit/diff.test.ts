import { describe, expect, it } from "vitest";
import { diffChanges } from "./diff";

describe("diffChanges", () => {
  it("records only changed fields with before and after values", () => {
    const changes = diffChanges(
      { legalName: "Clínica A", timeZone: "America/Sao_Paulo" },
      { legalName: "Clínica B", timeZone: "America/Sao_Paulo" },
    );
    expect(changes).toEqual({ legalName: { before: "Clínica A", after: "Clínica B" } });
  });

  it("records sensitive fields only as changed with lengths", () => {
    const changes = diffChanges({ content: "abc" }, { content: "abcdef" }, { sensitive: ["content"] });
    expect(changes).toEqual({ content: { changed: true, beforeLength: 3, afterLength: 6 } });
  });

  it("treats creation as before = null and normalizes dates", () => {
    const at = new Date("2026-09-29T12:00:00.000Z");
    expect(diffChanges(null, { name: "Ana", at })).toEqual({
      name: { before: null, after: "Ana" },
      at: { before: null, after: "2026-09-29T12:00:00.000Z" },
    });
  });
});
