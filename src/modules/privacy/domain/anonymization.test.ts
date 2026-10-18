import { describe, expect, it } from "vitest";
import { isAnonymizationCode, namesMatch, newAnonymizationCode, placeholderName } from "./anonymization";

describe("anonymization confirmation", () => {
  it("F14: typed names match ignoring case, accents and extra spaces", () => {
    expect(namesMatch("Rafael Mendes Costa", "Rafael Mendes Costa")).toBe(true);
    expect(namesMatch("  rafael   MENDES costa ", "Rafael Mendes Costa")).toBe(true);
    expect(namesMatch("Joao Conceicao", "João Conceição")).toBe(true);
    expect(namesMatch("Helena Ramos", "Helena Duarte Ramos")).toBe(false);
    expect(namesMatch("", "Helena Duarte Ramos")).toBe(false);
    expect(namesMatch("Rafael Mendes Costa.", "Rafael Mendes Costa")).toBe(false);
  });

  it("F14: the placeholder name carries a six-character code", () => {
    const values = [0, 0.99, 0.5, 0.0625, 0.75, 0.3];
    let index = 0;
    const code = newAnonymizationCode(() => values[index++] ?? 0);
    expect(code).toBe("0F81C4");
    expect(isAnonymizationCode(code)).toBe(true);
    expect(placeholderName(code)).toBe("Paciente anonimizado #0F81C4");
    expect(placeholderName(code)).toMatch(/^Paciente anonimizado #[0-9A-F]{6}$/);
    expect(isAnonymizationCode(newAnonymizationCode(Math.random))).toBe(true);
    expect(isAnonymizationCode("a1b2c3")).toBe(false);
  });
});
