import { fail, type Result } from "./result";

// Stable error codes shared across modules (spec F01 section 5). Module-specific codes are
// added by each module; the user-facing pt-BR text lives in the module's messages.ts.
export type DomainError = {
  code: string;
  httpStatus: number;
  fields?: Record<string, string>;
};

export function domainError(code: string, httpStatus: number, fields?: Record<string, string>): DomainError {
  return fields ? { code, httpStatus, fields } : { code, httpStatus };
}

export const CommonErrors = {
  validationFailed: (fields: Record<string, string>) => domainError("VALIDATION_FAILED", 400, fields),
  unauthenticated: () => domainError("AUTH_UNAUTHENTICATED", 401),
  forbidden: () => domainError("AUTHZ_FORBIDDEN", 403),
  staleVersion: () => domainError("CONFLICT_STALE_VERSION", 409),
  notFound: () => domainError("NOT_FOUND", 404),
} as const;

export function failWith<T = never>(error: DomainError): Result<T> {
  return fail(error);
}
