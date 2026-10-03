import type { Result } from "./result";

// Envelope returned by every Server Action (spec F01 section 5).
export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fields?: Record<string, string>;
        details?: Record<string, unknown>;
      };
    };

export type MessageCatalog = Record<string, string>;

const GENERIC_MESSAGE = "Não foi possível concluir a operação. Tente novamente.";

export function toActionResult<T>(result: Result<T>, messages: MessageCatalog): ActionResult<T>;
export function toActionResult(result: Result<unknown>, messages: MessageCatalog): ActionResult<never>;
export function toActionResult<T>(result: Result<T>, messages: MessageCatalog): ActionResult<T> {
  if (result.ok) return { ok: true, data: result.value };
  const { code, fields, params, details } = result.error;
  const message = interpolate(messages[code] ?? GENERIC_MESSAGE, params);
  return {
    ok: false,
    error: { code, message, ...(fields ? { fields } : {}), ...(details ? { details } : {}) },
  };
}

// Replaces {name} placeholders with error params; unknown placeholders are left as they are.
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
