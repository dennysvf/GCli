import { describe, expect, it } from "vitest";
import { registerCatalog } from "@/shared/i18n/catalogs";
import { domainError } from "./errors";
import { fail } from "./result";
import { toActionResult } from "./action-result";

registerCatalog("demo", {
  "pt-BR": { errors: { ROOM_BUSY: "Esta sala possui {count} agendamentos futuros.", X: "Erro" } },
  en: { errors: { ROOM_BUSY: "This room has {count} future appointments.", X: "Error" } },
  es: { errors: { ROOM_BUSY: "Esta sala tiene {count} citas futuras.", X: "Error" } },
});

describe("toActionResult", () => {
  it("F16: the message is translated into the requester's language with the error params", () => {
    const failed = fail(domainError("ROOM_BUSY", 409, undefined, { count: 12 }));
    expect(toActionResult(failed, "pt-BR", "demo")).toEqual({
      ok: false,
      error: { code: "ROOM_BUSY", message: "Esta sala possui 12 agendamentos futuros." },
    });
    expect(toActionResult(failed, "en", "demo")).toMatchObject({
      error: { message: "This room has 12 future appointments." },
    });
    expect(toActionResult(failed, "es", "demo")).toMatchObject({
      error: { message: "Esta sala tiene 12 citas futuras." },
    });
  });

  it("falls back to the shared error texts, then to a generic text", () => {
    expect(toActionResult(fail(domainError("NOT_FOUND", 404)), "en", "demo")).toMatchObject({
      error: { message: "Record not found." },
    });
    expect(toActionResult(fail(domainError("UNMAPPED", 500)), "en", "demo")).toMatchObject({
      error: { message: "The operation could not be completed. Try again." },
    });
  });

  it("F16: field errors given as message keys are translated, other text is kept", () => {
    const failed = fail(domainError("X", 400, { name: "validation.localeInvalid", other: "Texto solto" }));
    expect(toActionResult(failed, "es", "demo")).toEqual({
      ok: false,
      error: {
        code: "X",
        message: "Error",
        fields: { name: "Elija un idioma de la lista.", other: "Texto solto" },
      },
    });
  });

  it("carries structured details for the UI", () => {
    const error = { ...domainError("X", 400), details: { findings: [{ code: "A" }] } };
    expect(toActionResult(fail(error), "pt-BR", "demo")).toEqual({
      ok: false,
      error: { code: "X", message: "Erro", details: { findings: [{ code: "A" }] } },
    });
  });
});
