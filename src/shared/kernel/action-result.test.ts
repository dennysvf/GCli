import { describe, expect, it } from "vitest";
import { domainError } from "./errors";
import { fail } from "./result";
import { toActionResult } from "./action-result";

describe("toActionResult", () => {
  it("replaces message parameters", () => {
    const result = toActionResult(fail(domainError("ROOM_BUSY", 409, undefined, { count: 12 })), {
      ROOM_BUSY: "Esta sala possui {count} agendamentos futuros.",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "ROOM_BUSY", message: "Esta sala possui 12 agendamentos futuros." },
    });
  });

  it("keeps unknown placeholders and field errors", () => {
    const result = toActionResult(fail(domainError("X", 400, { name: "Nome inválido." })), {
      X: "Erro {other}",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "X", message: "Erro {other}", fields: { name: "Nome inválido." } },
    });
  });
});
