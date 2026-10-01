import { domainError } from "./errors";
import { fail, ok, type Result } from "./result";

// CPF value object (architecture 11.2), shared by professionals (F04) and patients (F05).
// Stored as 11 digits; two modulo-11 check digits; sequences of one repeated digit are invalid
// even though they pass the arithmetic.
export class Cpf {
  private constructor(readonly digits: string) {}

  static parse(input: string): Result<Cpf> {
    const digits = normalizeCpf(input);
    if (!isValidCpf(digits)) return fail(domainError("CPF_INVALID", 400));
    return ok(new Cpf(digits));
  }

  format(): string {
    return formatCpf(this.digits);
  }
}

export function normalizeCpf(input: string): string {
  return input.replace(/[.\-\s]/g, "");
}

function checkDigit(base: string): number {
  let sum = 0;
  const firstWeight = base.length + 1;
  for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (firstWeight - i);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const first = checkDigit(cpf.slice(0, 9));
  const second = checkDigit(cpf.slice(0, 9) + String(first));
  return cpf.slice(9) === `${first}${second}`;
}

// "000.000.000-00"; partial input is formatted as far as it goes (used by the masked input).
export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
  const head = parts.join(".");
  return digits.length > 9 ? `${head}-${digits.slice(9)}` : head;
}
