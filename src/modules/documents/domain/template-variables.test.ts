import { describe, expect, it } from "vitest";
import { analyzeTemplate, fieldLabel, substituteTemplate } from "./template-variables";

const label = (variable: string) => `<${variable}>`;

describe("template variables", () => {
  it("F08: parses variables and free fields in order of first use", () => {
    const result = analyzeTemplate(
      "<p>{{paciente.nome}} {{campo:dias}} {{ campo:hora_inicio }} {{paciente.nome}} {{campo:dias}} {{data_hoje}}</p>",
    );
    expect(result).toEqual({
      ok: true,
      variables: ["paciente.nome", "data_hoje"],
      fields: ["dias", "hora_inicio"],
    });
  });

  it("F08: refuses unknown variables and invalid field names", () => {
    expect(analyzeTemplate("<p>{{paciente.rg}}</p>")).toEqual({
      ok: false,
      problem: { code: "UNKNOWN_VARIABLE", variable: "paciente.rg" },
    });
    expect(analyzeTemplate("<p>{{campo:Dias}}</p>")).toEqual({
      ok: false,
      problem: { code: "INVALID_FIELD", field: "Dias" },
    });
    expect(analyzeTemplate(`<p>{{campo:${"a".repeat(41)}}}</p>`).ok).toBe(false);
    expect(analyzeTemplate("<p>{{campo:}}</p>").ok).toBe(false);
  });

  it("F08: text without tokens, or with a half-written token, is a valid template", () => {
    expect(analyzeTemplate("<p>Sem variáveis {{ aberta</p>")).toEqual({
      ok: true,
      variables: [],
      fields: [],
    });
  });

  it("F08: substitutes values with HTML escaping and marks missing ones", () => {
    const result = substituteTemplate("<p>{{paciente.nome}} / {{paciente.cpf}} / {{campo:dias}}</p>", {
      values: { "paciente.nome": "<b>Ana & Rita</b>", "paciente.cpf": null },
      fields: { dias: "  2  " },
      mode: "preview",
      label,
    });
    expect(result.html).toBe(
      '<p>&lt;b&gt;Ana &amp; Rita&lt;/b&gt; / <mark data-missing="paciente.cpf">&lt;paciente.cpf&gt;</mark> / 2</p>',
    );
    expect(result.missing).toEqual([{ variable: "paciente.cpf" }]);
  });

  it("F08: a missing value prints a blank line in the PDF and an empty free field is missing", () => {
    const result = substituteTemplate("<p>{{campo:dias}} e {{campo:dias}} e {{unidade.nome}}</p>", {
      values: { "unidade.nome": "Unidade Centro" },
      fields: { dias: "   " },
      mode: "pdf",
      label,
    });
    expect(result.html).toBe("<p>________ e ________ e Unidade Centro</p>");
    // Listed once, however many times it appears.
    expect(result.missing).toEqual([{ variable: "campo:dias" }]);
  });

  it("F08: a value that looks like a token is not substituted again", () => {
    const result = substituteTemplate("<p>{{paciente.nome}}</p>", {
      values: { "paciente.nome": "{{paciente.cpf}}", "paciente.cpf": "123" },
      fields: {},
      mode: "pdf",
      label,
    });
    expect(result.html).toBe("<p>{{paciente.cpf}}</p>");
  });

  it("F08: a free field gets a readable label", () => {
    expect(fieldLabel("dias_afastamento")).toBe("Dias afastamento");
    expect(fieldLabel("x")).toBe("X");
  });
});
