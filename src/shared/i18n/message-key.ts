// A validation message is a catalog key, optionally with parameters: "validation.documentInvalid?type=CPF".
// Zod messages are plain strings, so parameters travel in the string and are read back where the
// message is translated (the Field component in the browser, fieldMessages on the server).
export function messageKey(key: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return key;
  return `${key}?${new URLSearchParams(params).toString()}`;
}

// Parameters that look like numbers are returned as numbers, so ICU can format them in the user's
// locale ("{max, number}"). Use it only for values written by our own schemas.
export function splitMessageKey(message: string): { key: string; params: Record<string, string | number> } {
  const index = message.indexOf("?");
  if (index < 0) return { key: message, params: {} };
  const params = Object.fromEntries(
    [...new URLSearchParams(message.slice(index + 1))].map(([name, value]) => [
      name,
      /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value,
    ]),
  );
  return { key: message.slice(0, index), params };
}
