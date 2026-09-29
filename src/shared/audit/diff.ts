// Field-level before/after changes for the audit log (architecture 5.3). Sensitive fields
// (clinical text) are recorded only as "changed" with lengths, never with their content.
export type FieldChange =
  { before: unknown; after: unknown } | { changed: true; beforeLength: number; afterLength: number };

export type Changes = Record<string, FieldChange>;

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

function lengthOf(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

export function diffChanges<T extends Record<string, unknown>>(
  before: Partial<T> | null,
  after: Partial<T>,
  options: { fields?: (keyof T)[]; sensitive?: (keyof T)[] } = {},
): Changes {
  const keys = (options.fields ?? (Object.keys(after) as (keyof T)[])).filter((key) => key in after);
  const sensitive = new Set(options.sensitive ?? []);
  const changes: Changes = {};
  for (const key of keys) {
    const previous = normalize(before?.[key]);
    const next = normalize(after[key]);
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    changes[String(key)] = sensitive.has(key)
      ? { changed: true, beforeLength: lengthOf(previous), afterLength: lengthOf(next) }
      : { before: previous, after: next };
  }
  return changes;
}
