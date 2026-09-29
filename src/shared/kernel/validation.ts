import type { z } from "zod";
import { CommonErrors } from "./errors";
import { fail, ok, type Result } from "./result";

// Turns a Zod parse into a Result with field-level messages (first message per field).
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Result<z.infer<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_form";
    fields[key] ??= issue.message;
  }
  return fail(CommonErrors.validationFailed(fields));
}
