import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import ptBR from "../messages/pt-BR.json";
import {
  changesText,
  formatValue,
  isSecretKey,
  presentChanges,
  presentMetadata,
  type ValueDisplay,
} from "./present-changes";

function displayOf(values: typeof ptBR.values, fields: Record<string, string> = {}): ValueDisplay {
  return {
    label: (field) => fields[field] ?? field,
    yes: values.yes,
    no: values.no,
    empty: values.empty,
    hidden: values.hidden,
    anonymized: values.anonymized,
    instant: (iso) => `instant(${iso})`,
    sensitive: (before, after) =>
      values.sensitive.replace("{before, number}", String(before)).replace("{after, number}", String(after)),
  };
}

const display = displayOf(ptBR.values, ptBR.fields);

describe("presentChanges", () => {
  it("F15: an update change renders as before and after values", () => {
    const changes = presentChanges(
      { fullName: { before: "Maria Souza", after: "Maria Souza Lima" } },
      { subjectAnonymized: false },
      display,
    );
    expect(changes).toEqual([
      {
        field: "fullName",
        label: "Nome completo",
        kind: "value",
        before: "Maria Souza",
        after: "Maria Souza Lima",
        beforeLength: null,
        afterLength: null,
      },
    ]);
  });

  it("F15: a sensitive change renders only as clinical content changed with character counts", () => {
    const [change] = presentChanges(
      { content: { changed: true, beforeLength: 120, afterLength: 154 } },
      { subjectAnonymized: false },
      display,
    );
    expect(change).toMatchObject({
      kind: "sensitive",
      before: null,
      after: null,
      beforeLength: 120,
      afterLength: 154,
    });
    expect(changesText(change ? [change] : [], display)).toBe(
      "content: conteúdo clínico alterado (120 → 154 caracteres)",
    );
  });

  it("F15: secret-like fields are hidden even when recorded with values", () => {
    const changes = presentChanges(
      {
        approvalPinHash: { before: "old-hash", after: "new-hash" },
        passwordHash: { before: "a", after: "b" },
        resetToken: { before: "x", after: "y" },
        clientSecret: { before: "x", after: "y" },
        number: { before: "10", after: "12" },
      },
      { subjectAnonymized: false },
      display,
    );
    const kinds = Object.fromEntries(changes.map((change) => [change.field, change.kind]));
    expect(kinds).toEqual({
      approvalPinHash: "hidden",
      clientSecret: "hidden",
      number: "value",
      passwordHash: "hidden",
      resetToken: "hidden",
    });
    expect(JSON.stringify(changes)).not.toContain("old-hash");
    expect(JSON.stringify(changes)).not.toContain("new-hash");
    expect(isSecretKey("pinned")).toBe(false);
    expect(isSecretKey("shipping")).toBe(false);
  });

  it("F15: null, boolean and instant values are formatted for display", () => {
    expect(formatValue(null, display)).toBe("—");
    expect(formatValue(true, display)).toBe("Sim");
    expect(formatValue(false, display)).toBe("Não");
    expect(formatValue("2026-10-17T13:42:05.120Z", display)).toBe("instant(2026-10-17T13:42:05.120Z)");
    expect(formatValue("2026-10-17", display)).toBe("2026-10-17");
    expect(formatValue(42, display)).toBe("42");
    expect(formatValue(["a", "b"], display)).toBe('["a","b"]');
  });

  it("F15: the CSV changes cell joins the fields and keeps the masking", () => {
    const changes = presentChanges(
      {
        phoneMobile: { before: "+5511988881111", after: "+5511977772222" },
        fullName: { before: "Maria Souza", after: "Maria Souza Lima" },
        approvalPinHash: { before: "old-hash", after: "new-hash" },
      },
      { subjectAnonymized: false },
      display,
    );
    expect(changesText(changes, display)).toBe(
      "approvalPinHash: valor oculto | fullName: Maria Souza → Maria Souza Lima | phoneMobile: +5511988881111 → +5511977772222",
    );
  });

  it("F15: the CSV changes cell writes dado anonimizado for masked fields in pt-BR, en and es", () => {
    const recorded = {
      fullName: { before: "Joana Prado", after: "Joana Prado Lima" },
      mobilePhone: { before: "+5511955550000", after: "+5511944440000" },
      sex: { before: "NOT_INFORMED", after: "FEMALE" },
    };
    const expected = {
      "pt-BR": "fullName: dado anonimizado | mobilePhone: dado anonimizado | sex: NOT_INFORMED → FEMALE",
      en: "fullName: anonymized data | mobilePhone: anonymized data | sex: NOT_INFORMED → FEMALE",
      es: "fullName: dato anonimizado | mobilePhone: dato anonimizado | sex: NOT_INFORMED → FEMALE",
    };
    for (const [locale, values] of [
      ["pt-BR", ptBR.values],
      ["en", en.values],
      ["es", es.values],
    ] as const) {
      const own = displayOf(values);
      const changes = presentChanges(recorded, { subjectAnonymized: true }, own);
      expect(changesText(changes, own)).toBe(expected[locale]);
      expect(JSON.stringify(changes)).not.toContain("Joana");
    }
  });

  it("F15: metadata is flattened into display pairs and secret-like keys are hidden", () => {
    expect(
      presentMetadata(
        { permission: "audit:read", filters: { from: "2026-09-19", user: "ALL" }, rows: 37, pinHash: "x" },
        display,
      ),
    ).toEqual([
      { key: "permission", value: "audit:read" },
      { key: "filters.from", value: "2026-09-19" },
      { key: "filters.user", value: "ALL" },
      { key: "rows", value: "37" },
      { key: "pinHash", value: "valor oculto" },
    ]);
  });
});
