// Keyset cursor of the timeline (spec decision D5): the position of the last event of a page, as
// (occurred at, id), with the list ordered newest first. Opaque to the browser; a tampered text is
// refused instead of guessed.
export type TimelineCursor = { at: Date; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

export function encodeCursor(cursor: TimelineCursor): string {
  return toBase64Url(JSON.stringify({ t: cursor.at.toISOString(), i: cursor.id }));
}

export function decodeCursor(text: string): TimelineCursor | null {
  const json = fromBase64Url(text);
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { t, i } = value as { t?: unknown; i?: unknown };
  if (typeof t !== "string" || typeof i !== "string" || !UUID.test(i)) return null;
  const at = new Date(t);
  if (Number.isNaN(at.getTime()) || at.toISOString() !== t) return null;
  return { at, id: i };
}
