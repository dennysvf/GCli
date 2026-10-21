import { maskAnonymizedChanges } from "./mask-anonymized";

// Spec F15 decision D7: what the viewer and the CSV show of a recorded change. Pure: the texts and
// the instant format come from the caller, so this file holds only the rules.

export type ChangeKind = "value" | "sensitive" | "hidden" | "anonymized";

export type PresentedChange = {
  field: string;
  label: string;
  kind: ChangeKind;
  // Display strings for `value`; null otherwise (the values of other kinds are never sent).
  before: string | null;
  after: string | null;
  // Character counts of a clinical change (`sensitive`), as recorded by F07.
  beforeLength: number | null;
  afterLength: number | null;
};

export type PresentedMetadata = { key: string; value: string };

// Texts and formats of the requester's language and the organization's time zone.
export type ValueDisplay = {
  label(field: string): string;
  yes: string;
  no: string;
  empty: string;
  hidden: string;
  anonymized: string;
  instant(iso: string): string;
  sensitive(beforeLength: number, afterLength: number): string;
};

type Classified =
  | { field: string; kind: "value"; before: unknown; after: unknown }
  | { field: string; kind: "sensitive"; beforeLength: number; afterLength: number }
  | { field: string; kind: "hidden" }
  | { field: string; kind: "anonymized" };

// Defense in depth: a key with one of these words never shows its values, even when a writer forgot
// to leave them out (approvalPinHash, passwordHash, resetToken).
const SECRET_WORDS = new Set(["password", "pin", "token", "secret", "hash"]);

export function isSecretKey(key: string): boolean {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((word) => SECRET_WORDS.has(word));
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export function formatValue(value: unknown, display: ValueDisplay): string {
  if (value === null || value === undefined || value === "") return display.empty;
  if (typeof value === "boolean") return value ? display.yes : display.no;
  if (typeof value === "string") return INSTANT.test(value) ? display.instant(value) : value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function classify(field: string, change: unknown): Classified {
  if (isSecretKey(field)) return { field, kind: "hidden" };
  if (isRecord(change) && change.changed === true) {
    return {
      field,
      kind: "sensitive",
      beforeLength: typeof change.beforeLength === "number" ? change.beforeLength : 0,
      afterLength: typeof change.afterLength === "number" ? change.afterLength : 0,
    };
  }
  if (isRecord(change) && ("before" in change || "after" in change)) {
    return { field, kind: "value", before: change.before, after: change.after };
  }
  // Not the FieldChange shape: shown as the value it holds.
  return { field, kind: "value", before: null, after: change };
}

// The changes of an event, in a stable order (JSONB does not keep the recorded key order).
export function presentChanges(
  changes: unknown,
  options: { subjectAnonymized: boolean },
  display: ValueDisplay,
): PresentedChange[] {
  if (!isRecord(changes)) return [];
  const fields = Object.keys(changes).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const classified: Classified[] = fields.map((field) => classify(field, changes[field]));
  const shown = options.subjectAnonymized ? maskAnonymizedChanges(classified) : classified;
  return shown.map((change) => {
    const base = { field: change.field, label: display.label(change.field) };
    switch (change.kind) {
      case "value":
        return {
          ...base,
          kind: "value",
          before: formatValue(change.before, display),
          after: formatValue(change.after, display),
          beforeLength: null,
          afterLength: null,
        };
      case "sensitive":
        return {
          ...base,
          kind: "sensitive",
          before: null,
          after: null,
          beforeLength: change.beforeLength,
          afterLength: change.afterLength,
        };
      default:
        return {
          ...base,
          kind: change.kind,
          before: null,
          after: null,
          beforeLength: null,
          afterLength: null,
        };
    }
  });
}

// The single "Alterações" cell of the CSV: `field: before → after` entries joined by " | ", with the
// same masking as the side panel.
export function changesText(changes: PresentedChange[], display: ValueDisplay): string {
  return changes
    .map((change) => {
      switch (change.kind) {
        case "value":
          return `${change.field}: ${change.before ?? display.empty} → ${change.after ?? display.empty}`;
        case "sensitive":
          return `${change.field}: ${display.sensitive(change.beforeLength ?? 0, change.afterLength ?? 0)}`;
        case "hidden":
          return `${change.field}: ${display.hidden}`;
        case "anonymized":
          return `${change.field}: ${display.anonymized}`;
      }
    })
    .join(" | ");
}

// Metadata as display pairs; nested objects become dotted keys ("filters.from").
export function presentMetadata(metadata: unknown, display: ValueDisplay, prefix = ""): PresentedMetadata[] {
  if (!isRecord(metadata)) return [];
  const pairs: PresentedMetadata[] = [];
  for (const key of Object.keys(metadata)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = metadata[key];
    if (isSecretKey(key)) pairs.push({ key: path, value: display.hidden });
    else if (isRecord(value)) pairs.push(...presentMetadata(value, display, path));
    else if (Array.isArray(value))
      pairs.push({ key: path, value: value.map((item) => formatValue(item, display)).join(", ") });
    else if (value !== undefined) pairs.push({ key: path, value: formatValue(value, display) });
  }
  return pairs;
}
