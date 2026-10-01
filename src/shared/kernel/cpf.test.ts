import { describe, expect, it } from "vitest";
import { Cpf, formatCpf, isValidCpf } from "./cpf";

describe("Cpf", () => {
  it("F04: CPF accepts valid numbers with or without mask", () => {
    const masked = Cpf.parse("529.982.247-25");
    const plain = Cpf.parse("52998224725");
    expect(masked.ok && plain.ok).toBe(true);
    if (!masked.ok || !plain.ok) return;
    expect(masked.value.digits).toBe("52998224725");
    expect(plain.value.digits).toBe(masked.value.digits);
    expect(masked.value.format()).toBe("529.982.247-25");
  });

  it("F04: CPF rejects wrong check digits and repeated digits", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(Cpf.parse("abc").ok).toBe(false);
  });

  it("formats partial input while typing", () => {
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatCpf("5299822472")).toBe("529.982.247-2");
  });
});
