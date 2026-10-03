// The document masks of PRD F05 and F16 live in the kernel (maskDocument): the CPF keeps its last
// 5 digits, other documents their last 4 characters.

// The last 4 phone digits tell namesakes apart without exposing the number (duplicate dialog).
export function phoneEnd(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}
