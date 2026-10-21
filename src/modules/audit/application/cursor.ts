// Keyset position of a page (spec F15 decision D2): an opaque base64url of "occurredAt|id". The
// instant keeps the database's microseconds, so a page never repeats or skips an event recorded in
// the same millisecond as the last one of the previous page.
export type AuditCursor = { occurredAt: string; id: string };

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(`${cursor.occurredAt}|${cursor.id}`, "utf8").toString("base64url");
}

// Null when the text is not a cursor this module wrote.
export function decodeCursor(text: string): AuditCursor | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(text)) return null;
  const decoded = Buffer.from(text, "base64url").toString("utf8");
  const [occurredAt = "", id = "", ...rest] = decoded.split("|");
  if (rest.length > 0 || !INSTANT.test(occurredAt) || !UUID.test(id)) return null;
  if (Number.isNaN(Date.parse(occurredAt))) return null;
  return { occurredAt, id };
}
