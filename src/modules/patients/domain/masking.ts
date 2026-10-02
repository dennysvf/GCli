// PRD F05: Front Desk sees the CPF masked except the last 5 digits in search results.
export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return "";
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// The last 4 phone digits tell namesakes apart without exposing the number (duplicate dialog).
export function phoneEnd(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}
