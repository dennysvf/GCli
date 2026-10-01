import { CommonErrors } from "@/shared/kernel/errors";

// Prisma maps @db.Date columns to Date at UTC midnight; validity dates are "YYYY-MM-DD" strings.
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Raw driver errors carry the violated constraint name in the message or metadata.
export function violatedConstraint(error: unknown): string {
  const candidate = error as { code?: string; message?: string; meta?: unknown };
  return `${candidate.code ?? ""} ${candidate.message ?? ""} ${JSON.stringify(candidate.meta ?? {})}`;
}

export const forbidden = CommonErrors.forbidden;
