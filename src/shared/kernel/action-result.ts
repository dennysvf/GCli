import type { Result } from "./result";

// Envelope returned by every Server Action (spec F01 section 5).
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

export type MessageCatalog = Record<string, string>;

const GENERIC_MESSAGE = "Não foi possível concluir a operação. Tente novamente.";

export function toActionResult<T>(result: Result<T>, messages: MessageCatalog): ActionResult<T>;
export function toActionResult(result: Result<unknown>, messages: MessageCatalog): ActionResult<never>;
export function toActionResult<T>(result: Result<T>, messages: MessageCatalog): ActionResult<T> {
  if (result.ok) return { ok: true, data: result.value };
  const { code, fields } = result.error;
  const message = messages[code] ?? GENERIC_MESSAGE;
  return fields ? { ok: false, error: { code, message, fields } } : { ok: false, error: { code, message } };
}
